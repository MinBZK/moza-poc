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
	var OPSLAG_VERSIE = "chat:opmaak-versie";

	// Het gesprek wordt als kant-en-klare HTML bewaard en bij terugkomst zo weer in
	// de DOM gezet. Verandert de opmaak van een bericht, dan blijft een gesprek uit
	// een eerdere versie er dus uitzien zoals het toen was — met oude markup en al.
	// Tijdens ontwikkeling levert dat spookmeldingen op ("ik zie nog steeds het
	// oude formaat") terwijl de code allang klopt. Hoog dit nummer op zodra de
	// opbouw van een bericht wijzigt; het bewaarde gesprek wordt dan één keer
	// weggegooid en opnieuw opgebouwd.
	var OPMAAK_VERSIE = "2";

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

	// Ook het session_id gaat mee weg: de gebruiker ziet een leeg gesprek, dus een
	// backend die de vorige beurten nog kent zou antwoorden op iets wat hier niet
	// meer staat.
	try {
		if (sessionStorage.getItem(OPSLAG_VERSIE) !== OPMAAK_VERSIE) {
			sessionStorage.removeItem(OPSLAG_HISTORIE);
			sessionStorage.removeItem(OPSLAG_SESSIES);
			sessionStorage.setItem(OPSLAG_VERSIE, OPMAAK_VERSIE);
		}
	} catch (e) {
		/* privémodus: er is dan toch niets bewaard */
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
	var onboardingMessages = ["<p>Hallo, ik ben de digitale assistent van MijnOverheid Zakelijk. Voor hulp bij vragen of ondersteuning van taken raadpleeg ik een aantal betrouwbare overheidsbronnen.</p>", '<p>Ik kan bijvoorbeeld:</p><ul class="list-indent"><li>uw bedrijfsgegevens opzoeken</li><li>uitzoeken welke regels voor u gelden</li><li>uw belastingaangifte voorbereiden</li></ul>', "<p>Ik gebruik uw gegevens pas <strong>als u daar toestemming voor geeft</strong>. Bij elk antwoord ziet u welke bron ik heb geraadpleegd.</p>"];
	var exampleQuestions = ["Geldt de energiebesparingsinformatieplicht voor mij?", "Hoe kan ik mijn bedrijfsgegevens bekijken?", "Hoe bereid ik mijn belastingaangifte voor?"];

	// Een nieuw bericht in beeld brengen. Past het in het venster, dan schuiven we
	// door naar onderen zoals in elke chat. Is het langer dan het venster, dan
	// zetten we de bovenkant in beeld: naar onderen springen zet de gebruiker aan
	// het slot van een antwoord dat die nog moet lezen, en dan moet die eerst
	// terugscrollen om te zien wat er staat.
	//
	// Aanroepen als het bericht compleet is — dus ná de bronvermelding en een
	// eventuele vervolgstap-knop, anders meet je een hoogte die nog groeit.
	var RUIMTE_BOVEN = 8;
	function toonBericht(el) {
		if (!el) {
			messages.scrollTop = messages.scrollHeight;
			return;
		}
		if (el.offsetHeight < messages.clientHeight) {
			messages.scrollTop = messages.scrollHeight;
			return;
		}
		// Via getBoundingClientRect en niet offsetTop: dat laatste rekent vanaf de
		// dichtstbijzijnde gepositioneerde voorouder, en dat is hier niet het
		// berichtenvenster.
		messages.scrollTop += el.getBoundingClientRect().top - messages.getBoundingClientRect().top - RUIMTE_BOVEN;
	}

	function addAssistantMessage(html) {
		var div = document.createElement("div");
		div.className = "chat-message chat-message-assistant";
		div.innerHTML = html;
		messages.appendChild(div);
		toonBericht(div);
	}

	function showSuggestionPrompt(includeReplayButton) {
		var suggestions = document.createElement("div");
		suggestions.className = "chat-suggestions";
		var intro = document.createElement("p");
		intro.className = "chat-suggestions-label";
		intro.textContent = "Stel uw vraag, of probeer een van deze voorbeeldvragen:";
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
			replay.textContent = "Toon de uitleg opnieuw";
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
		herstelBewaarKnop();
		demoStand = { scenario: null, beurt: 0 };
		heeftGesprek = false;
		disableNieuwKnop();
		zetFocus(input);
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
	//
	// `url` is waar de ondernemer de bron zelf kan naslaan. De backend noemt bij een
	// antwoord alleen de naam van de bron ("Bron: RegelRecht"), zonder verwijzing;
	// zonder deze lijst zou een bronvermelding een doodlopende tekstregel zijn.
	// Eén plek voor beide gebruiken: de statuslijst hierboven het gesprek en de
	// bronvermelding onder een antwoord.
	var STATUS_ITEMS = [
		{ key: "regelrecht", label: "RegelRecht", url: "https://regelrecht.rijks.app/", uitleg: "Rekent uit welke regels voor uw bedrijf gelden." },
		{ key: "rvo", label: "RVO", url: "https://www.rvo.nl/", uitleg: "Neemt uw rapportage in ontvangst." },
		// De Business Wallet is in dit prototype een mock: er is geen pagina om naar
		// te verwijzen, dus die bron blijft zonder link.
		{ key: "netbeheerder", label: "Business Wallet", url: "", uitleg: "Levert uw energieverbruik, afgegeven door uw netbeheerder." },
		{ key: "kvk", label: "KvK Handelsregister", url: "https://www.kvk.nl/handelsregister/", uitleg: "Levert de gegevens van uw onderneming." },
		{ key: "koop", label: "KOOP Regelingenbank", url: "https://wetten.overheid.nl/", uitleg: "Levert de officiële wetteksten." },
	];

	// Naam van een bron uit een antwoord terugbrengen tot de URL uit STATUS_ITEMS.
	// De assistent schrijft niet altijd de volledige naam ("KvK" of "KvK
	// Handelsregister"), dus we vergelijken beide kanten op.
	function bronURL(label) {
		var naam = String(label == null ? "" : label)
			.trim()
			.toLowerCase();
		if (!naam) return "";
		var treffer = STATUS_ITEMS.filter(function (item) {
			if (!item.url) return false;
			var itemNaam = item.label.toLowerCase();
			return naam === itemNaam || naam.indexOf(itemNaam) !== -1 || itemNaam.indexOf(naam) !== -1;
		})[0];
		return treffer ? treffer.url : "";
	}

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

	// Waar het demo-draaiboek staat: welk scenario loopt en de hoeveelste beurt
	// daarvan volgt. Bewust niet in sessionStorage: een demo hoort bij "Nieuw
	// gesprek" en bij een verse pagina weer bij beurt één te beginnen.
	var demoStand = { scenario: null, beurt: 0 };

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

	// Inline opmaak binnen één regel: vet, cursief, code en links.
	function inlineOpmaak(regel) {
		return (
			regel
				.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
				.replace(/\*(.+?)\*/g, "<em>$1</em>")
				.replace(/`(.+?)`/g, "<code>$1</code>")
				// rel="external" hoort erbij: daar hangt het externe-link-icoon aan
				// (a[rel~="external"]::after). external-links.js vult noopener alleen
				// aan bij het laden van de pagina, dus die zetten we hier zelf.
				.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="external noopener">$1</a>')
		);
	}

	// Markdown van de assistent omzetten naar blokken: elke regel wordt een <p> en
	// opeenvolgende opsommingsregels worden één <ul>. Geen <br>: de ruimte tussen
	// de blokken komt uit de `gap` van de ballon, die is overal in de chat gelijk.
	// Een lege regel scheidt alleen en levert zelf niets op.
	//
	// De <ul> staat naast de <p>'s en niet erin. Dat moet ook: een <ul> mag geen
	// kind van een <p> zijn, en bij het terugzetten van een bewaard gesprek
	// (handleSwitch schrijft messages.innerHTML weg en leest het terug) sluit de
	// parser die <p> alsnog — dan zou de opbouw van het bericht veranderen.
	function parseMarkdown(text) {
		var regels = String(text == null ? "" : text).split("\n");
		var blokken = [];
		var lijst = [];

		function sluitLijst() {
			if (!lijst.length) return;
			blokken.push("<ul>" + lijst.join("") + "</ul>");
			lijst = [];
		}

		for (var i = 0; i < regels.length; i++) {
			var regel = regels[i].replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();

			var lijstM = regel.match(/^[-*]\s+(.+)$/);
			if (lijstM) {
				lijst.push("<li>" + inlineOpmaak(lijstM[1]) + "</li>");
				continue;
			}

			sluitLijst();
			if (!regel) continue;

			// Koppen worden vet en geen <h*>: deze tekst staat in een chatballon,
			// midden in de kopstructuur van de pagina.
			var kopM = regel.match(/^#{1,4}\s+(.+)$/);
			if (kopM) {
				blokken.push("<p><strong>" + inlineOpmaak(kopM[1]) + "</strong></p>");
				continue;
			}

			blokken.push("<p>" + inlineOpmaak(regel) + "</p>");
		}

		sluitLijst();
		return blokken.join("");
	}

	function addMessage(text, role) {
		var div = document.createElement("div");
		if (role === "error") {
			div.className = "feedback feedback-error";
			var content = document.createElement("div");
			var foutTekst = document.createElement("p");
			foutTekst.textContent = text;
			content.appendChild(foutTekst);
			div.innerHTML = ICON_FOUTMELDING;
			div.appendChild(content);
		} else {
			div.className = "chat-message chat-message-" + role;
			if (role === "assistant") {
				// parseMarkdown levert blokken (<p> en <ul>) die rechtstreeks in de
				// ballon horen. De ballon is een flex-column met gap, dus alinea's en
				// lijsten krijgen hun onderlinge ruimte vanzelf.
				div.innerHTML = parseMarkdown(text);
			} else {
				var vraag = document.createElement("p");
				vraag.textContent = text;
				div.appendChild(vraag);
			}
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

	// Bronvermelding onder een antwoord. Komt als gestructureerde lijst mee in het
	// answer-event (`payload.bronnen`), niet als markdown in de antwoordtekst: de
	// markdown-parser maakt er een kale <ul> van, terwijl de bronvermelding een
	// eigen patroon is met een label, de bron los van de titel en de datum van
	// raadpleging. Elke bron: { label, titel?, url?, geraadpleegdOp? }.
	//
	// rel="external" is niet decoratief: daar hangt het externe-link-icoon aan
	// (a[rel~="external"]::after). noopener staat er meteen bij, omdat
	// external-links.js alleen bij het laden van de pagina langsgaat en deze
	// links pas daarna in de DOM komen.
	function bronnenHTML(bronnen) {
		if (!Array.isArray(bronnen) || !bronnen.length) return "";
		var vandaag = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
		var items = bronnen
			.map(function (bron) {
				var tekst = escapeHTML(bron.label) + (bron.titel ? ": " + escapeHTML(bron.titel) : "");
				// De bron mag zijn eigen URL meesturen; anders die uit STATUS_ITEMS,
				// zodat ook een bron die alleen bij naam genoemd wordt na te slaan is.
				var url = bron.url || bronURL(bron.label);
				var naam = url ? '<a rel="external noopener" target="_blank" href="' + escapeHTML(url) + '">' + tekst + "</a>" : "<span>" + tekst + "</span>";
				return "<li>" + naam + '<small class="chat-bron-datum">Geraadpleegd op ' + escapeHTML(bron.geraadpleegdOp || vandaag) + "</small></li>";
			})
			.join("");
		// Live noemt de assistent meestal één bron per antwoord; "Bronnen:" boven een
		// lijst van één leest als een fout.
		var label = bronnen.length === 1 ? "Bron:" : "Bronnen:";
		return '<p class="chat-bronnen-label">' + label + '</p><ul class="list-plain chat-bronnen">' + items + "</ul>";
	}

	// Eén bronvermelding uit tekst omzetten naar { label, titel, url }. Accepteert
	// wat de assistent in de praktijk schrijft:
	//   RegelRecht (art. 5.15 Besluit activiteiten leefomgeving)
	//   KvK Handelsregister: uittreksel onderneming
	//   [RVO: informatieplicht](https://www.rvo.nl/...)
	function maakBron(waarde) {
		var tekst = String(waarde == null ? "" : waarde)
			.trim()
			.replace(/[.\s]+$/, "");
		var url = "";
		var link = tekst.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
		if (link) {
			tekst = link[1].trim();
			url = link[2];
		}
		// De toevoeging tussen haakjes of achter de dubbele punt is de titel: het
		// wetsartikel of het onderdeel waar de bron over ging. Die hoort naast de
		// naam van de bron te staan, niet erin.
		var haakje = tekst.match(/^(.+?)\s*\((.+)\)$/);
		var dubbelePunt = tekst.match(/^([^:]+):\s*(.+)$/);
		var label = tekst;
		var titel = "";
		if (haakje) {
			label = haakje[1];
			titel = haakje[2];
		} else if (dubbelePunt) {
			label = dubbelePunt[1];
			titel = dubbelePunt[2];
		}
		return { label: label.trim(), titel: titel.trim(), url: url };
	}

	// De backend zet de bronvermelding als slotregel in de antwoordtekst
	// ("Bron: RegelRecht (art. 5.15 …)", zie prompts/blocks/shared/format.md daar),
	// niet als apart veld. Zonder deze stap blijft die regel gewone lopende tekst
	// midden in de ballon, terwijl de chat er een eigen patroon voor heeft.
	//
	// Haalt de bronregel(s) van het eind van de tekst en geeft { tekst, bronnen }
	// terug. Herkent zowel de slotregel als een "Bronnen:"-kop met opsomming
	// eronder. Staat er iets anders dan een opsomming vóór de kop, dan blijft de
	// tekst ongemoeid: een opsomming midden in een antwoord is inhoud, geen bron.
	var BRON_REGEL = /^bron(?:nen)?\s*:\s*(.*)$/i;
	function haalBronnenUitTekst(tekst) {
		var regels = String(tekst == null ? "" : tekst).split("\n");
		var opsomming = [];
		for (var i = regels.length - 1; i >= 0; i--) {
			var regel = regels[i].trim();
			if (!regel) continue;
			var bulletM = regel.match(/^[-*]\s+(.+)$/);
			if (bulletM) {
				opsomming.unshift(bulletM[1]);
				continue;
			}
			var bronM = regel.match(BRON_REGEL);
			if (!bronM) break;
			// "Bron: X" (waarde op dezelfde regel) of een kale "Bronnen:"-kop met de
			// opsomming die we hierboven al verzamelden.
			var waarden = bronM[1].trim() ? [bronM[1]] : opsomming;
			if (!waarden.length) break;
			var rest = regels.slice(0, i).join("\n").replace(/\s+$/, "");
			// Bestaat het hele bericht alleen uit de bronvermelding, dan is er geen
			// antwoord om hem onder te hangen; laat het dan zoals het was.
			if (!rest) break;
			return { tekst: rest, bronnen: waarden.map(maakBron) };
		}
		return { tekst: tekst, bronnen: [] };
	}

	// Bronnen onder een bericht hangen, vóór een eventuele vervolgstap-knop: die
	// knop hoort de laatste regel van de ballon te zijn.
	function voegBronnenToe(bericht, bronnen) {
		var html = bronnenHTML(bronnen);
		if (!bericht || !html) return;
		bericht.insertAdjacentHTML("beforeend", html);
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
	if (getDemoMode()) {
		// Zonder backend is er geen RegelRecht om de grens op te halen, en dan zou
		// de energiekaart de verbruikscijfers zonder grens-annotatie tonen — juist
		// die annotatie is waar de kaart om draait. Het draaiboek levert hem.
		walletDrempel = window.MozaDemoScript ? window.MozaDemoScript.drempel : null;
	} else {
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
	}

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

		var badge = metToestemming ? '<span class="wallet-badge">' + ICON_SUCCES + "Geverifieerd, met toestemming gedeeld</span>" : "";
		var uitgeverRegel = "Afgegeven door: " + escapeHTML(uitgever) + (peiljaar ? " · peiljaar " + escapeHTML(peiljaar) : "");

		el.innerHTML = '<h3 tabindex="-1">' + stapIcoon("wet") + "Energieverbruik (uit je Business Wallet)</h3>" + '<p class="wallet-uitgever">' + uitgeverRegel + " " + badge + "</p>" + '<dl class="wallet-cijfers">' + walletCijfer("Elektriciteit", kwh, "kWh", walletDrempel ? walletDrempel.kwh : null) + walletCijfer("Gas", m3, "m³", walletDrempel ? walletDrempel.gas : null) + "</dl>" + bronnenHTML([{ label: "Business Wallet", titel: "Energieverbruik-attestatie, afgegeven door " + uitgever }]);
		return el;
	}

	// Elke kaart krijgt een eigen nummer. Zonder dat zouden twee formulieren in
	// hetzelfde gesprek dezelfde veld-id's krijgen — en dan bedient een label in
	// het tweede formulier het keuzerondje van het eerste, omdat `for=` het eerste
	// element met die id pakt.
	var kaartTeller = 0;

	// --- Focus-ring alleen voor wie met het toetsenbord werkt -------------------
	//
	// De browser regelt dit normaal zelf met :focus-visible, maar hier gaat dat op
	// twee punten mis:
	//
	//   1. Een tekstveld matcht áltijd :focus-visible, ook bij een muisklik. Het
	//      invoerveld onderaan de chat krijgt dus altijd een ring.
	//   2. Springt de focus daarna programmatisch naar een keuzerondje of knop, dan
	//      erft dat element die vlag van het tekstveld — ook na een muisklik.
	//
	// We houden daarom zelf bij waarmee de gebruiker het laatst werkte en zetten
	// `data-focus-stil` op het element waar de ring niet hoort. De CSS-regel staat
	// bij de andere focusregels in style.css.
	//
	// Let op: spraakbediening en schakelaars sturen vaak een pointer-event, dus wie
	// zo werkt mist deze ring ook. Bij de eerste toets die de focus verplaatst is
	// hij er weer.
	var laatsteInvoerWasToets = false;

	// Toetsen die de focus verzetten. Alleen dán hoort de ring terug te komen:
	// gewoon doortypen in het invoerveld waar je net in klikte, moet niet ineens
	// een ring opleveren.
	var VERPLAATST_FOCUS = { Tab: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Home: 1, End: 1, PageUp: 1, PageDown: 1 };

	function maakFocusStil(el) {
		if (!el || el.hasAttribute("data-focus-stil")) return;
		el.setAttribute("data-focus-stil", "");
		el.addEventListener(
			"blur",
			function () {
				el.removeAttribute("data-focus-stil");
			},
			{ once: true }
		);
	}

	document.addEventListener(
		"keydown",
		function (e) {
			laatsteInvoerWasToets = true;
			// Wie met het toetsenbord verder navigeert, hoort weer te zien waar de
			// focus staat — ook op het element waar wij de ring net weglieten.
			if (!VERPLAATST_FOCUS[e.key] && e.target.hasAttribute && e.target.hasAttribute("data-focus-stil")) return;
			document.querySelectorAll("[data-focus-stil]").forEach(function (el) {
				el.removeAttribute("data-focus-stil");
			});
		},
		true
	);

	document.addEventListener(
		"pointerdown",
		function (e) {
			laatsteInvoerWasToets = false;
			// Klikken in het invoerveld hoort geen ring te geven; de cursor laat al
			// zien waar je bent. Dit gebeurt vóór de focus, zodat de ring niet even
			// oplicht. Alleen voor de chat: de rest van het prototype houdt het
			// browsergedrag.
			if (e.target === input) maakFocusStil(input);
		},
		true
	);

	// Focus verzetten, met de ring alleen voor wie met het toetsenbord werkt.
	//
	// `zonderScroll` is nodig bij de kaarten: focus() schuift het element vanzelf
	// in beeld, en dat zou de plaatsing van toonBericht meteen weer ongedaan maken.
	// Het eerste veld staat vlak onder de kop, dus na het positioneren staat het
	// alsnog in beeld.
	function zetFocus(el, zonderScroll) {
		if (!el) return null;
		if (!laatsteInvoerWasToets) maakFocusStil(el);
		el.focus(zonderScroll ? { preventScroll: true } : undefined);
		return el;
	}

	// Vraagt de assistent iets in het gesprek zelf, dan hoort de focus daar te
	// staan en niet in het invoerveld onderaan: dáár is de vraag, en typen is niet
	// wat er van de gebruiker gevraagd wordt. Focus gaat naar het eerste veld of de
	// eerste knop; is er niets te bedienen, dan naar de kop van de kaart.
	//
	// `beschrijving` is de id (of id's) van de kop en inleiding van de kaart. Die
	// hangen we als aria-describedby aan het eerste veld, zodat een schermlezer de
	// context nog steeds voorleest — die zou je anders overslaan door midden in het
	// formulier te beginnen.
	function focusEersteVraag(card, beschrijving) {
		// Staat er half getypte tekst in het invoerveld, dan laten we de focus met
		// rust: iemand midden in een zin de cursor afpakken is erger dan een extra
		// tab-druk.
		if (document.activeElement === input && input.value.trim()) return null;
		var eerste = card.querySelector("input:not([type=hidden]), select, textarea, button");
		if (eerste && beschrijving) eerste.setAttribute("aria-describedby", beschrijving);
		return zetFocus(eerste || card.querySelector("h3"), true);
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
		// De backend zegt per bron wat er gedeeld wordt (toestemming_nodig.omschrijving):
		// sinds toestemming per bron geldt, kan dit verzoek ook over het
		// Handelsregister gaan. De wallet-tekst blijft de terugval voor een
		// backend die het veld nog niet meestuurt.
		var omschrijving = (info && info.omschrijving) || "De assistent wil je energieverbruik-attestatie gebruiken (afgegeven door je netbeheerder). Er wordt niets opgehaald voordat je hier akkoord geeft.";
		var card = document.createElement("div");
		card.className = "wallet-card";
		card.setAttribute("data-verzoek", "backend");
		// De klik-handler heeft de bron nodig: de bevestiging en de weigering
		// horen te zeggen welke bron het betrof - dit verzoek kan net zo goed
		// over het Handelsregister gaan als over de Business Wallet.
		card.setAttribute("data-bron", bron);

		var kaartId = "deelverzoek-" + ++kaartTeller;
		var vraag = document.createElement("div");
		vraag.className = "wallet-consent";
		vraag.innerHTML = '<h3 id="' + kaartId + '-kop" tabindex="-1">' + stapIcoon("gegevensdeling") + "Deelverzoek uit " + escapeHTML(bron) + "</h3>" + '<p id="' + kaartId + '-uitleg">' + escapeHTML(omschrijving) + "</p>" + '<div class="action-group"><button type="button" class="wallet-delen">Delen</button><button type="button" class="secondary wallet-niet-delen">Niet delen</button></div>';
		card.appendChild(vraag);

		var nietGedeeld = document.createElement("div");
		nietGedeeld.className = "wallet-niet-gedeeld";
		nietGedeeld.hidden = true;
		nietGedeeld.innerHTML = "<p>Je hebt geen toestemming gegeven voor " + escapeHTML(bron) + ". De assistent raadpleegt deze bron niet.</p>";
		card.appendChild(nietGedeeld);

		messages.appendChild(card);
		// Hier wordt een besluit gevraagd, geen tekst: de focus hoort op "Delen" te
		// staan en niet in het invoerveld onderaan.
		focusEersteVraag(card, kaartId + "-kop " + kaartId + "-uitleg");
		toonBericht(card);
		return card;
	}

	// Deelverzoek-kaart: één .wallet-card met de vraag + (verborgen) energiekaart + notitie.
	// Alles staat direct in de DOM, zodat het de innerHTML-save/restore van handleSwitch overleeft.
	function renderWalletConsent(data, provenance) {
		var card = document.createElement("div");
		card.className = "wallet-card";

		var kaartId = "wallet-" + ++kaartTeller;
		var vraag = document.createElement("div");
		vraag.className = "wallet-consent";
		vraag.innerHTML = '<h3 id="' + kaartId + '-kop" tabindex="-1">' + stapIcoon("gegevensdeling") + "Deelverzoek uit je Business Wallet</h3>" + '<p id="' + kaartId + '-uitleg">De assistent wil je energieverbruik-attestatie uit je Business Wallet gebruiken (afgegeven door je netbeheerder). Je bepaalt zelf of je deze gegevens deelt.</p>' + '<div class="action-group"><button type="button" class="wallet-delen">Delen</button><button type="button" class="secondary wallet-niet-delen">Niet delen</button></div>';
		card.appendChild(vraag);

		card.appendChild(buildWalletEnergie(data, provenance));

		var nietGedeeld = document.createElement("div");
		nietGedeeld.className = "wallet-niet-gedeeld";
		nietGedeeld.hidden = true;
		nietGedeeld.innerHTML = "<p>Je hebt je energieverbruik niet gedeeld. De assistent kan de informatieplicht dan niet automatisch met je Business Wallet-gegevens controleren.</p>";
		card.appendChild(nietGedeeld);

		messages.appendChild(card);
		focusEersteVraag(card, kaartId + "-kop " + kaartId + "-uitleg");
		toonBericht(card);
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
			var geparsed = /erkende maatregelenlijst|\bEML\b|maatregel/i.test(platteTekst) ? parseVraag(platteTekst) : null;
			// Gemarkeerd als "uit de tekst geparsed": de tekst en het formulier
			// zijn dan hetzelfde ding, en de tekst er nog eens boven zetten zou
			// alles dubbel tonen.
			if (geparsed) geparsed.vanTekst = true;
			return geparsed;
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
		return '<fieldset data-veld="' + escapeHTML(veld.naam) + '" data-type="categorieen">' + "<legend>" + escapeHTML(veld.label) + "</legend>" + "<p>Kies eerst welke delen bij uw bedrijf voorkomen.</p>" + '<ul class="list-plain">' + stap1 + "</ul>" + stap2 + "</fieldset>";
	}

	function veldHTML(veld, index, kaartId) {
		var naam = kaartId + "-" + index + "-" + String(veld.naam).replace(/[^a-z0-9]/gi, "");
		if (veld.type === "categorieen") return categorieenHTML(veld, naam);
		if (veld.type === "radio" && veld.opties && veld.opties.length) {
			var opties = veld.opties
				.map(function (optie, j) {
					var id = naam + "-" + j;
					var gekozen = veld.waarde && optie === veld.waarde ? " checked" : "";
					return '<li><input type="radio" id="' + id + '" name="' + naam + '" value="' + escapeHTML(optie) + '"' + gekozen + '> <label for="' + id + '">' + escapeHTML(optie) + "</label></li>";
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
		var kaartId = "vraag-" + ++kaartTeller;
		var kopId = kaartId + "-kop";
		var introId = kaartId + "-intro";
		var velden = spec.velden
			.map(function (veld, index) {
				return veldHTML(veld, index, kaartId);
			})
			.join("");
		// Kop en inleiding staan in één blok met een eigen id, zodat het eerste veld
		// ernaar kan verwijzen: wie meteen in dat veld belandt, hoort anders wel de
		// vraag maar niet waar die over gaat.
		var intro = spec.intro ? "<p>" + escapeHTML(spec.intro) + "</p>" : "";
		var tekst = spec.tekst ? "<p>" + escapeHTML(spec.tekst) + "</p>" : "";
		// Zelfde bronvermelding als onder een antwoord: een formulier vraagt om
		// gegevens namens een regeling, dus de herkomst hoort er net zo bij te
		// staan — en op dezelfde manier, anders lijkt het een ander soort ding.
		var bronRegel = spec.bron ? bronnenHTML([maakBron(spec.bron)]) : "";
		card.innerHTML = '<h3 id="' + kopId + '" tabindex="-1">' + escapeHTML(spec.titel) + "</h3>" + (intro || tekst ? '<div id="' + introId + '">' + intro + tekst + "</div>" : "") + '<form class="vraag-form">' + velden + '<div class="action-group"><button type="submit">Antwoord versturen</button><button type="button" class="secondary vraag-uitleg">Leg mij dit uit</button></div>' + "</form>" + bronRegel;
		messages.appendChild(card);
		focusEersteVraag(card, kopId + (intro || tekst ? " " + introId : ""));
		toonBericht(card);
		return card;
	}

	function renderStatus(data) {
		var offline = document.getElementById("chat-offline");
		if (offline) offline.hidden = true;
		serverStatus = data;
		updateStatusDisplay();
	}

	function statusLijst(sources) {
		// Een bron die niet in /health staat bestaat niet in deze omgeving -
		// bewust uitgezet (bv. de Business Wallet tijdens het onderzoek). Die
		// hoort niet in de lijst als "niet bereikbaar": dat presenteert een
		// besluit als storing, en een respondent leest dat als "er is iets
		// kapot". Alleen als /health zelf onbereikbaar is (sources == null)
		// tonen we de volledige lijst als niet bereikbaar - dan is er echt
		// iets mis en is dat precies de boodschap.
		var items = STATUS_ITEMS.filter(function (it) {
			return !sources || sources[it.key] !== undefined;
		});
		return items
			.map(function (it) {
				var connected = !!(sources && sources[it.key] === "verbonden");
				var dot = connected ? "connected" : "disconnected";
				// Het icoon staat in de markup en niet als achtergrond in CSS, zodat het
				// via currentColor de statuskleur volgt. Het is decoratief (aria-hidden):
				// de status staat in woorden in de uitleg erachter. Een echte storing
				// staat in de melding boven het gesprek (#chat-offline).
				var icoon = connected ? ICON_SUCCES : ICON_FOUTMELDING;
				var status = connected ? "Nu bereikbaar." : "Nu niet bereikbaar. De assistent kan deze bron op dit moment niet gebruiken.";
				var id = "bron-uitleg-" + it.key;
				// De naam is focusbaar (tabindex) zodat de uitleg ook met het toetsenbord
				// te bereiken is, en aria-describedby koppelt hem voor de schermlezer —
				// een title-attribuut doet geen van beide betrouwbaar.
				return '<li class="chat-status-' + dot + '">' + icoon + '<span class="chat-status-bron" tabindex="0" aria-describedby="' + id + '">' + it.label + "</span>" + '<span class="chat-status-uitleg" role="tooltip" id="' + id + '">' + it.uitleg + " " + status + "</span>" + "</li>";
			})
			.join("");
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

	// Haal status op bij laden (3s timeout zodat de pagina niet hangt als de host niet draait).
	// In demo-modus komt de status uit het draaiboek: zonder backend zou /health
	// falen en stond er vijf keer "niet bereikbaar", wat als storing leest terwijl
	// er niets stuk is.
	function haalStatus() {
		if (getDemoMode()) {
			renderStatus(window.MozaDemoScript ? window.MozaDemoScript.health : {});
			return;
		}
		fetch(API_BASE + "/health", { signal: AbortSignal.timeout(3000) })
			.then(function (r) {
				return r.json();
			})
			.then(renderStatus)
			.catch(renderStatusOffline);
	}
	haalStatus();

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

	// "Bewaar gesprek" volgt dezelfde regel als "Nieuw gesprek starten": er valt
	// pas iets te bewaren zodra er een vraag is gesteld. Aan staat de knop er ook
	// voor die niet klikt — aria-disabled in plaats van disabled, zodat de knop
	// bereikbaar blijft voor toetsenbord en schermlezer.
	var bewaarKnop = document.getElementById("chat-bewaar");
	var bewaarMelding = document.getElementById("chat-bewaar-melding");
	var BEWAAR_LABEL = bewaarKnop ? bewaarKnop.textContent : "Bewaar gesprek";

	function enableNieuwKnop() {
		if (nieuwKnop) nieuwKnop.removeAttribute("aria-disabled");
		if (bewaarKnop) bewaarKnop.removeAttribute("aria-disabled");
	}

	function disableNieuwKnop() {
		if (nieuwKnop) nieuwKnop.setAttribute("aria-disabled", "true");
		if (bewaarKnop) bewaarKnop.setAttribute("aria-disabled", "true");
	}

	// Terug naar de uitgangsstand: na een nieuwe vraag valt er weer wat te bewaren,
	// ook als het gesprek net bewaard was.
	function herstelBewaarKnop() {
		if (!bewaarKnop) return;
		bewaarKnop.textContent = BEWAAR_LABEL;
		if (bewaarMelding) bewaarMelding.textContent = "";
	}

	// Het gesprek gaat in het bewaarde item zelf, niet in een losse sleutel. Zo
	// verdwijnt het mee als iemand het item op Bewaarde items verwijdert, en
	// blijven er geen losse gesprekken in localStorage achter.
	var BEWAAR_CATEGORIE = "Digitale assistent";
	var BEWAAR_TITEL_MAX = 80;

	function bewaarTitel() {
		var eerste = messages.querySelector(".chat-message-user p");
		var vraag = eerste ? eerste.textContent.trim() : "";
		if (vraag.length <= BEWAAR_TITEL_MAX) return vraag;
		return vraag.slice(0, BEWAAR_TITEL_MAX).replace(/\s+\S*$/, "") + "…";
	}

	function bewaarGesprek() {
		var titel = bewaarTitel();
		if (!titel) return;
		var vandaag = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
		var item = {
			title: titel,
			// Bewaarde items linkt hiernaartoe; de parameter zegt welk gesprek.
			url: location.pathname + "?gesprek=" + encodeURIComponent(titel),
			desc: "Gesprek van " + vandaag,
			category: BEWAAR_CATEGORIE,
			gesprek: messages.innerHTML,
		};
		try {
			localStorage.setItem("favorite:" + titel, JSON.stringify(item));
		} catch (e) {
			// Vol of privémodus: zeggen dat het niet gelukt is, niet doen alsof wel.
			if (bewaarMelding) bewaarMelding.textContent = "Het gesprek kon niet worden bewaard.";
			return;
		}
		bewaarKnop.textContent = "Gesprek bewaard";
		bewaarKnop.setAttribute("aria-disabled", "true");
		if (bewaarMelding) bewaarMelding.textContent = "Het gesprek staat nu bij uw bewaarde items.";
	}

	if (bewaarKnop)
		bewaarKnop.addEventListener("click", function () {
			if (bewaarKnop.getAttribute("aria-disabled") === "true") return;
			bewaarGesprek();
		});

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
		// Demo-modus aan of uit zetten verandert waar de bronstatus vandaan komt en
		// waar het draaiboek staat, zonder dat de pagina herlaadt.
		if (e.detail && e.detail.key === "demo-mode") {
			demoStand = { scenario: null, beurt: 0 };
			if (getDemoMode() && window.MozaDemoScript) walletDrempel = window.MozaDemoScript.drempel;
			haalStatus();
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
		zetFocus(input);
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
			if (vanBackend) {
				if (submitting) return;
				// Niet verbergen maar vervangen: een lege kaart-rand blijft anders
				// als loze balk in het gesprek staan, en de respondent hoort terug
				// te kunnen lezen waar hij ja tegen zei (traceability).
				var kaartBron = card.getAttribute("data-bron") || "deze bron";
				card.querySelector(".wallet-consent").innerHTML = "<p>Toestemming gegeven voor " + escapeHTML(kaartBron) + ".</p>";
				pendingToestemming = true;
				// De scope van het akkoord ligt server-side vast bij het openstaande
				// deelverzoek; de tekst hier is voor het gesprek, niet het contract.
				input.value = "Ja, ik geef toestemming.";
				form.requestSubmit();
				return;
			}
			card.querySelector(".wallet-consent").hidden = true;
			var energie = card.querySelector(".wallet-energie");
			energie.hidden = false;
			// De kaart klapt open en wordt daarmee hoger dan het venster: bovenaan
			// beginnen, anders staat de gebruiker onder de cijfers die die net deelde.
			zetFocus(energie.querySelector("h3"), true);
			toonBericht(card);
		} else if (e.target.closest(".wallet-niet-delen")) {
			card.querySelector(".wallet-consent").hidden = true;
			card.querySelector(".wallet-niet-gedeeld").hidden = false;
			toonBericht(card);
			// Zonder beurt blijft de assistent wachten op een antwoord dat de
			// respondent al gegeven heeft. Het weigeren gaat als bericht mee,
			// niet als contractveld: toestemming wordt alleen vastgelegd, nooit
			// ingetrokken.
			if (vanBackend && !submitting) {
				input.value = "Nee, ik geef geen toestemming.";
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
		// Typografische aanhalingstekens: dit is lopende tekst in het gesprek, geen
		// code. Zie de Schrijfwijzer.
		if (onderwerp) bericht += ": “" + onderwerp + "”";
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

	// Eén binnengekomen event verwerken (status, tool, case, answer, error, done).
	// Staat los van de fetch-lus, zodat de demo-modus dezelfde events kan afspelen
	// als de backend stuurt: één renderpad, dus wat in de demo te zien is, is wat
	// de gebruiker live ook krijgt.
	//
	// `beurt` draagt wat binnen één beurt onthouden moet worden:
	//   comboKey    — de combinatie waarin deze beurt begon
	//   answered    — er is al een answer of error getoond
	//   zaakGemaakt — er kwam een case-event, dus het antwoord krijgt een knop
	//   verzoek     — het deelverzoek van deze beurt, pas te tonen ná het antwoord
	function verwerkEvent(eventType, payload, beurt) {
		var comboKey = beurt.comboKey;

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
			// Het case-event komt vóór het answer-event; deze vlag laat het
			// antwoord straks de knop "Bekijk in Lopende zaken" dragen.
			beurt.zaakGemaakt = true;
		} else if ((eventType === "answer" || eventType === "error") && !beurt.answered) {
			beurt.answered = true;
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
				beurt.verzoek = payload.toestemming_nodig;
			}
			// Bronvermelding: bij voorkeur als data (`bronnen`), anders uit de
			// slotregel van de tekst. Een foutmelding blijft ongemoeid — daar
			// hoort de contactknop onder, geen bronvermelding.
			var uitTekst = eventType === "answer" ? haalBronnenUitTekst(payload.message) : { tekst: payload.message, bronnen: [] };
			var bronnen = Array.isArray(payload.bronnen) && payload.bronnen.length ? payload.bronnen : uitTekst.bronnen;
			var tekst = uitTekst.tekst;

			var spec = eventType === "answer" && getComboKey() === comboKey ? vraagSpec(payload) : null;
			if (spec) {
				// De tekst niet weggooien: zolang de toets op een opgave
				// wacht draagt elk antwoord het formulier mee, ook het
				// antwoord op "Leg mij dit uit". Zonder deze regel verving
				// het formulier de uitleg en leek de knop stuk - de
				// respondent kreeg letterlijk hetzelfde formulier terug.
				// Alleen bij een gestructureerde vraag: is het formulier
				// uit de tekst zelf geparsed, dan zíjn tekst en formulier
				// hetzelfde en zou alles dubbel staan.
				var inleiding = null;
				if (tekst && !spec.vanTekst) {
					inleiding = addMessage(tekst, "assistant");
					voegBronnenToe(inleiding, bronnen);
				}
				var kaart = renderAssistentVraag(spec);
				// De tekst boven het formulier is de uitleg; die hoort als eerste in
				// beeld te staan. Staat er geen tekst, dan de kaart zelf.
				toonBericht(inleiding || kaart);
			} else {
				var role = eventType === "error" ? "error" : "assistant";
				var bericht;
				// Toon alleen als gebruiker nog in dezelfde combinatie zit
				if (getComboKey() === comboKey) {
					bericht = addMessage(tekst, role);
				} else {
					// Sla op in chatHistory zodat het zichtbaar wordt bij terugwisselen
					var temp = messages.innerHTML;
					messages.innerHTML = chatHistory[comboKey] || "";
					voegBronnenToe(addMessage(tekst, role), role === "assistant" ? bronnen : null);
					bewaarHistorie(comboKey);
					messages.innerHTML = temp;
				}
				// Eerst de bronnen, dan pas de vervolgstap: de knop hoort de
				// laatste regel van de ballon te zijn.
				if (role === "assistant") voegBronnenToe(bericht, bronnen);
				// De vervolgstap hoort bij dit antwoord: een ingediende zaak
				// verwijst naar Lopende zaken, een doodloper naar Contact.
				// Alleen bij een zichtbaar bericht; in de weggeschreven
				// historie zou de knop naar het verkeerde gesprek wijzen.
				if (bericht && role === "error") {
					voegVervolgstapToe(bericht, "Neem contact op", messages.dataset.urlContact);
				} else if (bericht && beurt.zaakGemaakt) {
					voegVervolgstapToe(bericht, "Bekijk in Lopende zaken", messages.dataset.urlZaken);
				}
				// Pas nu positioneren: het bericht is compleet, dus de hoogte klopt.
				toonBericht(bericht);
			}
		} else if (eventType === "done") {
			hideThinking();
		}
	}

	// Demo-modus: speel de events van deze beurt af uit het draaiboek
	// (digitale-assistent-demo.js) alsof ze van de backend komen. De wachttijden
	// zitten in het draaiboek, zodat het tempo daar in één oogopslag te zien is.
	async function speelDemoBeurt(message, beurt) {
		var script = window.MozaDemoScript;
		if (!script) {
			verwerkEvent("error", { message: "Het demo-draaiboek is niet geladen. Herlaad de pagina." }, beurt);
			return;
		}
		var persona = getPersona();
		var stappen = script.kies(message, demoStand, { kvkNummer: getTestUser(), bedrijf: persona && persona.bedrijf }) || [];
		for (var i = 0; i < stappen.length; i++) {
			await wait(stappen[i].wacht || 600);
			// Tussentijds van persona of LLM gewisseld: de rest van het draaiboek
			// hoort niet in het gesprek waar de gebruiker nu naar kijkt.
			if (getComboKey() !== beurt.comboKey) return;
			verwerkEvent(stappen[i].event, stappen[i].data, beurt);
		}
		verwerkEvent("done", {}, beurt);
	}

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
		// Het gesprek is met deze vraag veranderd, dus er valt weer wat te bewaren.
		herstelBewaarKnop();
		addMessage(message, "user");
		input.value = "";
		input.style.blockSize = "auto";
		setLoading(true);

		// Alles wat deze beurt onthouden moet worden; verwerkEvent vult het aan.
		// Het deelverzoek (`verzoek`) wordt pas ná het antwoord getoond: de kaart
		// hoort ná de uitleg te komen, niet ervoor.
		var beurt = { comboKey: comboKey, answered: false, zaakGemaakt: false, verzoek: null };

		if (getDemoMode()) {
			try {
				await speelDemoBeurt(message, beurt);
			} finally {
				setLoading(false);
				submitting = false;
				if (heeftGesprek) enableNieuwKnop();
				// Na submitting = false, anders weigert de knop in de kaart de beurt
				// die hij zelf moet starten.
				if (beurt.verzoek && getComboKey() === comboKey) renderDeelverzoek(beurt.verzoek);
				if (getComboKey() === comboKey) bewaarHistorie(comboKey);
			}
			return;
		}

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
				body: JSON.stringify(bouwVerzoek(message, sessions[comboKey], mode, opgaven, toestemming)),
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

					verwerkEvent(eventType, JSON.parse(dataLine), beurt);
				}
			}

			setLoading(false);
		} catch (err) {
			setLoading(false);
			if (!beurt.answered) {
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
				voegVervolgstapToe(addMessage(reason, "error"), "Neem contact op", messages.dataset.urlContact);
			}
		} finally {
			clearTimeout(connectTimer);
			if (idleTimer) clearTimeout(idleTimer);
			submitting = false;
			if (heeftGesprek) enableNieuwKnop();
			// Na submitting = false, anders weigert de knop in de kaart de beurt die
			// hij zelf moet starten.
			if (beurt.verzoek && getComboKey() === comboKey) renderDeelverzoek(beurt.verzoek);
			// Vastleggen na afloop van de beurt, niet per bericht: bij een
			// afgebroken stream staat de laatste stand er dan alsnog in.
			if (getComboKey() === comboKey) bewaarHistorie(comboKey);
		}
	});

	// Demo/test-hook: een volledig antwoord met bronvermelding, zonder backend.
	// Laat zien hoe de assistent haar antwoord traceerbaar maakt: elke bron die is
	// geraadpleegd staat eronder, met de datum van raadpleging.
	var TEST_VRAAG = "Geldt de energiebesparingsinformatieplicht voor mijn bedrijf?";
	var TEST_ANTWOORD = "Ja, die geldt voor uw bedrijf. U gebruikt per jaar meer dan 50.000 kWh elektriciteit of 25.000 m³ aardgas, en dan bent u verplicht energie te besparen én te rapporteren welke maatregelen u heeft genomen.\n\n" + "Voor uw branche staan 5 erkende maatregelen op de lijst. U rapporteert uiterlijk 1 december 2026 bij de RVO.\n\n" + "Controleer dit bij twijfel bij uw omgevingsdienst: die houdt toezicht op deze plicht.";
	var TEST_BRONNEN = [
		{
			label: "KvK Handelsregister",
			titel: "Bedrijfsgegevens: SBI-code, rechtsvorm en vestiging",
			url: "https://www.kvk.nl/handelsregister/",
		},
		{
			label: "KOOP Regelingenbank",
			titel: "Activiteitenbesluit milieubeheer, artikel 2.15",
			url: "https://wetten.overheid.nl/BWBR0022762/",
		},
		{
			label: "RVO",
			titel: "Informatieplicht energiebesparing: rapportagetermijn",
			url: "https://www.rvo.nl/onderwerpen/informatieplicht-energiebesparing",
		},
	];

	function toonTestAntwoord() {
		verwijderSuggestieIntro();
		addMessage(TEST_VRAAG, "user");
		showThinking("Bronnen raadplegen…");
		return wait(1200).then(function () {
			hideThinking();
			var bericht = addMessage(TEST_ANTWOORD, "assistant");
			voegBronnenToe(bericht, TEST_BRONNEN);
			return bericht;
		});
	}

	// Demo/test-hook: een antwoord mét bronvermelding in de chat zetten. Wordt ook
	// aangeroepen vanuit het Flags-paneel.
	window.MozaAssistent = {
		testAntwoord: toonTestAntwoord,
	};

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

	// Een bewaard gesprek terugzetten (?gesprek=…), vanaf Bewaarde items. Het
	// gesprek staat in het bewaarde item zelf. De backend-sessie hoort er niet
	// meer bij — die was van een ander moment en is daar allang opgeruimd — dus
	// een vervolgvraag start een nieuw gesprek bij de host, met de oude beurten
	// nog wel zichtbaar voor de gebruiker.
	function herstelBewaardGesprek(titel) {
		var raw;
		try {
			raw = localStorage.getItem("favorite:" + titel);
		} catch (e) {
			return false;
		}
		if (!raw) return false;
		var data;
		try {
			data = JSON.parse(raw);
		} catch (e) {
			return false;
		}
		if (!data || !data.gesprek) return false;
		var combo = getComboKey();
		delete sessions[combo];
		bewaarSessies();
		messages.innerHTML = data.gesprek;
		messages.scrollTop = 0;
		heeftGesprek = true;
		enableNieuwKnop();
		bewaarKnop.textContent = "Gesprek bewaard";
		bewaarKnop.setAttribute("aria-disabled", "true");
		bewaarHistorie(combo);
		return true;
	}

	// Startvraag via URL-parameter (?vraag=…), bijvoorbeeld vanuit de
	// notificatie op het dashboard. Vult het invoerveld en verstuurt direct,
	// zodat het gesprek zonder extra klik begint.
	var startvraag = new URLSearchParams(location.search).get("vraag");
	var bewaardGesprek = new URLSearchParams(location.search).get("gesprek");
	if (bewaardGesprek && herstelBewaardGesprek(bewaardGesprek)) {
		// Niets meer doen: het gesprek staat er, onboarding zou eroverheen komen.
	} else if (startvraag && startvraag.trim()) {
		// Wie via "Vraag aan de digitale assistent" binnenkomt, heeft zijn vraag al
		// gesteld. De onboarding — drie ballonnen met wachttijd ertussen — wringt
		// zich dan tussen de klik en het antwoord. Die slaan we over, ook bij een
		// eerste bezoek, en we markeren hem niet als gezien: wie later zonder vraag
		// binnenkomt krijgt de uitleg alsnog, en via "Nieuw gesprek" staat de knop
		// "Toon de uitleg opnieuw" er ook. Dat de assistent AI is, staat los van de
		// onboarding onder het gesprek in de disclaimer.
		input.value = startvraag.trim();
		form.requestSubmit();
	} else if (heeftOnboardingGezien()) {
		naWachten(function () {
			showSuggestionPrompt(true);
		}, WACHT_PAGINALAAD);
	} else {
		// Eerste bezoek: toon onboarding inclusief intro, zonder replay-knop
		showOnboardingMessages().then(function () {
			markeerOnboardingGezien();
		});
	}
})();
