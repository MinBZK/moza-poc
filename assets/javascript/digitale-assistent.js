/**
 * digitale-assistent.js
 *
 * Client-side gedrag voor de Digitale Assistent (chat).
 * Praat met de Digitale-Assistent-backend via /chat/stream met Server-Sent
 * Events. De backend-URL komt uit window.MOZA_CHAT_API; standaard leeg ("")
 * = same-origin, zodat de nginx-proxy van de frontend naar de interne backend
 * stuurt (geen CORS). Lokaal zet `npm run dev` dit op http://localhost:8000.
 * De backend leeft in een eigen repo: github.com/MinBZK/moza-poc-digitale-assistent
 * Bewaart per LLM/transport/persona-combinatie een sessie-id en gespreksgeschiedenis
 * zodat wisselen niet leidt tot verlies.
 * De bedrijfsidentiteit gaat als KvK-nummer van de actieve persona mee in de
 * X-Test-User-header; de backend toetst dat aan zijn allowlist (TEST_KVK_NUMMERS)
 * en injecteert het server-side bij elke bronaanroep. Staat het nummer daar niet
 * in, dan antwoordt de assistent "log eerst in".
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
	var serverStatus = null;
	var submitting = false;
	var initialMessages = messages.innerHTML;

	// Het gesprek overleeft navigatie binnen hetzelfde tabblad: wie naar Lopende
	// zaken klikt en terugkomt, vindt zijn gesprek terug. Bewust sessionStorage
	// en geen localStorage — bij het sluiten van het tabblad is het weg, zodat er
	// geen gesprek achterblijft op een gedeelde computer.
	var OPSLAG_SESSIES = "chat:sessions";
	var OPSLAG_HISTORIE = "chat:history";

	function lees(sleutel) {
		try {
			return JSON.parse(sessionStorage.getItem(sleutel)) || {};
		} catch (e) {
			return {};
		}
	}

	function schrijf(sleutel, waarde) {
		try {
			sessionStorage.setItem(sleutel, JSON.stringify(waarde));
		} catch (e) {
			/* privémodus of vol: het gesprek leeft dan alleen in het geheugen */
		}
	}

	var sessions = lees(OPSLAG_SESSIES);
	var chatHistory = lees(OPSLAG_HISTORIE);
	var ONBOARDING_SEEN_KEY = "chat:onboarding-seen";

	function heeftOnboardingGezien() {
		try {
			return localStorage.getItem(ONBOARDING_SEEN_KEY) === "true";
		} catch (e) {
			return false;
		}
	}

	function markeerOnboardingGezien() {
		try {
			localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
		} catch (e) {
			/* privé-/beperkte modus */
		}
	}

	// Onboarding-ballonnen die één voor één verschijnen
	var onboardingMessages = [
		"<p>Hallo, ik ben de digitale assistent van MijnOverheid Zakelijk. Ik help u bij uw vragen en taken.</p>",
		"<p>Ik kan bijvoorbeeld helpen met:</p><ul class=\"list-indent\"><li>het opzoeken van uw bedrijfsgegevens</li><li>regels en wetten opzoeken die relevant voor u kunnen zijn</li><li>voorbereiden van uw belastingaangiften</li></ul>",
		"<p>Ik haal uw gegevens pas op <strong>nadat u hier expliciet toestemming voor geeft</strong>.</p>",
		"<p>Ik raadpleeg onder meer het KvK Handelsregister, KOOP Regelingenbank, RegelRecht en de RVO.</p>",
		"<p>Elk antwoord is traceerbaar en toont de bron.</p>",
		"<p>Raadpleeg een adviseur of de bevoegde instantie indien u juridisch advies nodig heeft.</p>"
	];
	var exampleQuestions = [
		"Geldt de energiebesparingsinformatieplicht voor mij?",
		"Hoe kan ik mijn bedrijfsgegevens bekijken?",
		"Hoe bereid ik mijn belastingaangifte voor?"
	];

	function addAssistantMessage(html) {
		var div = document.createElement("div");
		div.className = "chat-message chat-message-assistant";
		div.innerHTML = html;
		messages.appendChild(div);
		messages.scrollTop = messages.scrollHeight;
	}

	function addSuggestionButtons() {
		var wrapper = document.createElement("div");
		wrapper.className = "chat-suggestions";
		var intro = document.createElement("p");
		intro.className = "chat-suggestions-label";
		intro.textContent = "Stel uw vraag, of probeer bijvoorbeeld:";
		wrapper.appendChild(intro);
		exampleQuestions.forEach(function (question) {
			var button = document.createElement("button");
			button.type = "button";
			button.className = "chat-suggestion secondary";
			button.textContent = question;
			wrapper.appendChild(button);
		});
		if (wrapper.dataset.showReplay === "true") {
			var replay = document.createElement("button");
			replay.type = "button";
			replay.className = "secondary chat-show-onboarding";
			replay.textContent = "Toon opnieuw de uitleg.";
			wrapper.appendChild(replay);
		}
		messages.appendChild(wrapper);
	}

	function showSuggestionPrompt(includeReplayButton) {
		var suggestions = document.createElement("div");
		suggestions.className = "chat-suggestions";
		var intro = document.createElement("p");
		intro.className = "chat-suggestions-label";
		intro.textContent = "Stel uw vraag, of probeer bijvoorbeeld:";
		suggestions.appendChild(intro);
		exampleQuestions.forEach(function (question) {
			var button = document.createElement("button");
			button.type = "button";
			button.className = "chat-suggestion secondary";
			button.textContent = question;
			suggestions.appendChild(button);
		});
		if (includeReplayButton) {
			var replay = document.createElement("button");
			replay.type = "button";
			replay.className = "secondary chat-show-onboarding";
			replay.textContent = "Toon opnieuw de uitleg.";
			suggestions.appendChild(replay);
		}
		messages.appendChild(suggestions);
	}

	function verwijderSuggestieIntro() {
		var replayIntro = messages.querySelector(".chat-replay-intro");
		if (replayIntro) replayIntro.remove();
		var suggestions = messages.querySelector(".chat-suggestions");
		if (suggestions) suggestions.remove();
	}

	async function showOnboardingMessages() {
		verwijderSuggestieIntro();
		for (var i = 0; i < onboardingMessages.length; i++) {
			// Toon wait-indicator
			showThinking("");
			await wait(1600);

			// Verberg indicator en toon bericht
			hideThinking();
			addAssistantMessage(onboardingMessages[i]);

			// Pauze voordat volgende ballon komt
			await wait(800);
		}
		showThinking("");
		await wait(700);
		hideThinking();
		showSuggestionPrompt(heeftOnboardingGezien());
		// Na onboarding: sla de initiële state op voor "Nieuw gesprek"
		initialMessages = messages.innerHTML;
	}

	function bewaarSessies() {
		schrijf(OPSLAG_SESSIES, sessions);
	}

	// Alleen de zichtbare combinatie wordt bijgewerkt; de andere blijven staan
	// zoals ze bij het wisselen zijn weggeschreven.
	function bewaarHistorie(combo, html) {
		chatHistory[combo] = typeof html === "string" ? html : messages.innerHTML;
		schrijf(OPSLAG_HISTORIE, chatHistory);
	}

	// De assistent "denkt" kort voordat die iets nieuws zegt: dezelfde
	// wait-indicator als tijdens de onboarding, zodat een nieuw gesprek, een
	// wissel of een volgende page-load niet abrupt met kant-en-klare tekst
	// begint. Het token laat een snel opvolgende wachtbeurt de vorige afbreken.
	// Bij het laden van de pagina langer wachten dan bij een wissel: de eerste
	// verf komt pas na het opbouwen van de pagina, dus een korte wachttijd is dan
	// al voorbij voordat de indicator te zien is.
	var WACHT_KORT = 700;
	var WACHT_PAGINALAAD = 1600;
	var wachtToken = 0;
	function naWachten(callback, duur) {
		var eigenToken = ++wachtToken;
		showThinking("");
		// Pas na de eerstvolgende verf de klok starten, anders telt de tijd die de
		// browser nog aan de pagina besteedt mee als wachttijd.
		requestAnimationFrame(function () {
			requestAnimationFrame(function () {
				if (eigenToken !== wachtToken) return;
				setTimeout(function () {
					if (eigenToken !== wachtToken) return;
					hideThinking();
					callback();
				}, duur || WACHT_KORT);
			});
		});
	}

	function nieuwGesprek() {
		var combo = getComboKey();
		delete sessions[combo];
		delete chatHistory[combo];
		bewaarSessies();
		schrijf(OPSLAG_HISTORIE, chatHistory);
		messages.innerHTML = "";
		messages.scrollTop = 0;
		input.value = "";
		verwijderSuggestieIntro();
		heeftGesprek = false;
		disableNieuwKnop();
		input.focus();
		naWachten(function () {
			showSuggestionPrompt(true);
		});
	}

	// Leesbare labels per backend-sleutel, gecombineerd in ALL_LABELS voor friendlyTool.
	var CAPABILITY_LABELS = {
		regelrecht: "RegelRecht",
		rvo: "RVO",
	};

	var DATA_SOURCE_LABELS = {
		kvk: "KvK Handelsregister",
		koop: "KOOP Regelingenbank",
		netbeheerder: "Business Wallet",
	};

	// Wat de assistent gebruikt — in de chat getoond: capabilities + alle databronnen,
	// op één plek, met live verbindingsstatus uit /health.
	// `uitleg` zegt wat de bron voor de gebruiker doet; de statuszin komt er per
	// bron achteraan. Samen vormen ze de beschrijving achter het bolletje.
	var STATUS_ITEMS = [
		{ key: "regelrecht", label: "RegelRecht", uitleg: "Rekent uit welke regels voor uw bedrijf gelden." },
		{ key: "rvo", label: "RVO", uitleg: "Neemt uw rapportage in ontvangst." },
		{ key: "netbeheerder", label: "Business Wallet", uitleg: "Levert uw energieverbruik, afgegeven door uw netbeheerder." },
		{ key: "kvk", label: "KvK Handelsregister", uitleg: "Levert de gegevens van uw onderneming." },
		{ key: "koop", label: "KOOP Regelingenbank", uitleg: "Levert de officiële wetteksten." },
	];

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
		return localStorage.getItem("setting:llm") || "claude";
	}

	function getTransport() {
		return localStorage.getItem("setting:transport") || "mcp";
	}

	function getDemoMode() {
		return localStorage.getItem("setting:demo-mode") === "true";
	}

	function wait(ms) {
		return new Promise(function (resolve) {
			setTimeout(resolve, ms);
		});
	}

	// KvK-nummer van de actieve persona; de backend toetst dit aan zijn allowlist
	// (env TEST_KVK_NUMMERS daar) en injecteert het bij elke bronaanroep. Het
	// Flags-paneel kan een nummer forceren, handig om een nummer buiten de
	// allowlist te testen. Geen persona of geen nummer = lege header; de backend
	// antwoordt dan met "log eerst in". Dit is geen authenticatie: de header is in
	// de browser aan te passen. Zie README → Sessie-identiteit.
	function getTestUser() {
		var override = localStorage.getItem("setting:test-user-kvk");
		if (override) return override.trim();
		var persona = getPersona();
		// Als string, zodat een eventuele voorloopnul niet wegvalt.
		return persona && persona.bedrijf ? String(persona.bedrijf.kvkNummer || "") : "";
	}

	function getPersona() {
		return (window.Personas && window.Personas.actief()) || null;
	}

	function getPersonaId() {
		var persona = getPersona();
		return (persona && persona.id) || "";
	}

	// De persona hoort bij de sleutel: wisselt de identiteit, dan hoort daar een
	// eigen session_id en gespreksgeschiedenis bij, zodat het gesprek van de
	// vorige persona niet doorloopt.
	function getComboKey() {
		return getLLM() + ":" + getTransport() + ":" + getPersonaId();
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
		return div;
	}

	// Vervolgstap onder een bericht: alleen tonen als die ook echt klopt bij wat
	// er net gebeurde. Een knop die altijd staat, wijst de gebruiker net zo vaak
	// de verkeerde kant op als de goede.
	function voegVervolgstapToe(bericht, label, url) {
		if (!bericht || !url) return;
		// Bij een foutmelding staat de tekst in een binnenste div naast het icoon.
		var doel = bericht.classList.contains("feedback") ? bericht.lastElementChild : bericht;
		var acties = document.createElement("div");
		acties.className = "chat-actions";
		var link = document.createElement("a");
		link.className = "btn-cta";
		link.href = url;
		link.textContent = label;
		acties.appendChild(link);
		doel.appendChild(acties);
		messages.scrollTop = messages.scrollHeight;
	}

	// Bewaar een zaak uit het case-event in localStorage (key "zaken"). De
	// gegevens (de lopende_zaak van de backend) komen al uitgepakt binnen; we
	// voegen alleen een tijdstip en, als die ontbreekt, een id toe. Idempotent op
	// het referentienummer, zodat hetzelfde case-event geen duplicaat oplevert.
	function addZaak(payload) {
		if (!payload || typeof payload !== "object") return null;
		var KEY = "zaken";
		var lijst;
		try {
			lijst = JSON.parse(localStorage.getItem(KEY)) || [];
		} catch (e) {
			lijst = [];
		}
		var sleutel = payload.referentienummer || payload.id || payload.case_id || payload.zaaknummer;
		if (sleutel) {
			var bestaat = lijst.some(function (z) {
				return (z.referentienummer || z.id || z.case_id || z.zaaknummer) === sleutel;
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
			el.innerHTML = '<div class="thinking-wrapper"><div class="wait-indicator"></div><p class="thinking-text"></p></div>';
			messages.appendChild(el);
		}
		el.querySelector(".thinking-text").textContent = text;
		messages.scrollTop = messages.scrollHeight;
	}

	function hideThinking() {
		var el = messages.querySelector(".chat-message-thinking");
		if (el && localStorage.getItem("setting:freeze-thinking") !== "true") {
			el.remove();
		}
	}

	// --- Wallet (EU Business Wallet, mock): deelverzoek + gestructureerde energieweergave ---

	// De grenzen voor de kaart komen uit RegelRecht (via de backend), niet uit
	// eigen literals. We halen ze één keer op; lukt dat niet, dan toont de kaart de
	// verbruikswaarden zonder grens-annotatie. Zelfde wet als de CTA-gating.
	var WALLET_LAW = "omgevingswet/energiebesparing/informatieplicht";
	var walletDrempel = null; // { kwh, gas } of null
	fetch(API_BASE + "/regelrecht/definities?law=" + encodeURIComponent(WALLET_LAW), { signal: AbortSignal.timeout(4000) })
		.then(function (r) {
			return r.ok ? r.json() : null;
		})
		.then(function (d) {
			var def = d && d.definities;
			if (def) walletDrempel = { kwh: Number(def.DREMPEL_ELEKTRICITEIT_KWH), gas: Number(def.DREMPEL_GAS_M3) };
		})
		.catch(function () {
			/* geen drempel beschikbaar: kaart toont waarden zonder grens */
		});

	function escapeHTML(value) {
		return String(value == null ? "" : value)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	// Decoratief stap-icoon uit de bestaande huisstijl-set, naast de kop van elke
	// stap-kaart: delen (gegevensdeling), toetsen (wet), indienen (lopende-zaken).
	var ASSET_PREFIX = typeof window.PATH_PREFIX === "string" && window.PATH_PREFIX !== "/" ? window.PATH_PREFIX.replace(/\/$/, "") : "";
	function stapIcoon(naam) {
		return '<img class="stap-icoon" alt="" src="' + ASSET_PREFIX + "/assets/icons/icon-" + naam + '.svg">';
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

	// grens (kWh/m³) is null als de RegelRecht-drempel niet beschikbaar is; dan
	// tonen we de waarde zonder boven/onder-annotatie.
	function walletCijfer(label, waardeNum, eenheid, grens) {
		var grensHtml = "";
		if (grens != null) {
			var boven = waardeNum > grens;
			var grensClass = boven ? "wallet-grens-boven" : "wallet-grens-onder";
			var grensTekst = (boven ? "boven" : "onder") + " de grens van " + grens.toLocaleString("nl-NL") + " " + eenheid;
			grensHtml = '<span class="wallet-grens ' + grensClass + '">' + grensTekst + "</span>";
		}
		return '<div class="wallet-cijfer"><dt>' + escapeHTML(label) + "</dt>" + '<dd><span class="wallet-waarde">' + escapeHTML(waardeNum.toLocaleString("nl-NL")) + " " + escapeHTML(eenheid) + "</span>" + grensHtml + "</dd></div>";
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

		el.innerHTML = '<h3 tabindex="-1">' + stapIcoon("wet") + "Energieverbruik (uit je Business Wallet)</h3>" + '<p class="wallet-uitgever">' + uitgeverRegel + " " + badge + "</p>" + '<dl class="wallet-cijfers">' + walletCijfer("Elektriciteit", kwh, "kWh", walletDrempel ? walletDrempel.kwh : null) + walletCijfer("Gas", m3, "m³", walletDrempel ? walletDrempel.gas : null) + "</dl>" + '<p class="wallet-bron">bron: Business Wallet</p>';
		return el;
	}

	// Deelverzoek zonder gegevens: de backend vraagt om toestemming vóórdat er
	// iets is opgehaald. De kaart hieronder toont het verbruik al (die hoort bij
	// de demo-hook en bij een beurt waarin de bron wél geraadpleegd is); hier is
	// er nog niets te tonen, en dat is precies de bedoeling van PDR-008: geen
	// bron raadplegen voordat de ondernemer akkoord is.
	//
	// De kaart draagt `data-verzoek="backend"`, want alleen deze variant moet bij
	// "Delen" een beurt versturen. De demo-kaart blijft lokaal.
	function renderDeelverzoek(info) {
		var bron = (info && info.bron) || "je Business Wallet";
		var card = document.createElement("div");
		card.className = "wallet-card";
		card.setAttribute("data-verzoek", "backend");

		var vraag = document.createElement("div");
		vraag.className = "wallet-consent";
		vraag.innerHTML =
			"<h3>" + stapIcoon("gegevensdeling") + "Deelverzoek uit " + escapeHTML(bron) + "</h3>" +
			"<p>De assistent wil je energieverbruik-attestatie gebruiken (afgegeven door je netbeheerder). Er wordt niets opgehaald voordat je hier akkoord geeft.</p>" +
			'<div class="wallet-acties"><button type="button" class="wallet-delen">Delen</button><button type="button" class="secondary wallet-niet-delen">Niet delen</button></div>';
		card.appendChild(vraag);

		var nietGedeeld = document.createElement("div");
		nietGedeeld.className = "wallet-niet-gedeeld";
		nietGedeeld.hidden = true;
		nietGedeeld.innerHTML = "<p>Je hebt je energieverbruik niet gedeeld. De assistent kan de informatieplicht dan niet automatisch met je Business Wallet-gegevens controleren.</p>";
		card.appendChild(nietGedeeld);

		messages.appendChild(card);
		messages.scrollTop = messages.scrollHeight;
		return card;
	}

	// Deelverzoek-kaart: één .wallet-card met de vraag + (verborgen) energiekaart + notitie.
	// Alles staat direct in de DOM, zodat het de innerHTML-save/restore van handleSwitch overleeft.
	function renderWalletConsent(data, provenance) {
		var card = document.createElement("div");
		card.className = "wallet-card";

		var vraag = document.createElement("div");
		vraag.className = "wallet-consent";
		vraag.innerHTML = "<h3>" + stapIcoon("gegevensdeling") + "Deelverzoek uit je Business Wallet</h3>" + "<p>De assistent wil je energieverbruik-attestatie uit je Business Wallet gebruiken (afgegeven door je netbeheerder). Je bepaalt zelf of je deze gegevens deelt.</p>" + '<div class="wallet-acties"><button type="button" class="wallet-delen">Delen</button><button type="button" class="secondary wallet-niet-delen">Niet delen</button></div>';
		card.appendChild(vraag);

		card.appendChild(buildWalletEnergie(data, provenance));

		var nietGedeeld = document.createElement("div");
		nietGedeeld.className = "wallet-niet-gedeeld";
		nietGedeeld.hidden = true;
		nietGedeeld.innerHTML = "<p>Je hebt je energieverbruik niet gedeeld. De assistent kan de informatieplicht dan niet automatisch met je Business Wallet-gegevens controleren.</p>";
		card.appendChild(nietGedeeld);

		messages.appendChild(card);
		messages.scrollTop = messages.scrollHeight;
		return card;
	}

	// --- Generiek vraag-formulier ---------------------------------------------
	// Elke vraag van de assistent met een gestructureerde antwoord-spec wordt een
	// formulier i.p.v. los typen. Contract (uit de backend):
	//   payload.vraag = { titel?, intro?, tekst?, bron?, velden: [
	//     { naam, label, type: "radio"|"tekst", opties?: [..] } ] }
	// Shorthand: payload.maatregelen = [{ code, omschrijving }] → radiovelden
	// (Uitgevoerd / Niet uitgevoerd). Velden/vraag mogen ook in payload.data staan.
	function normVeld(v, i) {
		var opties = v.opties || v.options || null;
		return {
			naam: v.naam || v.code || v.name || v.id || "veld" + (i + 1),
			label: v.label || v.vraag || v.omschrijving || v.naam || "Veld " + (i + 1),
			type: v.type || (opties ? "radio" : "tekst"),
			opties: opties,
			groepen: v.groepen || null,
			// Voorgevulde waarde en de herkomst daarvan: de host heeft dit veld zelf
			// afgeleid uit een registratie. De ondernemer hoort te zien wát er is
			// aangenomen en waarop, anders kan hij het niet weerspreken.
			waarde: v.waarde || null,
			toelichting: v.toelichting || null,
		};
	}

	function vraagSpec(payload) {
		if (!payload || typeof payload !== "object") return null;
		var data = payload.data || {};
		var vraag = payload.vraag || data.vraag || null;
		var velden = (vraag && vraag.velden) || payload.velden || data.velden || null;
		var maatregelen = payload.maatregelen || data.maatregelen;
		var maatregelenBron = false;

		if (!velden && Array.isArray(maatregelen) && maatregelen.length) {
			maatregelenBron = true;
			velden = maatregelen.map(function (m) {
				var code = m.code || m.naam || m.id || "";
				var oms = m.omschrijving || m.titel || m.beschrijving || "";
				return { naam: code || oms, label: code && oms ? code + " – " + oms : code || oms, type: "radio", opties: ["Uitgevoerd", "Niet uitgevoerd"] };
			});
		}

		// Geen gestructureerde velden? Val alleen terug op het parsen van platte
		// tekst als die tekst duidelijk een (EML-)maatregelenlijst is. Anders zou
		// een gewoon antwoord met genummerde vragen ten onrechte een formulier
		// worden en zou de antwoordtekst niet getoond worden.
		if (!Array.isArray(velden) || velden.length === 0) {
			var platteTekst = payload.message || "";
			return /erkende maatregelenlijst|\bEML\b|maatregel/i.test(platteTekst) ? parseVraag(platteTekst) : null;
		}
		vraag = vraag || {};
		return {
			titel: vraag.titel || (maatregelenBron ? "Erkende Maatregelenlijst (EML 2023)" : "Vragen van de assistent"),
			intro: vraag.intro || "",
			tekst: vraag.tekst || (maatregelenBron ? "Geef per maatregel aan of deze is uitgevoerd." : ""),
			bron: vraag.bron || payload.bron || data.bron || (payload.provenance && payload.provenance.source) || "",
			velden: velden.map(normVeld),
		};
	}

	function cap(s) {
		s = String(s).trim();
		return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
	}

	function maakVeld(label, opties, index) {
		var codeM = label.match(/^([A-Z]{1,4}\d+)\b/);
		return { naam: codeM ? codeM[1] : "v" + (index + 1), label: label, type: "radio", opties: opties };
	}

	// Eén genummerde regel → veld. "… - A / B?" wordt radio [A, B]; anders ja/nee.
	function parseVeldRegel(content, index) {
		content = content.replace(/\?+$/, "").trim();
		var slash = content.lastIndexOf(" / ");
		if (slash !== -1) {
			var opt2 = content.slice(slash + 3).trim();
			var voor = content.slice(0, slash);
			var dash = voor.lastIndexOf(" - ");
			if (dash !== -1) {
				var opt1 = voor.slice(dash + 3).trim();
				var label = voor.slice(0, dash).trim();
				if (opt1 && opt2 && label) return maakVeld(label, [cap(opt1), cap(opt2)], index);
			}
		}
		return maakVeld(content, ["Ja", "Nee"], index);
	}

	// Fallback-parser: zet de platte tekst van de assistent om in een vraag-spec.
	// Herkent genummerde vraagregels ("N. … - A / B?" of "N. …?").
	function parseVraag(message) {
		if (!message || typeof message !== "string") return null;
		var lines = message.split("\n");
		var velden = [];
		var introLines = [];
		var bron = "";
		var zagVraag = false;
		for (var i = 0; i < lines.length; i++) {
			var line = lines[i].trim();
			if (!line) continue;
			var bronM = line.match(/^bron\s*:\s*(.+)$/i);
			if (bronM) {
				bron = bronM[1].replace(/[.\s]+$/, "").trim();
				continue;
			}
			var numM = line.match(/^(\d+)[.)]\s+(.+)$/);
			if (numM) {
				var raw = numM[2];
				if (/\?\s*$/.test(raw) || / \/ /.test(raw)) {
					velden.push(parseVeldRegel(raw, velden.length));
					zagVraag = true;
				}
				continue;
			}
			if (!zagVraag && !/^[•·*-]/.test(line)) introLines.push(line);
		}
		if (velden.length === 0) return null;
		var intro = introLines.join(" ").trim();
		var isEml =
			/erkende maatregelenlijst|eml/i.test(intro) ||
			velden.some(function (v) {
				return /^[A-Z]{1,4}\d+$/.test(v.naam);
			});
		return {
			titel: isEml ? "Erkende Maatregelenlijst (EML 2023)" : "Vragen van de assistent",
			intro: intro,
			tekst: "",
			bron: bron,
			velden: velden,
		};
	}

	// Het categorieveld is getrapt: eerst het onderdeel (Gebouwen, Faciliteiten,
	// Processen), daarna alleen de categorieën die daaronder vallen. De erkende
	// maatregelenlijst kent er achtentwintig; die in één lijst tonen maakt van een
	// vraag een inventarisatie. De indeling komt van de backend, uit de wet zelf.
	function categorieenHTML(veld, naam) {
		var groepen = veld.groepen || [];
		var stap1 = groepen
			.map(function (g, j) {
				var id = naam + "-onderdeel-" + j;
				return '<li><input type="checkbox" class="onderdeel-keuze" id="' + id + '" data-onderdeel="' + escapeHTML(g.onderdeel) + '"> <label for="' + id + '">' + escapeHTML(g.onderdeel) + "</label></li>";
			})
			.join("");
		var stap2 = groepen
			.map(function (g, j) {
				var opties = (g.opties || [])
					.map(function (categorie, k) {
						var id = naam + "-cat-" + j + "-" + k;
						return '<li><input type="checkbox" class="categorie-keuze" id="' + id + '" value="' + escapeHTML(categorie) + '"> <label for="' + id + '">' + escapeHTML(categorie) + "</label></li>";
					})
					.join("");
				return '<fieldset class="categorie-groep" data-onderdeel="' + escapeHTML(g.onderdeel) + '" hidden><legend>' + escapeHTML(g.onderdeel) + " — wat is hiervan aanwezig?</legend>" + '<ul class="list-plain">' + opties + "</ul></fieldset>";
			})
			.join("");
		return (
			'<fieldset data-veld="' + escapeHTML(veld.naam) + '" data-type="categorieen">' +
			"<legend>" + escapeHTML(veld.label) + "</legend>" +
			"<p>Kies eerst welke delen bij uw bedrijf voorkomen.</p>" +
			'<ul class="list-plain">' + stap1 + "</ul>" +
			stap2 +
			"</fieldset>"
		);
	}

	function veldHTML(veld, index) {
		var naam = "vraag-" + index + "-" + String(veld.naam).replace(/[^a-z0-9]/gi, "");
		if (veld.type === "categorieen") return categorieenHTML(veld, naam);
		if (veld.type === "radio" && veld.opties && veld.opties.length) {
			var opties = veld.opties
				.map(function (optie, j) {
					var id = naam + "-" + j;
					var gekozen = veld.waarde && optie === veld.waarde ? " checked" : "";
					return '<li><input type="radio" id="' + id + '" name="' + naam + '" value="' + escapeHTML(optie) + '"' + gekozen + "> <label for=\"" + id + '">' + escapeHTML(optie) + "</label></li>";
				})
				.join("");
			var toelichting = veld.toelichting ? '<p class="veld-toelichting">' + escapeHTML(veld.toelichting) + "</p>" : "";
			return '<fieldset data-veld="' + escapeHTML(veld.naam) + '"><legend>' + escapeHTML(veld.label) + "</legend>" + toelichting + '<ul class="list-plain">' + opties + "</ul></fieldset>";
		}
		return '<div data-veld="' + escapeHTML(veld.naam) + '"><label for="' + naam + '">' + escapeHTML(veld.label) + '</label><input type="text" id="' + naam + '" name="' + naam + '"></div>';
	}

	function renderAssistentVraag(spec) {
		var card = document.createElement("div");
		card.className = "wallet-card";
		var velden = spec.velden.map(veldHTML).join("");
		var bronRegel = spec.bron ? '<p class="wallet-bron">bron: ' + escapeHTML(spec.bron) + "</p>" : "";
		card.innerHTML = '<h3 tabindex="-1">' + escapeHTML(spec.titel) + "</h3>" + (spec.intro ? "<p>" + escapeHTML(spec.intro) + "</p>" : "") + (spec.tekst ? "<p>" + escapeHTML(spec.tekst) + "</p>" : "") + '<form class="vraag-form">' + velden + '<div class="action-group"><button type="submit">Antwoord versturen</button><button type="button" class="secondary vraag-uitleg">Leg mij dit uit</button></div>' + "</form>" + bronRegel;
		messages.appendChild(card);
		messages.scrollTop = messages.scrollHeight;
		var kop = card.querySelector("h3");
		if (kop) kop.focus();
		return card;
	}

	function renderStatus(data) {
		var offline = document.getElementById("chat-offline");
		if (offline) offline.hidden = true;
		serverStatus = data;
		updateStatusDisplay();
	}

	function statusLijst(sources) {
		return STATUS_ITEMS.map(function (it) {
			var connected = !!(sources && sources[it.key] === "verbonden");
			var dot = connected ? "connected" : "disconnected";
			// Geen icoon meer per bron: vijf rode kruizen onder een gesprek lezen als
			// vijf storingen. De stip draagt de status; de uitleg erachter zegt wat de
			// bron doet en wat het betekent als hij eruit ligt. Een echte storing staat
			// in de melding boven het gesprek (#chat-offline).
			var status = connected
				? "Nu bereikbaar."
				: "Nu niet bereikbaar. De assistent kan deze bron op dit moment niet gebruiken.";
			var id = "bron-uitleg-" + it.key;
			// De naam is focusbaar (tabindex) zodat de uitleg ook met het toetsenbord
			// te bereiken is, en aria-describedby koppelt hem voor de schermlezer —
			// een title-attribuut doet geen van beide betrouwbaar.
			return '<li class="chat-status-' + dot + '">' +
				'<span class="chat-status-bron" tabindex="0" aria-describedby="' + id + '">' + it.label + "</span>" +
				'<span class="chat-status-uitleg" role="tooltip" id="' + id + '">' + it.uitleg + " " + status + "</span>" +
				"</li>";
		}).join("");
	}

	function updateStatusDisplay() {
		if (!serverStatus) return;
		var transport = getTransport();
		var sources = (transport === "cli" ? serverStatus.cli : serverStatus.servers) || {};
		statusEl.innerHTML = '<p>Status van bronnen:</p><ul class="list-plain">' + statusLijst(sources) + "</ul>";
	}

	function renderStatusOffline() {
		var offline = document.getElementById("chat-offline");
		if (offline) offline.hidden = false;
		statusEl.innerHTML = '<p>Status van bronnen:</p><ul class="list-plain">' + statusLijst(null) + "</ul>";
	}

	// De uitleg bij een bron moet weg te krijgen zijn zonder de muis te verplaatsen
	// of de focus te verliezen (WCAG 2.1, 1.4.13 Content on Hover or Focus).
	statusEl.addEventListener("keydown", function (e) {
		if (e.key === "Escape") statusEl.classList.add("tooltips-uit");
	});
	["pointermove", "focusin"].forEach(function (type) {
		statusEl.addEventListener(type, function () {
			statusEl.classList.remove("tooltips-uit");
		});
	});

	// Haal status op bij laden (3s timeout zodat de pagina niet hangt als de host niet draait)
	fetch(API_BASE + "/health", { signal: AbortSignal.timeout(3000) })
		.then(function (r) {
			return r.json();
		})
		.then(renderStatus)
		.catch(renderStatusOffline);

	// Bewaar en herstel gesprek bij wisselen van LLM of transport
	var previousCombo = getComboKey();

	// Terug van een andere pagina in hetzelfde tabblad: het gesprek staat nog
	// in sessionStorage, dus zet het terug in plaats van het welkomstbericht.
	if (chatHistory[previousCombo]) {
		messages.innerHTML = chatHistory[previousCombo];
		messages.scrollTop = messages.scrollHeight;
	}

	var nieuwKnop = document.getElementById("chat-nieuw");
	// Er valt pas iets te wissen zodra de gebruiker een bericht heeft gestuurd.
	// Tijdens het streamen van een antwoord blijft de knop bereikbaar voor
	// toetsenbord en screenreader (aria-disabled, geen disabled), maar doet die
	// niets: anders wist een klik de chat onder het lopende antwoord vandaan.
	var heeftGesprek = false;
	if (nieuwKnop)
		nieuwKnop.addEventListener("click", function () {
			if (nieuwKnop.getAttribute("aria-disabled") === "true") return;
			nieuwGesprek();
		});

	function enableNieuwKnop() {
		if (nieuwKnop) nieuwKnop.removeAttribute("aria-disabled");
	}

	function disableNieuwKnop() {
		if (nieuwKnop) nieuwKnop.setAttribute("aria-disabled", "true");
	}

	// Uitgeschakeld starten, tenzij er een gesprek is teruggezet uit deze sessie:
	// dan valt er wél iets te wissen.
	heeftGesprek = Boolean(chatHistory[previousCombo]);
	if (heeftGesprek) enableNieuwKnop();
	else disableNieuwKnop();

	function handleSwitch() {
		if (submitting) return;

		var prev = previousCombo;
		var next = getComboKey();
		if (prev === next) return;

		previousCombo = next;
		bewaarHistorie(prev);

		// Per combinatie een eigen gesprek: de knop volgt de combinatie waar we
		// naartoe wisselen, niet die we verlaten.
		heeftGesprek = Boolean(chatHistory[next]);
		if (heeftGesprek) enableNieuwKnop();
		else disableNieuwKnop();

		// Bestaand gesprek komt meteen terug: er is niets nieuws van de assistent.
		// Een leeg gesprek begint wél met de wait-indicator, net als bij een
		// nieuw gesprek en een volgende page-load.
		if (chatHistory[next]) {
			messages.innerHTML = chatHistory[next];
			messages.scrollTop = messages.scrollHeight;
			updateStatusDisplay();
			return;
		}
		messages.innerHTML = "";
		updateStatusDisplay();
		naWachten(function () {
			messages.innerHTML = initialMessages;
			messages.scrollTop = messages.scrollHeight;
		});
	}

	window.addEventListener("setting-changed", function (e) {
		// Een ander KvK-nummer is een andere identiteit. Dat zit niet in de combo-sleutel
		// (die zou dan bij elke toetsaanslag in het veld wisselen), dus vergeten we hier
		// het session_id: het volgende bericht start een schoon gesprek.
		if (e.detail && e.detail.key === "test-user-kvk") {
			delete sessions[getComboKey()];
			bewaarSessies();
		}
		handleSwitch();
	});

	// Suggestie-chips: vul het invoerveld en verstuur direct.
	messages.addEventListener("click", function (e) {
		var replay = e.target.closest(".chat-show-onboarding");
		if (replay) {
			showOnboardingMessages();
			return;
		}
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
		// Een deelverzoek van de backend moet een beurt opleveren: de host legt
		// toestemming alleen vast via het contractveld `toestemming` (PDR-008),
		// dus een kaart die alleen lokaal iets openklapt laat de regelloop
		// wachten op een akkoord dat nooit aankomt.
		var vanBackend = card.getAttribute("data-verzoek") === "backend";

		if (e.target.closest(".wallet-delen")) {
			card.querySelector(".wallet-consent").hidden = true;
			if (vanBackend) {
				if (submitting) return;
				pendingToestemming = true;
				input.value = "Ja, je mag mijn energieverbruik ophalen.";
				form.requestSubmit();
				return;
			}
			var energie = card.querySelector(".wallet-energie");
			energie.hidden = false;
			messages.scrollTop = messages.scrollHeight;
			var kop = energie.querySelector("h3");
			if (kop) kop.focus();
		} else if (e.target.closest(".wallet-niet-delen")) {
			card.querySelector(".wallet-consent").hidden = true;
			card.querySelector(".wallet-niet-gedeeld").hidden = false;
			messages.scrollTop = messages.scrollHeight;
			// Zonder beurt blijft de assistent wachten op een antwoord dat de
			// respondent al gegeven heeft. Het weigeren gaat als bericht mee,
			// niet als contractveld: toestemming wordt alleen vastgelegd, nooit
			// ingetrokken.
			if (vanBackend && !submitting) {
				input.value = "Nee, ik deel mijn energieverbruik liever niet.";
				form.requestSubmit();
			}
		}
	});

	// Vraag-formulier: "Leg mij dit uit" vraagt de assistent om uitleg en laat het
	// formulier staan, zodat je daarna alsnog kunt antwoorden.
	//
	// De knop stuurt mee waar hij bij hoort. Zonder dat kwam er letterlijk
	// "Leg mij dit uit" binnen, zonder onderwerp, en antwoordde de assistent
	// met een wedervraag ("wat wilt u uitgelegd hebben?"). Voor de ondernemer
	// leest dat als een knop die niets doet. De titel zegt waar het formulier
	// over gaat, de vraagteksten zeggen waar hij op vastloopt - en juist die
	// komen uit de regeling zelf, dus in wetstaal.
	messages.addEventListener("click", function (e) {
		var knop = e.target.closest(".vraag-uitleg");
		if (!knop || submitting) return;
		var kaart = knop.closest(".wallet-card");
		var kop = kaart && kaart.querySelector("h3");
		var vragen = [];
		if (kaart) {
			kaart.querySelectorAll("[data-veld]").forEach(function (veld) {
				// De vraag zelf: de legend van een keuzeveld, of het label van een
				// tekstveld. Niet de antwoordopties eronder - die zeggen niets over
				// waar de ondernemer op vastloopt.
				var el = veld.querySelector("legend") || veld.querySelector("label");
				var tekst = el ? el.textContent.trim() : "";
				if (tekst) vragen.push(tekst);
			});
		}
		var onderwerp = kop ? kop.textContent.trim() : "";
		var bericht = "Leg mij dit uit";
		if (onderwerp) bericht += ': "' + onderwerp + '"';
		if (vragen.length) bericht += ". Het gaat om deze vragen: " + vragen.join(" / ");
		input.value = bericht;
		form.requestSubmit();
	});

	// Vraag-formulier: stel het antwoord samen en stuur het als chatbericht terug,
	// mét de losse antwoorden als `opgaven` (zie pendingOpgaven verderop). Zo
	// blijft het antwoord toerekenbaar aan het veld dat de respondent invulde,
	// in plaats van platgeslagen tot een zin die het model weer moet parsen.
	var RADIO_WAARDE = { Uitgevoerd: true, Ja: true, "Niet uitgevoerd": false, Nee: false };
	var REGELPARAMETER = /^[A-Z][A-Z0-9_]*$/;
	// Overbrugt vraag-form-submit (hierboven) naar de hoofd-submit-handler
	// (verderop): beide luisteren op een `submit`-event, maar op verschillende
	// formulieren, dus dit is de enige weg om de opgaven mee te geven.
	var pendingOpgaven = null;

	// Zelfde mechaniek als pendingOpgaven: de knop "Delen" zet de vlag en laat de
	// hoofd-submit-handler hem meesturen als contractveld `toestemming`.
	var pendingToestemming = false;

	// Alleen velden meesturen die deze beurt ook echt iets betekenen. Een
	// `toestemming: false` op elke beurt zou de host niets zeggen (toestemming
	// wordt vastgelegd, niet ingetrokken) maar wel suggereren dat de respondent
	// zojuist geweigerd heeft.
	function bouwVerzoek(message, sessionId, mode, opgaven, toestemming) {
		var body = { message: message, session_id: sessionId, mode: mode };
		if (opgaven) body.opgaven = opgaven;
		if (toestemming) body.toestemming = true;
		return body;
	}

	// Stap 1 van het categorieveld opent stap 2. Bij het weer uitvinken gaan de
	// vinkjes eronder mee uit: een verborgen aangevinkte categorie zou wél
	// meegestuurd worden, en dan krijgt de ondernemer maatregelen voor een
	// bedrijfsdeel dat hij net wegklikte.
	messages.addEventListener("change", function (e) {
		var keuze = e.target;
		if (!keuze.classList || !keuze.classList.contains("onderdeel-keuze")) return;
		var veld = keuze.closest('[data-type="categorieen"]');
		if (!veld) return;
		var onderdeel = keuze.getAttribute("data-onderdeel");
		veld.querySelectorAll(".categorie-groep").forEach(function (groep) {
			if (groep.getAttribute("data-onderdeel") !== onderdeel) return;
			groep.hidden = !keuze.checked;
			if (!keuze.checked) {
				groep.querySelectorAll(".categorie-keuze").forEach(function (vinkje) {
					vinkje.checked = false;
				});
			}
		});
	});

	messages.addEventListener("submit", function (e) {
		var f = e.target;
		if (!f.classList || !f.classList.contains("vraag-form")) return;
		e.preventDefault();
		if (submitting) return;
		var delen = [];
		var opgaven = {};
		var ontbreekt = false;
		f.querySelectorAll("[data-veld]").forEach(function (veld) {
			if (veld.getAttribute("data-type") === "categorieen") {
				var gekozen = [];
				veld.querySelectorAll(".categorie-keuze:checked").forEach(function (vinkje) {
					gekozen.push(vinkje.value);
				});
				if (!gekozen.length) {
					ontbreekt = true;
					return;
				}
				delen.push("Aanwezig: " + gekozen.join(", "));
				var categorieVeld = veld.getAttribute("data-veld");
				// Dezelfde poort als hieronder: alleen wat eruitziet als
				// regelparameter gaat als opgave mee.
				if (REGELPARAMETER.test(categorieVeld)) opgaven[categorieVeld] = gekozen;
				return;
			}
			var labelEl = veld.querySelector("legend") || veld.querySelector("label");
			var labelTekst = labelEl ? labelEl.textContent.trim() : veld.getAttribute("data-veld");
			var codeM = labelTekst.match(/^([A-Z]{1,4}\d+)/);
			var key = codeM ? codeM[1] : labelTekst;
			var radio = veld.querySelector("input[type=radio]:checked");
			var tekst = veld.querySelector("input[type=text]");
			var waarde = null;
			if (radio) {
				delen.push(key + ": " + radio.value);
				// `normVeld` accepteert willekeurige `opties` uit een backend-
				// `vraag.velden`-payload; een label buiten RADIO_WAARDE raden we
				// niet naar true/false — dat zou een aanname het antwoord in
				// smokkelen die de respondent niet gaf. We sturen dan liever
				// niets dan de ruwe tekst, want de regelengine aan de andere
				// kant verwacht hier een boolean feit, geen string. Het
				// chatbericht (`delen`, hierboven) bevat de tekst gewoon, dat
				// is voor de mens; `opgaven` niet, dat is voor de regel.
				if (Object.prototype.hasOwnProperty.call(RADIO_WAARDE, radio.value)) {
					waarde = RADIO_WAARDE[radio.value];
				}
			} else if (tekst && tekst.value.trim()) {
				delen.push(key + ": " + tekst.value.trim());
				waarde = tekst.value.trim();
			} else {
				ontbreekt = true;
			}
			// Naam draagt het veld al (naam in de veld-spec); alleen velden die
			// eruitzien als regelparameter gaan mee, en nooit een lege/null-waarde.
			var naam = veld.getAttribute("data-veld");
			if (waarde !== null && REGELPARAMETER.test(naam)) {
				opgaven[naam] = waarde;
			}
		});
		if (ontbreekt) {
			var melding = f.querySelector(".vraag-melding");
			if (!melding) {
				melding = document.createElement("p");
				melding.className = "vraag-melding form-field-error";
				f.querySelector(".action-group").insertAdjacentElement("beforebegin", melding);
			}
			melding.textContent = "Beantwoord elke vraag voordat je verstuurt.";
			return;
		}
		var bericht = "Mijn antwoorden: " + delen.join("; ") + ".";
		// Laat het ingevulde formulier staan: vergrendel de velden zodat de gekozen
		// antwoorden zichtbaar blijven, en vervang de knoppen door een bevestiging.
		f.querySelectorAll("input").forEach(function (el) {
			el.disabled = true;
		});
		var acties = f.querySelector(".action-group");
		if (acties) acties.outerHTML = '<p class="wallet-badge">' + ICON_SUCCES + "Antwoord verstuurd</p>";
		input.value = bericht;
		// De hoofd-submit-handler (verderop) leest en wist dit direct bij het
		// opbouwen van het verzoek; zo bereikt het antwoord de fetch zonder de
		// signature van form.requestSubmit() te hoeven ombouwen.
		pendingOpgaven = Object.keys(opgaven).length ? opgaven : null;
		form.requestSubmit();
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
		// Alleen gevuld als dit bericht net via het vraag-formulier is verstuurd;
		// direct wissen zodat een volgend, los getypt bericht niet per ongeluk
		// dezelfde opgaven meekrijgt.
		var opgaven = pendingOpgaven;
		pendingOpgaven = null;
		var toestemming = pendingToestemming;
		pendingToestemming = false;

		submitting = true;
		heeftGesprek = true;
		disableNieuwKnop();
		addMessage(message, "user");
		input.value = "";
		input.style.blockSize = "auto";
		setLoading(true);

		if (getDemoMode()) {
			try {
				await wait(600);
				showThinking("Ik controleer de regels voor uw situatie…");
				await wait(900);
				hideThinking();
				addMessage(
					"Dit is een demo-antwoord van de digitale assistent. Het laat het werkende loading- en thinking-patroon zien zonder een echte backend.",
					"assistant"
				);
			} finally {
				setLoading(false);
				submitting = false;
				if (heeftGesprek) enableNieuwKnop();
				if (getComboKey() === comboKey) bewaarHistorie(comboKey);
			}
			return;
		}

		var answered = false;
		// Per beurt bijhouden of er een zaak is aangemaakt; bepaalt of het
		// antwoord een knop naar Lopende zaken krijgt.
		var zaakGemaakt = false;
		// Het deelverzoek van deze beurt, pas te tonen nadat het antwoord in beeld
		// staat: de kaart hoort ná de uitleg te komen, niet ervoor.
		var verzoekNaBericht = null;

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
					// Op moment van versturen bepaald, zodat een persona-wissel direct meetelt.
					"X-Test-User": getTestUser(),
				},
				body: JSON.stringify(
					bouwVerzoek(message, sessions[comboKey], mode, opgaven, toestemming)
				),
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
						// Backend stuurt { type:"case", data: <lopende_zaak> }; bewaar de
						// zaak zelf (payload.data) in localStorage.
						addZaak(payload.data || payload);
					} else if ((eventType === "answer" || eventType === "error") && !answered) {
						answered = true;
						hideThinking();
						if (payload.session_id) {
							sessions[comboKey] = payload.session_id;
							bewaarSessies();
						}
						// Bevat het antwoord een gestructureerde vraag? Toon een formulier.
						// Het deelverzoek komt als data mee (toestemming_nodig), niet als
						// zin in de tekst: sinds de toestemmingspoort stuurt de host geen
						// tool-event meer voor een bron die hij nog niet mág raadplegen.
						if (eventType === "answer" && payload.toestemming_nodig && getComboKey() === comboKey) {
							verzoekNaBericht = payload.toestemming_nodig;
						}
						var spec = eventType === "answer" && getComboKey() === comboKey ? vraagSpec(payload) : null;
						if (spec) {
							renderAssistentVraag(spec);
						} else {
							var role = eventType === "error" ? "error" : "assistant";
							var bericht;
							// Toon alleen als gebruiker nog in dezelfde combinatie zit
							if (getComboKey() === comboKey) {
								bericht = addMessage(payload.message, role);
							} else {
								// Sla op in chatHistory zodat het zichtbaar wordt bij terugwisselen
								var temp = messages.innerHTML;
								messages.innerHTML = chatHistory[comboKey] || "";
								addMessage(payload.message, role);
								bewaarHistorie(comboKey);
								messages.innerHTML = temp;
							}
							// De vervolgstap hoort bij dit antwoord: een ingediende zaak
							// verwijst naar Lopende zaken, een doodloper naar Contact.
							// Alleen bij een zichtbaar bericht; in de weggeschreven
							// historie zou de knop naar het verkeerde gesprek wijzen.
							if (bericht && role === "error") {
								voegVervolgstapToe(bericht, "Neem contact op", messages.dataset.urlContact);
							} else if (bericht && zaakGemaakt) {
								voegVervolgstapToe(bericht, "Bekijk in Lopende zaken", messages.dataset.urlZaken);
							}
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
					reason = "Je API-sleutel ontbreekt of is onjuist. Controleer de sleutel in het instellingenpaneel.";
				} else if (err && err.status === 403) {
					reason = "Je API-sleutel heeft geen toegang tot deze backend.";
				} else if (err && err.status >= 500) {
					reason = "De assistent heeft een technisch probleem. Probeer het later opnieuw.";
				} else {
					reason = "De assistent is niet bereikbaar. Controleer je internetverbinding en probeer het opnieuw.";
				}
				voegVervolgstapToe(
					addMessage(reason, "error"),
					"Neem contact op",
					messages.dataset.urlContact
				);
			}
		} finally {
			clearTimeout(connectTimer);
			if (idleTimer) clearTimeout(idleTimer);
			submitting = false;
			if (heeftGesprek) enableNieuwKnop();
			// Na submitting = false, anders weigert de knop in de kaart de beurt die
			// hij zelf moet starten.
			if (verzoekNaBericht && getComboKey() === comboKey) renderDeelverzoek(verzoekNaBericht);
			// Vastleggen na afloop van de beurt, niet per bericht: bij een
			// afgebroken stream staat de laatste stand er dan alsnog in.
			if (getComboKey() === comboKey) bewaarHistorie(comboKey);
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

	// Demo/test-hook: toon het generieke vraag-formulier zonder backend.
	window.MozaVraag = {
		toon: renderAssistentVraag,
		eml: function () {
			return renderAssistentVraag(
				vraagSpec({
					maatregelen: [
						{ code: "GC1", omschrijving: "Pas een klokregeling toe en regel deze in (ruimteverwarming)" },
						{ code: "GC3", omschrijving: "Pas een weersafhankelijke regeling toe" },
						{ code: "GF4", omschrijving: "Vervang gloei-, halogeen- en spaarlampen door LED-lampen" },
						{ code: "FD3", omschrijving: "Pas nachtafdekking toe bij semi-verticale koelmeubels" },
						{ code: "FD7", omschrijving: "Isoleer de wanden van koelcellen om warmte buiten te houden" },
					],
					provenance: { source: "RegelRecht" },
					data: { vraag: { intro: "Op basis van de Erkende Maatregelenlijst (EML 2023) gelden voor Koffiezaak Noon 5 maatregelen.", tekst: "Geef per maatregel aan of deze is uitgevoerd." } },
				})
			);
		},
		jaNee: function () {
			return renderAssistentVraag({
				titel: "Vraag van de assistent",
				tekst: "Heeft je bedrijf een koelinstallatie?",
				bron: "RegelRecht",
				velden: [{ naam: "koelinstallatie", label: "Heeft je bedrijf een koelinstallatie?", type: "radio", opties: ["Ja", "Nee"] }],
			});
		},
	};

	// Startvraag via URL-parameter (?vraag=…), bijvoorbeeld vanuit de
	// notificatie op het dashboard. Vult het invoerveld en verstuurt direct,
	// zodat het gesprek zonder extra klik begint.
	var startvraag = new URLSearchParams(location.search).get("vraag");
	if (heeftOnboardingGezien()) {
		naWachten(function () {
			showSuggestionPrompt(true);
			if (startvraag && startvraag.trim()) {
				input.value = startvraag.trim();
				form.requestSubmit();
			}
		}, WACHT_PAGINALAAD);
	} else if (startvraag && startvraag.trim()) {
		// Eerste bezoek: toon onboarding inclusief intro, zonder replay-knop
		showOnboardingMessages().then(function() {
			markeerOnboardingGezien();
			input.value = startvraag.trim();
			form.requestSubmit();
		});
	} else {
		// Eerste bezoek: toon onboarding inclusief intro, zonder replay-knop
		showOnboardingMessages().then(function() {
			markeerOnboardingGezien();
		});
	}
})();
