/**
 * digitale-assistent.js
 *
 * Client-side gedrag voor de Digitale Assistent (chat).
 * Praat met de Digitale-Assistent-backend via /chat/stream met Server-Sent
 * Events. De backend-URL komt uit window.MOZA_CHAT_API; standaard leeg ("")
 * = same-origin, zodat de nginx-proxy van de frontend naar de interne backend
 * stuurt (geen CORS). Lokaal zet `npm run dev` dit op http://localhost:8000.
 * De backend leeft in een eigen repo: github.com/MinBZK/moza-poc-digitale-assistent
 * Bewaart per LLM/transport-combinatie een sessie-id en gespreksgeschiedenis
 * zodat wisselen niet leidt tot verlies.
 */

(function () {
	"use strict";

	var form = document.getElementById("chat-form");
	if (!form) return;

	// Standaard same-origin (lege string = relatieve paden zoals /chat): in productie
	// proxyt de nginx van de frontend naar de interne backend, dus geen CORS nodig.
	// window.MOZA_CHAT_API is een optionele override (bv. lokaal: "http://localhost:8000").
	var API_BASE = typeof window.MOZA_CHAT_API === "string" ? window.MOZA_CHAT_API : "";
	var input = document.getElementById("chat-input");
	var messages = document.getElementById("chat-messages");
	var statusEl = document.getElementById("chat-status");
	var sessions = {};
	var chatHistory = {};
	var serverStatus = null;
	var submitting = false;
	var initialMessages = messages.innerHTML;

	// Twee conceptueel gescheiden categorieën:
	//  - capabilities (wat de assistent kan dóen) blijven inline bij de chat;
	//  - databronnen (waar de data over u vandaan komt) staan in een eigen paneel
	//    onder de chat.
	var CAPABILITY_LABELS = {
		regelrecht: "RegelRecht",
		rvo: "RVO",
	};

	var DATA_SOURCE_LABELS = {
		kvk: "KvK Handelsregister",
		koop: "KOOP Regelingenbank",
		netbeheerder: "Uw Wallet",
	};

	// Gecombineerd, zodat een rauwe tool-sleutel (server__tool) nooit ruw aan de
	// gebruiker wordt getoond maar als leesbaar label.
	var ALL_LABELS = Object.assign({}, DATA_SOURCE_LABELS, CAPABILITY_LABELS);

	function friendlyTool(message) {
		if (!message) return "";
		if (message.indexOf("__") === -1) return message; // al leesbaar
		var delen = message.split("__");
		var server = delen.shift();
		var rest = delen.join(" ").replace(/_/g, " ").trim();
		var label = ALL_LABELS[server] || server;
		return rest ? label + ": " + rest : label;
	}

	var ICON_FOUTMELDING = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">' + '<circle cx="12" cy="12" r="10.5" fill="currentColor"/>' + '<path class="icon-color-inverse" d="M15.12 7.71 12 10.48 8.88 7.71a.858.858 0 0 0-1.15.02c-.3.32-.31.81-.02 1.14L10.48 12l-2.77 3.12c-.29.33-.29.83.02 1.14.32.3.81.31 1.14.02L12 13.52l3.12 2.77c.33.29.83.28 1.14-.02.3-.32.31-.81.02-1.14L13.52 12l2.77-3.12c.29-.33.29-.83-.02-1.14a.848.848 0 0 0-1.15-.03M12 12.01l-.01-.01.01-.01.01-.01.01.01.01.01-.03.01z"/>' + "</svg>";

	var ICON_SUCCES = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">' + '<path fill="currentColor" fill-rule="evenodd" d="M22.04 3.78c-.16-.95-.88-1.67-1.83-1.83-2.73-.45-7.3-.45-8.21-.45-.91 0-5.48 0-8.22.46-.95.15-1.67.87-1.82 1.82C1.5 6.52 1.5 11.09 1.5 12s0 5.48.46 8.22c.16.95.88 1.67 1.83 1.83 2.74.46 7.3.46 8.22.46.91 0 5.48 0 8.22-.46.95-.16 1.67-.88 1.83-1.83.46-2.74.46-7.3.46-8.22-.02-2.74-.02-5.48-.48-8.22z M16.5 7.35a.755.755 0 0 0-1.01.1l-4.4 4.95-2.65-2.3a.743.743 0 0 0-.97 0c-.28.24-.35.65-.16.97l3.2 5.38c.14.23.38.37.64.37s.51-.14.64-.36l4.89-8.09c.21-.35.13-.78-.18-1.02z"/>' + "</svg>";

	function getLLM() {
		return localStorage.getItem("setting:llm") || "vlam";
	}

	function getTransport() {
		return localStorage.getItem("setting:transport") || "mcp";
	}

	function getComboKey() {
		return getLLM() + ":" + getTransport();
	}

	function getAPIMode() {
		var transport = getTransport();
		if (transport === "cli") return "cli:" + getLLM();
		return getLLM();
	}

	function parseMarkdown(text) {
		var lines = text.split("\n");
		var html = [];
		var inList = false;

		for (var i = 0; i < lines.length; i++) {
			var line = lines[i].replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

			// Headers
			if (/^#### (.+)$/.test(line)) {
				line = "<strong>" + line.replace(/^#### /, "") + "</strong>";
			} else if (/^### (.+)$/.test(line)) {
				line = "<strong>" + line.replace(/^### /, "") + "</strong>";
			} else if (/^## (.+)$/.test(line)) {
				line = "<strong>" + line.replace(/^## /, "") + "</strong>";
			} else if (/^# (.+)$/.test(line)) {
				line = "<strong>" + line.replace(/^# /, "") + "</strong>";
			}

			// List items
			if (/^[-*] (.+)$/.test(line)) {
				if (!inList) {
					html.push("<ul>");
					inList = true;
				}
				line = "<li>" + line.replace(/^[-*] /, "") + "</li>";
			} else if (inList) {
				html.push("</ul>");
				inList = false;
			}

			// Inline formatting
			line = line
				.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
				.replace(/\*(.+?)\*/g, "<em>$1</em>")
				.replace(/`(.+?)`/g, "<code>$1</code>")
				.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

			html.push(line);
		}

		if (inList) html.push("</ul>");
		return html
			.join("<br>")
			.replace(/<br><ul>/g, "<ul>")
			.replace(/<\/ul><br>/g, "</ul>")
			.replace(/<br><li>/g, "<li>")
			.replace(/<\/li><br><li>/g, "</li><li>");
	}

	function addMessage(text, role) {
		var div = document.createElement("div");
		var p = document.createElement("p");
		if (role === "error") {
			div.className = "feedback feedback-error";
			var content = document.createElement("div");
			p.textContent = text;
			content.appendChild(p);
			div.innerHTML = ICON_FOUTMELDING;
			div.appendChild(content);
		} else {
			div.className = "chat-message chat-message-" + role;
			if (role === "assistant") {
				p.innerHTML = parseMarkdown(text);
			} else {
				p.textContent = text;
			}
			div.appendChild(p);
		}
		messages.appendChild(div);
		messages.scrollTop = messages.scrollHeight;
	}

	// Bewaar een zaak uit het case-event in localStorage (key "zaken"). De
	// gegevens komen uit de case-payload van de backend; we voegen alleen een id
	// en tijdstip toe. Idempotent op een stabiele sleutel uit de payload, zodat
	// hetzelfde case-event geen duplicaat oplevert.
	function addZaak(payload) {
		if (!payload || typeof payload !== "object") return null;
		var KEY = "zaken";
		var lijst;
		try {
			lijst = JSON.parse(localStorage.getItem(KEY)) || [];
		} catch (e) {
			lijst = [];
		}
		var sleutel = payload.id || payload.case_id || payload.zaaknummer || payload.type;
		if (sleutel) {
			var bestaat = lijst.some(function (z) {
				return (z.id || z.case_id || z.zaaknummer || z.type) === sleutel;
			});
			if (bestaat) return null;
		}
		var zaak = Object.assign({ aangemaaktOp: Date.now() }, payload);
		if (!zaak.id) zaak.id = sleutel || "zaak-" + zaak.aangemaaktOp;
		lijst.push(zaak);
		try {
			localStorage.setItem(KEY, JSON.stringify(lijst));
		} catch (e) {
			/* localStorage niet toegankelijk */
		}
		// Laat lopende-zaken.js de side-nav badge direct bijwerken.
		try {
			window.dispatchEvent(new Event("zaken-changed"));
		} catch (e) {
			/* Event niet ondersteund */
		}
		return zaak;
	}

	function setLoading(loading) {
		var btn = form.querySelector("button");
		if (loading) {
			btn.setAttribute("aria-disabled", "true");
			showThinking("Vraag analyseren…");
		} else {
			btn.removeAttribute("aria-disabled");
			hideThinking();
		}
	}

	function showThinking(text) {
		var el = messages.querySelector(".chat-message-thinking");
		if (!el) {
			el = document.createElement("div");
			el.className = "chat-message chat-message-thinking chat-message-assistant";
			el.innerHTML = '<p class="thinking-text"></p>';
			messages.appendChild(el);
		}
		el.querySelector(".thinking-text").textContent = text;
		messages.scrollTop = messages.scrollHeight;
	}

	function hideThinking() {
		var el = messages.querySelector(".chat-message-thinking");
		if (el) el.remove();
	}

	// --- Wallet (EU Business Wallet, mock): deelverzoek + gestructureerde energieweergave ---

	var KWH_GRENS = 50000;
	var GAS_GRENS = 25000;

	function escapeHTML(value) {
		return String(value == null ? "" : value)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	// Herkent het netbeheerder__verbruik tool-event met een Wallet-credential.
	// Retourneert { data, provenance } of null als dit geen Wallet-verbruik-event is.
	function walletPayload(payload) {
		if (!payload) return null;
		var naam = payload.tool || payload.name || payload.message || "";
		if (!/netbeheerder__verbruik/.test(naam) && !(/netbeheerder/.test(naam) && /verbruik/.test(naam))) return null;
		var data = payload.data || (payload.result && payload.result.data) || null;
		if (!data || !data.verbruik) return null;
		var provenance = payload.provenance || (payload.result && payload.result.provenance) || {};
		return { data: data, provenance: provenance };
	}

	function walletCijfer(label, waarde, eenheid, boven, grens) {
		var grensClass = boven ? "wallet-grens-boven" : "wallet-grens-onder";
		var grensTekst = (boven ? "boven" : "onder") + " de grens van " + grens + " " + eenheid;
		return '<div class="wallet-cijfer"><dt>' + escapeHTML(label) + "</dt>" + '<dd><span class="wallet-waarde">' + escapeHTML(waarde) + " " + escapeHTML(eenheid) + "</span>" + '<span class="wallet-grens ' + grensClass + '">' + grensTekst + "</span></dd></div>";
	}

	// Gestructureerde energiekaart uit de Wallet-credential (verborgen tot "Delen").
	function buildWalletEnergie(data, provenance) {
		data = data || {};
		var cred = data.credential || {};
		var totaal = (data.verbruik && data.verbruik.totaal) || {};
		var kwh = Number(totaal.jaarlijks_elektriciteitsverbruik_kwh || 0);
		var m3 = Number(totaal.jaarlijks_gasverbruik_m3 || 0);
		var uitgever = cred.uitgegeven_door || (provenance && provenance.issuer) || "je netbeheerder";
		var peiljaar = cred.peiljaar;
		var metToestemming = !!(data.toestemming && data.toestemming.met_toestemming_ondernemer);

		var el = document.createElement("div");
		el.className = "wallet-energie";
		el.hidden = true;

		var badge = metToestemming ? '<span class="wallet-badge">' + ICON_SUCCES + "geverifieerd · met toestemming gedeeld</span>" : "";
		var uitgeverRegel = "Afgegeven door: " + escapeHTML(uitgever) + (peiljaar ? " · peiljaar " + escapeHTML(peiljaar) : "");

		el.innerHTML = '<h3 tabindex="-1">Energieverbruik (uit je Wallet)</h3>' + '<p class="wallet-uitgever">' + uitgeverRegel + " " + badge + "</p>" + '<dl class="wallet-cijfers">' + walletCijfer("Elektriciteit", kwh.toLocaleString("nl-NL"), "kWh", kwh > KWH_GRENS, KWH_GRENS.toLocaleString("nl-NL")) + walletCijfer("Gas", m3.toLocaleString("nl-NL"), "m³", m3 > GAS_GRENS, GAS_GRENS.toLocaleString("nl-NL")) + "</dl>" + '<p class="wallet-bron">bron: Wallet</p>';
		return el;
	}

	// Deelverzoek-kaart: één .wallet-card met de vraag + (verborgen) energiekaart + notitie.
	// Alles staat direct in de DOM, zodat het de innerHTML-save/restore van handleSwitch overleeft.
	function renderWalletConsent(data, provenance) {
		var card = document.createElement("div");
		card.className = "wallet-card";

		var vraag = document.createElement("div");
		vraag.className = "wallet-consent";
		vraag.innerHTML = "<h3>Deelverzoek uit je Wallet</h3>" + "<p>De assistent wil je energieverbruik-attestatie uit je Wallet gebruiken (afgegeven door je netbeheerder). Je bepaalt zelf of je deze gegevens deelt.</p>" + '<div class="wallet-acties"><button type="button" class="wallet-delen">Delen</button><button type="button" class="secondary wallet-niet-delen">Niet delen</button></div>';
		card.appendChild(vraag);

		card.appendChild(buildWalletEnergie(data, provenance));

		var nietGedeeld = document.createElement("div");
		nietGedeeld.className = "wallet-niet-gedeeld";
		nietGedeeld.hidden = true;
		nietGedeeld.innerHTML = "<p>Je hebt je energieverbruik niet gedeeld. De assistent kan de informatieplicht dan niet automatisch met je Wallet-gegevens controleren.</p>";
		card.appendChild(nietGedeeld);

		messages.appendChild(card);
		messages.scrollTop = messages.scrollHeight;
		return card;
	}

	function renderStatus(data) {
		var offline = document.getElementById("chat-offline");
		if (offline) offline.hidden = true;
		serverStatus = data;
		updateStatusDisplay();
	}

	function updateStatusDisplay() {
		if (!serverStatus) return;
		var transport = getTransport();
		var sources = transport === "cli" ? serverStatus.cli : serverStatus.servers;
		if (!sources) sources = {};
		// In de chat tonen we alleen de capabilities (wat de assistent kan doen).
		var keys = Object.keys(sources).filter(function (key) {
			return CAPABILITY_LABELS[key];
		});
		if (keys.length === 0) {
			statusEl.innerHTML = '<p class="chat-status-warning">Geen mogelijkheden verbonden; de assistent antwoordt op basis van eigen kennis.</p>';
		} else {
			var items = keys.map(function (key) {
				var connected = sources[key] === "verbonden";
				var dot = connected ? "connected" : "disconnected";
				var icon = connected ? ICON_SUCCES : ICON_FOUTMELDING;
				return '<li class="chat-status-' + dot + '">' + icon + CAPABILITY_LABELS[key] + "</li>";
			});
			statusEl.innerHTML = '<p>Wat de assistent voor u kan doen:</p><ul class="list-plain">' + items.join("") + "</ul>";
		}
		// Databronnen staan in een eigen paneel; status altijd uit servers (niet cli).
		updateDataSources(serverStatus.servers);
	}

	// Werkt het paneel "Uw gegevensbronnen" (onder de chat) bij met de live status.
	function updateDataSources(servers) {
		document.querySelectorAll("[data-databron]").forEach(function (card) {
			var key = card.getAttribute("data-databron");
			var el = card.querySelector("[data-databron-status]");
			if (!el) return;
			var verbonden = !!(servers && servers[key] === "verbonden");
			el.className = "databron-status " + (verbonden ? "connected" : "disconnected");
			el.innerHTML = (verbonden ? ICON_SUCCES : ICON_FOUTMELDING) + (verbonden ? "Verbonden" : "Niet verbonden");
		});
	}

	function renderStatusOffline() {
		var offline = document.getElementById("chat-offline");
		if (offline) offline.hidden = false;
		var items = Object.keys(CAPABILITY_LABELS).map(function (key) {
			return '<li class="chat-status-disconnected">' + ICON_FOUTMELDING + CAPABILITY_LABELS[key] + "</li>";
		});
		statusEl.innerHTML = '<ul class="list-plain">' + items.join("") + "</ul>";
		updateDataSources(null);
	}

	// Haal status op bij laden (3s timeout zodat de pagina niet hangt als de host niet draait)
	fetch(API_BASE + "/health", { signal: AbortSignal.timeout(3000) })
		.then(function (r) {
			return r.json();
		})
		.then(renderStatus)
		.catch(renderStatusOffline);

	// Bewaar en herstel gesprek bij wisselen van LLM of transport
	var previousCombo = getComboKey();

	function handleSwitch() {
		if (submitting) return;

		var prev = previousCombo;
		var next = getComboKey();
		if (prev === next) return;

		previousCombo = next;
		chatHistory[prev] = messages.innerHTML;

		if (chatHistory[next]) {
			messages.innerHTML = chatHistory[next];
		} else {
			messages.innerHTML = initialMessages;
		}
		messages.scrollTop = messages.scrollHeight;
		updateStatusDisplay();
	}

	window.addEventListener("setting-changed", handleSwitch);

	// Suggestie-chips: vul het invoerveld en verstuur direct.
	messages.addEventListener("click", function (e) {
		var chip = e.target.closest(".chat-suggestion");
		if (!chip || submitting) return;
		input.value = chip.textContent.trim();
		input.focus();
		form.requestSubmit();
	});

	// Wallet-deelverzoek: Delen toont de energiekaart, Niet delen toont de notitie.
	messages.addEventListener("click", function (e) {
		var card = e.target.closest(".wallet-card");
		if (!card) return;
		if (e.target.closest(".wallet-delen")) {
			card.querySelector(".wallet-consent").hidden = true;
			var energie = card.querySelector(".wallet-energie");
			energie.hidden = false;
			messages.scrollTop = messages.scrollHeight;
			var kop = energie.querySelector("h3");
			if (kop) kop.focus();
		} else if (e.target.closest(".wallet-niet-delen")) {
			card.querySelector(".wallet-consent").hidden = true;
			card.querySelector(".wallet-niet-gedeeld").hidden = false;
			messages.scrollTop = messages.scrollHeight;
		}
	});

	input.addEventListener("input", function () {
		this.style.blockSize = "auto";
		this.style.blockSize = this.scrollHeight + "px";
	});

	input.addEventListener("keydown", function (e) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			form.requestSubmit();
		}
	});

	form.addEventListener("submit", async function (e) {
		e.preventDefault();
		var message = input.value.trim();
		if (!message || submitting) return;

		// Leg mode en combo vast op moment van verzenden
		var mode = getAPIMode();
		var comboKey = getComboKey();

		submitting = true;
		addMessage(message, "user");
		input.value = "";
		input.style.blockSize = "auto";
		setLoading(true);

		var answered = false;

		// Timeout-bescherming: 60s om verbinding te maken, 90s stilte tijdens streamen
		var controller = new AbortController();
		var connectTimer = setTimeout(function () {
			controller.abort("connect-timeout");
		}, 60_000);
		var idleTimer = null;
		function resetIdleTimer() {
			if (idleTimer) clearTimeout(idleTimer);
			idleTimer = setTimeout(function () {
				controller.abort("idle-timeout");
			}, 90_000);
		}

		try {
			var response = await fetch(API_BASE + "/chat/stream", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-VLAM-API-Key": localStorage.getItem("setting:vlam-api-key") || "",
					"X-Claude-API-Key": localStorage.getItem("setting:claude-api-key") || "",
				},
				body: JSON.stringify({
					message: message,
					session_id: sessions[comboKey],
					mode: mode,
				}),
				signal: controller.signal,
			});

			clearTimeout(connectTimer);
			if (!response.ok) {
				var httpErr = new Error("http-error");
				httpErr.status = response.status;
				throw httpErr;
			}

			var reader = response.body.getReader();
			var decoder = new TextDecoder();
			var buffer = "";
			resetIdleTimer();

			while (true) {
				var chunk = await reader.read();
				if (chunk.done) break;
				resetIdleTimer();
				buffer += decoder.decode(chunk.value, { stream: true });

				var parts = buffer.split("\n\n");
				buffer = parts.pop();

				for (var i = 0; i < parts.length; i++) {
					var block = parts[i].trim();
					if (!block) continue;

					var eventType = "message";
					var dataLine = "";
					var lines = block.split("\n");
					for (var j = 0; j < lines.length; j++) {
						if (lines[j].indexOf("event: ") === 0) eventType = lines[j].slice(7);
						if (lines[j].indexOf("data: ") === 0) dataLine = lines[j].slice(6);
					}
					if (!dataLine) continue;

					var payload = JSON.parse(dataLine);

					if (eventType === "status") {
						showThinking(friendlyTool(payload.message));
					} else if (eventType === "tool") {
						var wallet = walletPayload(payload);
						if (wallet) {
							hideThinking();
							renderWalletConsent(wallet.data, wallet.provenance);
						} else {
							showThinking(friendlyTool(payload.message) + "...");
						}
					} else if (eventType === "case") {
						// Backend stuurt de zaak-data; bewaar die als zaak in localStorage.
						addZaak(payload);
					} else if ((eventType === "answer" || eventType === "error") && !answered) {
						answered = true;
						hideThinking();
						if (payload.session_id) sessions[comboKey] = payload.session_id;
						var role = eventType === "error" ? "error" : "assistant";
						// Toon alleen als gebruiker nog in dezelfde combinatie zit
						if (getComboKey() === comboKey) {
							addMessage(payload.message, role);
						} else {
							// Sla op in chatHistory zodat het zichtbaar wordt bij terugwisselen
							var temp = messages.innerHTML;
							messages.innerHTML = chatHistory[comboKey] || "";
							addMessage(payload.message, role);
							chatHistory[comboKey] = messages.innerHTML;
							messages.innerHTML = temp;
						}
					} else if (eventType === "done") {
						hideThinking();
					}
				}
			}

			setLoading(false);
		} catch (err) {
			setLoading(false);
			if (!answered) {
				var reason;
				if (err && err.name === "AbortError") {
					reason = "De assistent reageerde te lang niet. Probeer het opnieuw.";
				} else if (err && err.status === 401) {
					reason = "Uw API-sleutel ontbreekt of is onjuist. Controleer de sleutel in het instellingenpaneel.";
				} else if (err && err.status === 403) {
					reason = "Uw API-sleutel heeft geen toegang tot deze backend.";
				} else if (err && err.status >= 500) {
					reason = "De assistent heeft een technisch probleem. Probeer het later opnieuw.";
				} else {
					reason = "De assistent is niet bereikbaar. Controleer uw internetverbinding en probeer het opnieuw.";
				}
				addMessage(reason, "error");
			}
		} finally {
			clearTimeout(connectTimer);
			if (idleTimer) clearTimeout(idleTimer);
			submitting = false;
		}
	});

	// Demo/test-hook: toon de Wallet-flow zonder backend met de voorbeeld-credential.
	// Staat los van de live SSE-flow; handig om de kaart te demonstreren of te testen.
	window.MozaWallet = {
		toon: renderWalletConsent,
		demo: function () {
			return renderWalletConsent(
				{
					beschikbaar: true,
					credential: { type: "EnergieverbruikAttestatie", uitgegeven_door: "Stedin (mock)", houder: { kvk_nummer: "85234567" }, peiljaar: 2025 },
					toestemming: { gedeeld_via: "EU Business Wallet (mock)", met_toestemming_ondernemer: true },
					verbruik: { totaal: { jaarlijks_elektriciteitsverbruik_kwh: 61250, jaarlijks_gasverbruik_m3: 9800 }, aansluitingen: [] },
				},
				{ source: "EU Business Wallet (mock)", issuer: "Netbeheerder (mock, uitgever)" }
			);
		},
	};

	// Startvraag via URL-parameter (?vraag=…), bijvoorbeeld vanuit de
	// notificatie op het dashboard. Vult het invoerveld en verstuurt direct,
	// zodat het gesprek zonder extra klik begint.
	var startvraag = new URLSearchParams(location.search).get("vraag");
	if (startvraag && startvraag.trim()) {
		input.value = startvraag.trim();
		form.requestSubmit();
	}
})();
