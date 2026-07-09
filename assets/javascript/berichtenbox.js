/**
 * berichtenbox.js
 *
 * Client-side gedrag voor de FBS Berichtenbox-mock.
 * State (gelezen, archief, prullenbak, map-toewijzingen, eigen mappen)
 * wordt bewaard in localStorage onder de key "berichtenbox".
 * Statische lijst komt uit de server-gerenderde HTML; JS manipuleert
 * zichtbaarheid en klassen op basis van state.
 */

(function() {
	"use strict";

	// Werk de badges voor ongelezen berichten bij op alle pagina's vanuit
	// localStorage (side-nav én hoofdnavigatie kunnen allebei een badge tonen).
	try {
		const navBadges = document.querySelectorAll('[data-berichtenbox-count="ongelezen"]');
		if (navBadges.length) {
			const opgeslagen = JSON.parse(localStorage.getItem('berichtenbox') || '{}');
			if (typeof opgeslagen.aantalOngelezen === 'number') {
				navBadges.forEach((badge) => { badge.textContent = opgeslagen.aantalOngelezen > 0 ? opgeslagen.aantalOngelezen : ''; });
			}
		}
	} catch (e) { /* localStorage niet toegankelijk */ }

	// Kebab-menu's in berichtenbox-rijen: openen/sluiten. Bewust vóór de data-guard,
	// zodat het ook werkt op demo-berichtenboxen (mobu/belang) die geen volledige
	// data hebben. Heeft geen state nodig; de acties zelf staan achter de guard.
	(function () {
		function sluitRijMenus(behalve) {
			document.querySelectorAll('.row-actions-toggle[aria-expanded="true"]').forEach((btn) => {
				if (btn === behalve) return;
				btn.setAttribute('aria-expanded', 'false');
				if (btn.nextElementSibling) btn.nextElementSibling.hidden = true;
			});
		}
		document.addEventListener('click', (e) => {
			const toggle = e.target.closest('.row-actions-toggle');
			if (toggle) {
				const menu = toggle.nextElementSibling;
				const open = toggle.getAttribute('aria-expanded') === 'true';
				sluitRijMenus(toggle);
				toggle.setAttribute('aria-expanded', String(!open));
				if (menu) menu.hidden = open;
				return;
			}
			// Menukeuze of klik buiten het menu sluit alle open menu's.
			if (e.target.closest('[data-row-actie]') || !e.target.closest('.row-actions')) {
				sluitRijMenus();
			}
		});
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				const open = document.querySelector('.row-actions-toggle[aria-expanded="true"]');
				sluitRijMenus();
				if (open) open.focus();
			}
		});
	})();

	const wrapper = document.querySelector('.berichtenbox');
	if (!wrapper) {
		// Geen volledige berichtenbox op deze pagina (bijv. de homepage-preview).
		// De rest van de IIFE stopt hieronder; markeren regelen we hier apart en
		// delen alleen de localStorage-state (key "berichtenbox", veld gemarkeerd).
		document.querySelectorAll('.berichtenbox-row[data-bericht-id] [data-mark-toggle]').forEach((knop) => {
			const id = knop.closest('.berichtenbox-row').dataset.berichtId;
			const vh = knop.querySelector('.visually-hidden');
			function leesState() {
				try { return JSON.parse(localStorage.getItem('berichtenbox') || '{}'); }
				catch (e) { return {}; }
			}
			function toonMarkering(aan) {
				knop.classList.toggle('is-marked', aan);
				knop.setAttribute('aria-pressed', aan ? 'true' : 'false');
				if (vh) vh.textContent = aan ? 'Markering verwijderen' : 'Markeren';
			}
			const opgeslagen = leesState().gemarkeerd || {};
			if (id in opgeslagen) toonMarkering(!!opgeslagen[id]);
			knop.addEventListener('click', () => {
				const aan = !knop.classList.contains('is-marked');
				toonMarkering(aan);
				const s = leesState();
				if (!s.gemarkeerd) s.gemarkeerd = {};
				s.gemarkeerd[id] = aan;
				try { localStorage.setItem('berichtenbox', JSON.stringify(s)); }
				catch (e) { console.error('[Berichtenbox] Kon markering niet bewaren.', e); }
			});
		});
		return;
	}

	const data = window.berichtenboxData;
	if (!data || !Array.isArray(data.berichten) || !Array.isArray(data.mappen) || !Array.isArray(data.magazijnen)) {
		console.error('[Berichtenbox] window.berichtenboxData ontbreekt of is incompleet; script gestopt.');
		return;
	}

	// Persona-relevantie (Aanpak A). Bepaal de actieve persona (zelfde volgorde als
	// personas.js: ?persona= > localStorage > actief) en toon berichten met een
	// relevantVoor-tag alleen bij de juiste persona. Berichten zonder tag zijn
	// generiek en verschijnen altijd. Persona-wisseling herlaadt de pagina, dus
	// het volstaat dit één keer bij het laden te bepalen.
	const actievePersonaId = (function () {
		const personas = window.personasData;
		if (!Array.isArray(personas) || !personas.length) return null;
		const param = new URLSearchParams(location.search).get('persona');
		if (param) {
			const gevonden = personas.find((p) => p.label === param) || personas.find((p) => p.id === param);
			if (gevonden) return gevonden.id;
		}
		try {
			const opgeslagen = localStorage.getItem('persona');
			if (opgeslagen && personas.some((p) => p.id === opgeslagen)) return opgeslagen;
		} catch (e) { /* localStorage niet toegankelijk */ }
		const actief = personas.find((p) => p.actief);
		return actief ? actief.id : personas[0].id;
	})();
	function persoonRelevant(bericht) {
		if (!bericht || !Array.isArray(bericht.relevantVoor) || !bericht.relevantVoor.length) return true;
		return actievePersonaId != null && bericht.relevantVoor.indexOf(actievePersonaId) !== -1;
	}

	// Eleventy pathPrefix — via window.PATH_PREFIX uit base.njk.
	// pathPrefix moet beginnen met '/'; herstel dat als dat niet zo is.
	let rawPrefix = (typeof window.PATH_PREFIX === 'string' && window.PATH_PREFIX) ? window.PATH_PREFIX : '/';
	if (!rawPrefix.startsWith('/')) rawPrefix = '/' + rawPrefix;
	const PATH_PREFIX = rawPrefix;
	function url(absPath) {
		if (PATH_PREFIX === '/') return absPath;
		return PATH_PREFIX.replace(/\/$/, '') + absPath;
	}
	// Basis-URL van de berichtenbox waarin we ons bevinden, zodat berichten en
	// acties binnen het juiste portaal (MOZa of Mijn Belastingdienst) blijven.
	function berichtenboxBasis() {
		return location.pathname.indexOf('/mijn-belastingdienst/') !== -1
			? '/mijn-belastingdienst/berichtenbox/'
			: '/moza/berichtenbox/';
	}
	const POLL_MIN_SEC = 5;
	const NIEUWE_BERICHTEN_LIMIET = 5;

	const LS_KEY = "berichtenbox";

	const defaultState = {
		eersteBezoekGehad: false,
		gelezen: {},
		ongelezenToegevoegd: {},
		gearchiveerd: {},
		verwijderd: {},
		gemarkeerd: {},
		mapOverride: {},
		eigenMappen: [],
		// Via polling binnengekomen berichten; bewaard zodat ze na reload zichtbaar blijven.
		nieuweBerichten: [],
		// A/B-test Belastingdienst-berichtenbox: ook berichten van andere organisaties tonen.
		toonAndereOrganisaties: false,
	};

	function readState() {
		try {
			const raw = localStorage.getItem(LS_KEY);
			if (!raw) return { ...defaultState };
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw new Error('state is geen object');
			}
			const merged = { ...defaultState, ...parsed };
			// Normaliseer types zodat writeState/render niet kunnen crashen op corrupte keys.
			if (!Array.isArray(merged.nieuweBerichten)) merged.nieuweBerichten = [];
			const bekendeMagazijnen = new Set(data.magazijnen.map((m) => m.id));
			merged.nieuweBerichten = merged.nieuweBerichten
				.filter((b) => bekendeMagazijnen.has(b.magazijnId))
				.slice(-NIEUWE_BERICHTEN_LIMIET);
			if (!Array.isArray(merged.eigenMappen)) merged.eigenMappen = [];
			['gelezen','ongelezenToegevoegd','gearchiveerd','verwijderd','gemarkeerd','mapOverride'].forEach((k) => {
				if (!merged[k] || typeof merged[k] !== 'object' || Array.isArray(merged[k])) merged[k] = {};
			});
			return merged;
		} catch (e) {
			console.warn('[Berichtenbox] State corrupt of niet toegankelijk; terugvallen op default.', e);
			return { ...defaultState };
		}
	}

	function writeState(state) {
		if (state.nieuweBerichten.length > NIEUWE_BERICHTEN_LIMIET) {
			state.nieuweBerichten = state.nieuweBerichten.slice(-NIEUWE_BERICHTEN_LIMIET);
		}
		try {
			localStorage.setItem(LS_KEY, JSON.stringify(state));
		} catch (e) {
			// QuotaExceededError of SecurityError (Safari private mode) — laat demo verder draaien.
			console.error('[Berichtenbox] Kon state niet opslaan.', e);
		}
	}

	const state = readState();

	function statusVan(berichtId) {
		if (state.verwijderd[berichtId]) return "prullenbak";
		if (state.gearchiveerd[berichtId]) return "archief";
		return "inbox";
	}

	function isOngelezen(berichtId, origineelOngelezen) {
		if (state.ongelezenToegevoegd[berichtId]) return true;
		if (state.gelezen[berichtId]) return false;
		return origineelOngelezen;
	}

	function mapVan(berichtId, origineleMap) {
		if (berichtId in state.mapOverride) return state.mapOverride[berichtId];
		return origineleMap;
	}

	function isGemarkeerd(berichtId, origineelGemarkeerd) {
		if (berichtId in state.gemarkeerd) return !!state.gemarkeerd[berichtId];
		return !!origineelGemarkeerd;
	}

	// Oog-iconen voor de gelezen/ongelezen-knop. Open oog (tonen) = "maak gelezen",
	// doorgestreept oog (ongelezen) = "maak ongelezen". Icoon volgt het label/actie.
	const SVG_OOG_PAD = 'M59.13 28.33C55.86 23.1 47.14 12 32 12S8.14 23.09 4.87 28.33a5.06 5.06 0 0 0 0 5.35C8.14 38.91 16.86 50.01 32 50.01s23.86-11.09 27.13-16.33a5.06 5.06 0 0 0 0-5.35M32 20.9c3.37 0 6.1 2.73 6.1 6.1s-2.73 6.1-6.1 6.1-6.1-2.73-6.1-6.1 2.73-6.1 6.1-6.1M32 45C16.62 45 9.78 31 9.78 31s3.1-6.34 9.82-10.49c-.78 1.49-1.31 3.12-1.51 4.84C17.12 33.82 23.72 41 32 41c7.37 0 13.42-5.7 13.96-12.94.36-4.83-4.08-7.81-8.46-10.13-.18-.1-.17-.3-.16-.34C48.98 20.26 54.22 31 54.22 31S47.38 45 32 45';
	const SVG_TONEN = '<path fill="currentColor" d="' + SVG_OOG_PAD + '" />';
	const SVG_ONGELEZEN = '<mask id="gap"><rect width="64" height="64" fill="white" /><line x1="12" y1="52" x2="52" y2="12" stroke="black" stroke-width="12" stroke-linecap="round" /></mask><path mask="url(#gap)" fill="currentColor" d="' + SVG_OOG_PAD + '" /><path fill="currentColor" d="M10.59 53.41a2 2 0 0 1 0-2.82L50.59 10.59a2 2 0 1 1 2.82 2.82L13.41 53.41a2 2 0 0 1-2.82 0z" />';

	// Wissel label én icoon van de "Markeer als ongelezen"-knop.
	function werkOngelezenKnopBij(btn, ongelezen) {
		const labelNode = [...btn.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
		const tekst = ongelezen ? 'Markeer als gelezen' : 'Markeer als ongelezen';
		if (labelNode) labelNode.textContent = tekst;
		else btn.append(tekst);
		const svg = btn.querySelector('svg');
		if (svg) svg.innerHTML = ongelezen ? SVG_TONEN : SVG_ONGELEZEN;
	}

	// Werk de Markeren-actieknop op de detailpagina bij (label + aria-pressed + class).
	function werkMarkeerKnopBij(btn, gemarkeerd) {
		btn.setAttribute('aria-pressed', gemarkeerd ? 'true' : 'false');
		btn.classList.toggle('is-marked', gemarkeerd);
		const label = btn.querySelector('[data-markeer-label]');
		if (label) label.textContent = gemarkeerd ? 'Markering verwijderen' : 'Markeren';
	}

	// A/B-test: het org-filter is alleen actief op een berichtenbox met de toggle
	// (de Belastingdienst-berichtenbox). Standaard tonen we alleen 'belastingdienst';
	// staat de toggle aan, dan ook de berichten van andere organisaties.
	const ORG_EIGEN = 'belastingdienst';
	const ORG_FEATURE = 'Berichten van andere organisaties';
	// Alleen het Belastingdienst-portaal filtert op organisatie; MOZa toont altijd
	// alles. Portaalbepaling via de basis-URL zodat het ook geldt op pagina's
	// zonder de org-switch (archief, prullenbak, detail).
	function orgFilterActief() {
		return berichtenboxBasis().indexOf('/mijn-belastingdienst/') !== -1;
	}
	// Staat de feature-flag aan? Lees rechtstreeks uit localStorage (zelfde sleutel
	// als feature-flags.js, default-off). Werkt ook op pagina's waar de switch zelf
	// niet in de DOM staat. Flag uit ⇒ versie A (alleen Belastingdienst), ook al
	// stond de switch eerder aan.
	function andereOrgenFeatureAan() {
		try {
			return localStorage.getItem('feature:' + ORG_FEATURE) === 'true';
		} catch (e) {
			return false;
		}
	}
	// Unhappy-flow (feature flag "Berichtenbox unhappy flow"): één bron (RDW) is
	// onbereikbaar. Zolang de flag aan staat en de gebruiker niet handmatig heeft
	// hersteld, tellen RDW-berichten niet mee in de lijst en de tellers.
	const ONBEREIKBARE_BRON = "rdw";
	let bronHandmatigHersteld = false;
	// De flag wordt persistent bewaard in een cookie (overleeft localStorage-wissen),
	// zie PERSISTENT_FEATURES in feature-flags.js.
	function unhappyFlowAan() {
		const rij = document.cookie.split("; ").find((r) => r.startsWith("unhappy-flow="));
		return !!rij && rij.split("=").slice(1).join("=") === "true";
	}
	// Met de flag aan wordt per page-load willekeurig één scenario gekozen:
	//  - "een":   alleen RDW is bij het laden onbereikbaar.
	//  - "geen":  geen enkele bron is bij het laden bereikbaar.
	//  - "later": alle bronnen laden succesvol, waarna op een willekeurig moment
	//             één bron uitvalt (zie plannBronUitval / sessionStorage).
	// De keuze wordt gecachet zodat die stabiel is binnen één weergave; bij het
	// uit-/aanzetten van de flag (feature-flags-applied) wordt opnieuw gekozen.
	const UNHAPPY_SCENARIOS = ["een", "geen", "later"];
	let scenarioGekozen = false;
	let unhappyScenario = "een";
	function huidigUnhappyScenario() {
		if (!scenarioGekozen) {
			unhappyScenario = UNHAPPY_SCENARIOS[Math.floor(Math.random() * UNHAPPY_SCENARIOS.length)];
			scenarioGekozen = true;
		}
		return unhappyScenario;
	}
	function bronOnbereikbaar() {
		if (bronHandmatigHersteld) return false;
		return unhappyFlowAan();
	}
	function magazijnGeblokkeerd(magazijnId) {
		if (!bronOnbereikbaar()) return false;
		const sc = huidigUnhappyScenario();
		if (sc === "geen") return true;
		if (sc === "een") return magazijnId === ONBEREIKBARE_BRON;
		return false; // "later": bij het laden is nog niets geblokkeerd
	}

	// "later"-scenario: welke bron ná een succesvolle load is uitgevallen, gedeeld
	// tussen de inbox en de bericht-detailpagina via sessionStorage (blijft binnen
	// het tabblad staan bij navigatie, verdwijnt bij het sluiten van het tabblad).
	const UITVAL_KEY = "berichtenbox-bron-uitval";
	function leesBronUitval() {
		try {
			const raw = sessionStorage.getItem(UITVAL_KEY);
			return raw ? JSON.parse(raw) : null;
		} catch (e) { return null; }
	}
	function schrijfBronUitval(bron) {
		try {
			if (bron) sessionStorage.setItem(UITVAL_KEY, JSON.stringify(bron));
			else sessionStorage.removeItem(UITVAL_KEY);
		} catch (e) { /* sessionStorage niet beschikbaar */ }
	}

	// Alleen het org-filter (Belastingdienst-portaal), zonder de unhappy-flow-
	// uitsluiting. Gebruikt om te bepalen welke bronnen worden bevraagd, ook als
	// er eentje onbereikbaar is.
	function magazijnDoorOrgFilter(magazijnId) {
		if (!orgFilterActief()) return true;
		if (andereOrgenFeatureAan() && state.toonAndereOrganisaties) return true;
		return magazijnId === ORG_EIGEN;
	}
	function magazijnToegestaan(magazijnId) {
		if (magazijnGeblokkeerd(magazijnId)) return false;
		return magazijnDoorOrgFilter(magazijnId);
	}
	// Eigen mappen (.berichtenbox-folder-user) horen bij de berichten van andere
	// organisaties. Toon ze alleen als die zichtbaar zijn; bij alleen-
	// Belastingdienst verbergen we ze plus de "Mappen:"-scheiding. Op pagina's
	// buiten het Belastingdienst-portaal (MOZa) blijven de mappen altijd staan.
	function werkMappenZichtbaarheidBij() {
		if (!orgFilterActief()) return;
		const toon = andereOrgenFeatureAan() && !!state.toonAndereOrganisaties;
		document.querySelectorAll('.berichtenbox-folder-user').forEach((li) => { li.hidden = !toon; });
		const sep = document.querySelector('.tablist .list-separation');
		if (sep) sep.hidden = !toon;
	}
	// Bij alleen Belastingdienst-berichten is de afzender altijd hetzelfde, dus
	// filteren op afzender heeft geen zin: toon dan alleen 'Filter op onderwerp'.
	function werkZoekPlaceholderBij() {
		if (!orgFilterActief()) return;
		const input = document.querySelector('[data-berichtenbox-search-input]');
		if (!input) return;
		input.placeholder = state.toonAndereOrganisaties
			? 'Filter op afzender of onderwerp'
			: 'Filter op onderwerp';
	}

	function huidigeView() {
		const lijst = document.querySelector('[data-berichtenbox-list]');
		const attr = lijst ? lijst.dataset.berichtenboxView : null;
		if (attr) return attr;
		const path = location.pathname;
		if (path.includes('/berichtenbox-archief/')) return 'archief';
		if (path.includes('/berichtenbox-prullenbak/')) return 'prullenbak';
		return 'inbox';
	}

	const MAANDEN = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

	// Parse "YYYY-MM-DD" direct om timezone-drift te voorkomen (new Date() interpreteert UTC).
	function datumNL(datumStr) {
		if (!datumStr) return '';
		const m = datumStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (!m) return 'Onbekende datum';
		const mnd = parseInt(m[2], 10);
		if (mnd < 1 || mnd > 12) return 'Onbekende datum';
		return parseInt(m[3], 10) + ' ' + MAANDEN[mnd - 1] + ' ' + parseInt(m[1], 10);
	}

	// Op andere views dan inbox worden statische rijen altijd verborgen; die views worden volledig door JS gevuld.
	function pasStateToeOpRijen() {
		const view = huidigeView();
		const rijen = document.querySelectorAll('.berichtenbox-row');
		rijen.forEach((rij) => {
			const id = rij.dataset.berichtId;
			const status = statusVan(id);
			// Markeer-staat uit localStorage spiegelen naar de knop in de statische rij.
			const markKnop = rij.querySelector('[data-mark-toggle]');
			const gemarkeerd = isGemarkeerd(id, markKnop ? markKnop.classList.contains('is-marked') : false);
			if (markKnop) {
				markKnop.classList.toggle('is-marked', gemarkeerd);
				markKnop.setAttribute('aria-pressed', gemarkeerd ? 'true' : 'false');
			}
			if (view === 'inbox') {
				rij.hidden = status !== 'inbox';
				const origineel = rij.classList.contains('is-unread');
				const nu = isOngelezen(id, origineel);
				rij.classList.toggle('is-unread', nu);
			} else {
				rij.hidden = true;
			}
		});
	}

	function render(view) {
		const tellerTotaal = document.querySelector('[data-berichtenbox-counter-total]');
		let getoond = 0;
		if (view === 'inbox') {
			getoond = data.berichten.filter((b) => statusVan(b.id) === 'inbox' && magazijnToegestaan(b.magazijnId) && persoonRelevant(b)).length;
		} else if (view === 'archief') {
			getoond = Object.keys(state.gearchiveerd).length;
		} else if (view === 'prullenbak') {
			getoond = Object.keys(state.verwijderd).length;
		}
		if (tellerTotaal) tellerTotaal.textContent = getoond;

		// Aantal bronnen: aantal verschillende organisaties van de zichtbare inbox-berichten.
		const tellerBronnen = document.querySelector('[data-berichtenbox-sources]');
		if (tellerBronnen) {
			const bronnen = new Set(
				data.berichten
					.filter((b) => statusVan(b.id) === 'inbox' && magazijnToegestaan(b.magazijnId) && persoonRelevant(b))
					.map((b) => b.magazijnId)
			);
			tellerBronnen.textContent = bronnen.size;
		}

		const tellerOngelezen = document.querySelector('[data-berichtenbox-counter-unread]');
		if (tellerOngelezen) {
			const n = data.berichten.filter((b) =>
				statusVan(b.id) === 'inbox' && magazijnToegestaan(b.magazijnId) && persoonRelevant(b) && isOngelezen(b.id, b.isOngelezen)
			).length;
			tellerOngelezen.textContent = n;
		}

		const navInbox = document.querySelector('[data-berichtenbox-count="inbox"]');
		if (navInbox) {
			navInbox.textContent = data.berichten.filter((b) =>
				statusVan(b.id) === 'inbox' && magazijnToegestaan(b.magazijnId) && persoonRelevant(b) && isOngelezen(b.id, b.isOngelezen)
			).length;
		}
		const ongelezenAantal = data.berichten.filter((b) =>
			statusVan(b.id) === 'inbox' && magazijnToegestaan(b.magazijnId) && persoonRelevant(b) && isOngelezen(b.id, b.isOngelezen)
		).length;
		document.querySelectorAll('[data-berichtenbox-count="ongelezen"]').forEach((el) => {
			el.textContent = ongelezenAantal > 0 ? ongelezenAantal : '';
		});
		state.aantalOngelezen = ongelezenAantal;
		const navArchief = document.querySelector('[data-berichtenbox-count="archief"]');
		if (navArchief) navArchief.textContent = Object.keys(state.gearchiveerd).length;
		const navPrullenbak = document.querySelector('[data-berichtenbox-count="prullenbak"]');
		if (navPrullenbak) navPrullenbak.textContent = Object.keys(state.verwijderd).length;

		const alleMappen = [...data.mappen, ...state.eigenMappen];
		alleMappen.forEach((m) => {
			const el = document.querySelector(`[data-berichtenbox-count="map:${m.slug}"]`);
			if (!el) return;
			const n = data.berichten.filter((b) => {
				if (statusVan(b.id) !== 'inbox') return false;
				const effMap = (b.id in state.mapOverride) ? state.mapOverride[b.id] : b.map;
				return effMap === m.slug;
			}).length;
			el.textContent = n;
		});

		werkMeervoudBij();
	}

	// Zet enkelvoud/meervoud van de bijbehorende telwoorden: een [data-meervoud]-span
	// verwijst naar de teller (data-attribuut) waaruit het getal komt en draagt het
	// enkelvoud (data-ev) en meervoud (data-mv). Bij 1 -> enkelvoud, anders meervoud.
	function werkMeervoudBij() {
		document.querySelectorAll('[data-meervoud]').forEach((span) => {
			const tellerAttr = span.getAttribute('data-meervoud');
			const teller = document.querySelector('[' + tellerAttr + ']');
			if (!teller) return;
			const n = parseInt(teller.textContent, 10);
			if (!Number.isFinite(n)) return;
			span.textContent = n === 1 ? span.getAttribute('data-ev') : span.getAttribute('data-mv');
		});
	}

	function opslaan() {
		writeState(state);
	}

	// ---- Client-side paginering ----
	// Eleventy rendert alle berichten in één lijst; JS toont per pagina een venster
	// zodat een dynamisch toegevoegd bericht echt naar de volgende pagina reflowt.
	// Paginagrootte komt uit data-page-size op de lijst; ontbreekt die, dan geen
	// paginering (alles op één pagina).
	const PAGINA_GROOTTE = (function () {
		const lijst = document.querySelector('[data-berichtenbox-list]');
		const n = parseInt(lijst && lijst.dataset.pageSize, 10);
		return Number.isFinite(n) && n > 0 ? n : Infinity;
	})();

	function huidigePaginaUitUrl() {
		const p = parseInt(new URLSearchParams(location.search).get('pagina'), 10);
		return Number.isFinite(p) && p > 0 ? p : 1;
	}
	let huidigePagina = huidigePaginaUitUrl();

	// Hook die de huidige weergave opnieuw filtert/pagineert; gezet door de
	// actieve view (inbox-filter of archief/prullenbak/map-render).
	let herpagineerHuidigeView = function () {};

	// Bij venster-resize de paginanav opnieuw opbouwen, zodat de ellipsis-truncatie
	// meeschaalt met de beschikbare containerbreedte. Gedebounced tegen thrashing.
	let resizeTimer = null;
	window.addEventListener('resize', () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => { herpagineerHuidigeView(); }, 150);
	});

	// Toon alleen het venster van de huidige pagina uit `rijen` (al gefilterde,
	// in volgorde staande rijen die zichtbaar horen te zijn) en bouw de paginanav.
	function paginer(rijen) {
		const pagnav = document.querySelector('[data-berichtenbox-pagination]');
		if (!Number.isFinite(PAGINA_GROOTTE)) {
			if (pagnav) { pagnav.hidden = true; }
			return;
		}
		const totaalPaginas = Math.max(1, Math.ceil(rijen.length / PAGINA_GROOTTE));
		if (huidigePagina > totaalPaginas) huidigePagina = totaalPaginas;
		if (huidigePagina < 1) huidigePagina = 1;
		const start = (huidigePagina - 1) * PAGINA_GROOTTE;
		const eind = start + PAGINA_GROOTTE;
		rijen.forEach((rij, i) => {
			rij.hidden = i < start || i >= eind;
		});
		bouwPaginaNav(totaalPaginas, pagnav);
	}

	function gaNaarPagina(nr) {
		huidigePagina = nr;
		const params = new URLSearchParams(location.search);
		if (nr <= 1) params.delete('pagina'); else params.set('pagina', String(nr));
		const query = params.toString();
		history.replaceState(null, '', location.pathname + (query ? '?' + query : ''));
		herpagineerHuidigeView();
		const lijst = document.querySelector('[data-berichtenbox-list]');
		if (lijst && typeof lijst.scrollIntoView === 'function') {
			lijst.scrollIntoView({ block: 'start' });
		}
	}

	function bouwPaginaNav(totaal, pagnav) {
		if (!pagnav) return;
		if (totaal <= 1) {
			while (pagnav.firstChild) pagnav.removeChild(pagnav.firstChild);
			pagnav.hidden = true;
			return;
		}
		pagnav.hidden = false;

		// Bouwt de nav met ten hoogste maxItems cijfercellen. Retourneert de <ol>.
		function renderMet(maxItems) {
			while (pagnav.firstChild) pagnav.removeChild(pagnav.firstChild);
			const ol = document.createElement('ol');

			function maakItem(label, paginaNr, opties) {
				opties = opties || {};
				const li = document.createElement('li');
				if (opties.huidig) {
					const span = document.createElement('span');
					span.setAttribute('aria-current', 'page');
					span.textContent = label;
					li.appendChild(span);
				} else {
					const a = document.createElement('a');
					a.href = '#';
					if (opties.rel) a.setAttribute('rel', opties.rel);
					a.textContent = label;
					a.addEventListener('click', (e) => {
						e.preventDefault();
						gaNaarPagina(paginaNr);
					});
					li.appendChild(a);
				}
				ol.appendChild(li);
			}

			function maakEllipsis() {
				const li = document.createElement('li');
				li.className = 'pagination-ellipsis';
				const span = document.createElement('span');
				span.setAttribute('aria-hidden', 'true');
				span.textContent = '…';
				li.appendChild(span);
				ol.appendChild(li);
			}

			const teTonen = paginaNummers(totaal, huidigePagina, maxItems);
			if (huidigePagina > 1) maakItem('Vorige', huidigePagina - 1, { rel: 'prev' });
			let vorige = 0;
			teTonen.forEach((n) => {
				if (n - vorige > 1) maakEllipsis();
				maakItem(String(n), n, { huidig: n === huidigePagina });
				vorige = n;
			});
			if (huidigePagina < totaal) maakItem('Volgende', huidigePagina + 1, { rel: 'next' });
			pagnav.appendChild(ol);
			return ol;
		}

		// Wrapt de nav over meer dan één regel? Vergelijk de bovenkant van het
		// laatste item met die van het eerste (offsetTop forceert een reflow).
		function wrapt(ol) {
			const items = ol.children;
			if (items.length < 2) return false;
			return items[items.length - 1].offsetTop > items[0].offsetTop + 1;
		}

		// Start met een breedte-schatting en krimp tot het op één regel past.
		let maxItems = schatMaxItems(pagnav);
		let ol = renderMet(maxItems);
		let guard = 0;
		while (Number.isFinite(maxItems) && maxItems > 5 && wrapt(ol) && guard < 50) {
			maxItems -= 1;
			ol = renderMet(maxItems);
			guard += 1;
		}
	}

	// Schat hoeveel cijfercellen er naast Vorige/Volgende passen, op basis van de
	// breedte van de container waarin lijst + pager zitten (#berichtenbox-inbox).
	function schatMaxItems(pagnav) {
		const container = (pagnav && (
			pagnav.closest('#berichtenbox-inbox')
			|| pagnav.closest('.berichtenbox-content')
			|| pagnav.parentElement
		)) || pagnav;
		const breedte = (container && container.clientWidth) || (pagnav && pagnav.clientWidth) || 0;
		const ITEM = 46;
		const PREV_NEXT = 150;
		return breedte ? Math.max(5, Math.floor((breedte - PREV_NEXT) / ITEM)) : Infinity;
	}

	// Welke paginanummers tonen, gegeven het maximaal aantal cijfercellen. Past
	// alles? Toon elke pagina. Anders: eerste + laatste (ankerpunten) en een
	// aaneengesloten venster rond de huidige dat de breedte vult.
	function paginaNummers(totaal, huidig, maxItems) {
		if (totaal <= maxItems) {
			const alle = [];
			for (let n = 1; n <= totaal; n++) alle.push(n);
			return alle;
		}
		let venster = maxItems - 4; // reserveer 2 ankers + 2 ellipsis
		if (venster < 1) venster = 1;
		const half = Math.floor(venster / 2);
		let start = huidig - half;
		let eind = huidig + (venster - 1 - half);
		if (start < 2) { eind += 2 - start; start = 2; }
		if (eind > totaal - 1) { start -= eind - (totaal - 1); eind = totaal - 1; }
		if (start < 2) start = 2;
		const set = new Set([1, totaal]);
		for (let n = start; n <= eind; n++) set.add(n);
		return [...set].sort((a, b) => a - b);
	}

	// Inline-paneel i.p.v. <dialog>, omdat het contextueel bij de geklikte knop hoort.
	// Sluit bij Escape, klik buiten het paneel, of herhaalde klik op de openende knop.
	let actiefVerplaatsPaneel = null;
	let actieveVerplaatsKnop = null;
	function sluitVerplaatsPaneel() {
		if (!actiefVerplaatsPaneel) return;
		actiefVerplaatsPaneel.remove();
		if (actieveVerplaatsKnop) actieveVerplaatsKnop.setAttribute('aria-expanded', 'false');
		actiefVerplaatsPaneel = null;
		actieveVerplaatsKnop = null;
	}
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && actiefVerplaatsPaneel) sluitVerplaatsPaneel();
	});
	document.addEventListener('click', (e) => {
		if (!actiefVerplaatsPaneel) return;
		if (actiefVerplaatsPaneel.contains(e.target)) return;
		if (actieveVerplaatsKnop && actieveVerplaatsKnop.contains(e.target)) return;
		sluitVerplaatsPaneel();
	});

	function toonVerplaatsPaneel(berichtId, knop) {
		if (actiefVerplaatsPaneel) {
			sluitVerplaatsPaneel();
			return;
		}
		const alleMappen = [
			...data.mappen,
			...state.eigenMappen,
		];

		const paneel = document.createElement('div');
		paneel.className = 'berichtenbox-move-panel';
		paneel.setAttribute('role', 'group');
		paneel.setAttribute('aria-label', 'Verplaats bericht naar map');

		const kiesP = document.createElement('p');
		kiesP.textContent = 'Verplaats naar map:';
		paneel.appendChild(kiesP);

		const ul = document.createElement('ul');
		paneel.appendChild(ul);

		const nieuweMapFieldset = document.createElement('div');
		const nieuweMapLabel = document.createElement('label');
		nieuweMapLabel.textContent = 'Maak een nieuwe map aan:';
		const nieuweMapInput = document.createElement('input');
		nieuweMapInput.type = 'text';
		nieuweMapLabel.setAttribute('for', 'nieuwe-map-naam');
		nieuweMapInput.id = 'nieuwe-map-naam';
		const nieuweMapBevestig = document.createElement('button');
		nieuweMapBevestig.type = 'button';
		nieuweMapBevestig.className = 'button';
		nieuweMapBevestig.textContent = 'Nieuwe map aanmaken';
		const nieuweMapActions = document.createElement('div');
		nieuweMapActions.className = 'action-group';
		nieuweMapActions.appendChild(nieuweMapBevestig);
		nieuweMapFieldset.appendChild(nieuweMapLabel);
		nieuweMapFieldset.appendChild(nieuweMapInput);
		nieuweMapFieldset.appendChild(nieuweMapActions);
		paneel.appendChild(nieuweMapFieldset);

		const mapIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M58 15H29v-2c0-1.1-.9-2-2-2H12c-1.1 0-2 .9-2 2v4.69c7.13.47 40.09 2.62 40.59 2.75.28.07.38.21.4.34 0 .04.02.23-.01.23H4.53c-1.29 0-2.24 1.2-1.95 2.46l7.06 30c.27 1.16 1.18 1.54 2.36 1.54h46a2 2 0 0 0 2-2V17c0-1.1-.9-2-2-2" /></svg>';

		alleMappen.forEach((m) => {
			const li = document.createElement('li');
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'icon-button';
			btn.innerHTML = mapIconSvg;
			btn.appendChild(document.createTextNode(m.naam));
			btn.addEventListener('click', () => {
				state.mapOverride[berichtId] = m.slug;
				opslaan();
				sluitVerplaatsPaneel();
				render(huidigeView());
				updateMapLabelDetail(m.slug);
			});
			li.appendChild(btn);
			ul.appendChild(li);
		});
		nieuweMapBevestig.addEventListener('click', () => {
			const naam = nieuweMapInput.value.trim();
			if (!naam) return;
			const slug = naam.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
			if (!slug) return;
			if (!state.eigenMappen.some((m) => m.slug === slug)) {
				state.eigenMappen.push({ slug, naam });
			}
			state.mapOverride[berichtId] = slug;
			opslaan();
			sluitVerplaatsPaneel();
			render(huidigeView());
			updateMapLabelDetail(slug);
			voegMapToeAanZijbalk({ slug, naam });
		});
		const actionGroup = knop.closest('.action-group') || knop.closest('.berichtenbox-detail-actions');
		if (actionGroup) {
			actionGroup.parentNode.insertBefore(paneel, actionGroup.nextSibling);
		} else {
			knop.parentNode.insertBefore(paneel, knop.nextSibling);
		}
		knop.setAttribute('aria-expanded', 'true');
		actiefVerplaatsPaneel = paneel;
		actieveVerplaatsKnop = knop;
	}

	function updateMapLabelDetail(mapSlug) {
		const meta = document.querySelector('.berichtenbox-detail-meta [data-maplabel]');
		if (!mapSlug) {
			if (meta) meta.remove();
			return;
		}
		if (meta) {
			meta.textContent = mapSlug;
		} else {
			const metaP = document.querySelector('.berichtenbox-detail-meta');
			if (metaP) {
				const span = document.createElement('span');
				span.dataset.maplabel = '';
				span.textContent = ' · ' + mapSlug;
				metaP.appendChild(span);
			}
		}
	}

	function voegMapToeAanZijbalk(map) {
		const lijst = document.querySelector('[data-berichtenbox-folders]');
		if (!lijst) return;
		if (lijst.querySelector('[data-map-slug="' + map.slug + '"]')) return;
		const li = document.createElement('li');
		li.dataset.mapSlug = map.slug;
		const a = document.createElement('a');
		a.href = url(berichtenboxBasis() + '?map=' + map.slug);
		a.textContent = map.naam + ' ';
		const teller = document.createElement('span');
		teller.className = 'berichtenbox-nav-count';
		teller.dataset.berichtenboxCount = 'map:' + map.slug;
		teller.textContent = '0';
		a.appendChild(teller);
		li.appendChild(a);
		lijst.appendChild(li);
	}

	// Vlag-knop voor de Gemarkeerd-kolom; spiegelt de markup uit berichtenbox-row.njk.
	function maakMarkKnop(gemarkeerd) {
		const knop = document.createElement('button');
		knop.type = 'button';
		knop.className = 'mark-toggle' + (gemarkeerd ? ' is-marked' : '');
		knop.dataset.markToggle = '';
		knop.setAttribute('aria-pressed', gemarkeerd ? 'true' : 'false');
		const vh = document.createElement('span');
		vh.className = 'visually-hidden';
		vh.textContent = 'Markeren';
		knop.appendChild(vh);
		const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		icon.setAttribute('viewBox', '0 0 64 64');
		icon.setAttribute('aria-hidden', 'true');
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('fill', 'currentColor');
		path.setAttribute('d', 'M58.89 20.86 10 6.14V3.87C10 3 8.66 2 7 2S4 3 4 3.87V61h6V27.03c.09-.03.33-.06.42.49.08.47 2.58 17.49 2.58 17.49l46.09-21.35c1.24-.58 1.12-2.39-.2-2.79');
		icon.appendChild(path);
		knop.appendChild(icon);
		return knop;
	}

	function createRij(bericht) {
		const ongelezen = isOngelezen(bericht.id, bericht.isOngelezen);
		const gemarkeerd = isGemarkeerd(bericht.id, bericht.isGemarkeerd);
		const effMap = mapVan(bericht.id, bericht.map);
		const dynamisch = bericht.id.startsWith('msg-live-');

		const tr = document.createElement('tr');
		tr.className = 'berichtenbox-row' + (ongelezen ? ' is-unread' : '') + (dynamisch ? ' is-dynamic' : '');
		tr.dataset.berichtId = bericht.id;
		tr.dataset.afzenderId = bericht.magazijnId;
		if (effMap) tr.dataset.map = effMap;

		const tdMark = document.createElement('td');
		tdMark.className = 'berichtenbox-row-mark';
		tdMark.appendChild(maakMarkKnop(gemarkeerd));
		tr.appendChild(tdMark);

		const tdAfz = document.createElement('td');
		tdAfz.className = 'berichtenbox-row-sender';
		if (ongelezen) {
			const vh = document.createElement('span');
			vh.className = 'visually-hidden';
			vh.textContent = 'Ongelezen. ';
			tdAfz.appendChild(vh);
		}
		tdAfz.appendChild(document.createTextNode(bericht.afzender));
		tr.appendChild(tdAfz);

		const tdOnd = document.createElement('td');
		tdOnd.className = 'berichtenbox-row-subject';
		if (dynamisch) {
			const a = document.createElement('a');
			a.href = url(berichtenboxBasis() + 'bericht-demo/?id=' + encodeURIComponent(bericht.id));
			a.textContent = bericht.onderwerp;
			tdOnd.appendChild(a);
		} else {
			const a = document.createElement('a');
			a.href = url(berichtenboxBasis() + 'bericht/' + bericht.id + '/');
			a.textContent = bericht.onderwerp;
			tdOnd.appendChild(a);
		}
		tr.appendChild(tdOnd);

		const tdDat = document.createElement('td');
		tdDat.className = 'berichtenbox-row-date';
		tdDat.textContent = datumNL(bericht.datum);
		tr.appendChild(tdDat);

		const tdBij = document.createElement('td');
		tdBij.className = 'berichtenbox-row-attachment';
		if (bericht.heeftBijlage) {
			const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			icon.setAttribute('viewBox', '0 0 32 32');
			icon.setAttribute('aria-hidden', 'true');
			const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path1.setAttribute('fill', 'currentColor');
			path1.setAttribute('fill-rule', 'evenodd');
			path1.setAttribute('d', 'M23.679 32a6.26 6.26 0 0 1-4.472-1.874L4.59 15.314c-3.453-3.5-3.453-9.192 0-12.691a8.786 8.786 0 0 1 12.523 0L28.152 13.81c.494.5.494 1.312 0 1.812a1.25 1.25 0 0 1-1.79 0L15.325 4.436a6.28 6.28 0 0 0-8.946 0c-2.465 2.5-2.465 6.565 0 9.065l14.618 14.812a3.767 3.767 0 0 0 5.367 0 3.89 3.89 0 0 0 .095-5.339L11.743 8.062a1.256 1.256 0 0 0-1.788 0 1.295 1.295 0 0 0 0 1.812l11.041 11.188c.494.5.494 1.311 0 1.813-.495.5-1.295.5-1.79 0L8.168 11.686a3.884 3.884 0 0 1 0-5.436 3.766 3.766 0 0 1 5.366-.001l14.619 14.813c2.464 2.499 2.464 6.565 0 9.064A6.27 6.27 0 0 1 23.679 32');
			icon.appendChild(path1);
			tdBij.appendChild(icon);
			const bijVh = document.createElement('span');
			bijVh.className = 'visually-hidden';
			bijVh.textContent = 'Heeft bijlage';
			tdBij.appendChild(bijVh);
		}
		tr.appendChild(tdBij);

		const tdMap = document.createElement('td');
		tdMap.className = 'berichtenbox-row-folder-label';
		if (effMap) {
			const spanMap = document.createElement('span');
			spanMap.dataset.maplabel = '';
			spanMap.textContent = effMap;
			tdMap.appendChild(spanMap);
		}
		tr.appendChild(tdMap);

		// Acties-kolom alleen op berichtenboxen die de kolom tonen (marker-th in de
		// thead). Zo krijgen dynamische rijen (live-berichten) dezelfde kebab als de
		// server-gerenderde rijen, terwijl archief/prullenbak (zonder th) 5-koloms blijven.
		if (document.querySelector('.berichtenbox-actions-th')) {
			tr.appendChild(maakActiesTd());
		}

		return tr;
	}

	function maakActiesTd() {
		const td = document.createElement('td');
		td.className = 'berichtenbox-row-actions';
		// Statische, vertrouwde markup (geen brondata) — innerHTML is hier veilig.
		td.innerHTML = '<div class="row-actions">'
			+ '<button type="button" class="icon-button row-actions-toggle" aria-haspopup="true" aria-expanded="false" aria-label="Acties voor dit bericht"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5m0 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5m0 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"/></svg></button>'
			+ '<div class="row-actions-menu action-options" role="menu" hidden>'
			+ '<button type="button" class="icon-button" role="menuitem" data-row-actie="doorsturen"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M53.72 24.36 34.9 9.5a3.35 3.35 0 0 0-4.27.09 3.365 3.365 0 0 0-.73 4.21l4.7 8.2H20.99c-6.63 0-12 5.37-12 12v17.28c0 2.72 2.35 3.53 5 3.53s5-.81 5-3.53V34c0-1.1.9-2 2-2H34.6l-4.7 8.2c-.8 1.4-.49 3.16.73 4.21a3.35 3.35 0 0 0 4.27.09l18.82-14.86C54.53 29 55 28.03 55 27.01s-.47-2-1.28-2.64"/></svg>Doorsturen</button>'
			+ '<button type="button" class="icon-button" role="menuitem" data-row-actie="archiveren"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M7 23v33c0 .55.45 1 1 1h48c.55 0 1-.45 1-1V23c0-.55-.45-1-1-1H8c-.55 0-1 .45-1 1m18 7h14v7H25v-7Zm17 20.5c0 .83-.67 1.5-1.5 1.5h-17c-.83 0-1.5-.67-1.5-1.5V47c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v2h14v-2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v3.5ZM51 16H13c-.55 0-1 .45-1 1v3h40v-3c0-.55-.45-1-1-1m-5-6H18c-.55 0-1 .45-1 1v3h30v-3c0-.55-.45-1-1-1"/></svg>Archiveren</button>'
			+ '<button type="button" class="icon-button" role="menuitem" data-row-actie="verwijderen"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M10.67 18.67zm40-8h-8V8A2.67 2.67 0 0 0 40 5.33H24A2.67 2.67 0 0 0 21.33 8v2.67h-8a2.67 2.67 0 0 0-2.67 2.67v5.33h14.28s.15.32-.31.44c-.58.16-11.31 1.43-11.31 1.43V56a2.67 2.67 0 0 0 2.67 2.67h32A2.67 2.67 0 0 0 50.66 56V18.67h2.67v-5.33a2.67 2.67 0 0 0-2.67-2.67ZM24 50.67l-5.33 2.67V24.01H24v26.67Zm10.67 0-5.33 2.67V24.01h5.33v26.67Zm10.67 0-5.33 2.67V24.01h5.33v26.67ZM24.43 10.63v-.8c0-.94-.16-1.7.88-1.7h13.27c1.04 0 .88.76.88 1.7v.8H24.43Z"/></svg>Verwijderen</button>'
			+ '</div></div>';
		return td;
	}

	function renderLijstVoorView(view) {
		const lijst = document.querySelector('[data-berichtenbox-list]');
		const leeg = document.querySelector('[data-berichtenbox-empty]');
		if (!lijst) return;
		let items = [];
		if (view === 'archief') {
			items = data.berichten.filter((b) => state.gearchiveerd[b.id]);
		} else if (view === 'prullenbak') {
			items = data.berichten.filter((b) => state.verwijderd[b.id]);
		}
		if (view === 'archief' || view === 'prullenbak') {
			const tbody = lijst.querySelector('tbody') || lijst;
			while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
			const rijen = items.map((b) => {
				const rij = createRij(b);
				tbody.appendChild(rij);
				return rij;
			});
			lijst.hidden = items.length === 0;
			if (leeg) leeg.hidden = items.length > 0;
			// Deze views worden volledig uit data herbouwd; paginering werkt op die rijen.
			herpagineerHuidigeView = function () { renderLijstVoorView(view); };
			paginer(rijen);
		}
	}

	// Sorteerbare kolomkoppen. Eén gedelegeerde handler op de <thead>: sorteert de
	// databron (zodat herbouwde views mee-sorteren) en herordent de DOM-rijen op
	// berichtId. Daarna herpagineert de actieve view (inbox behoudt DOM-volgorde,
	// archief/prullenbak herbouwen uit de gesorteerde data).
	function bindSortering() {
		const lijst = document.querySelector('[data-berichtenbox-list]');
		if (!lijst || !lijst.tHead) return;
		lijst.tHead.addEventListener('click', (e) => {
			const btn = e.target.closest('button[data-sort]');
			if (!btn) return;
			const key = btn.dataset.sort;
			const th = btn.closest('th');
			const oplopend = th.getAttribute('aria-sort') !== 'ascending';
			lijst.tHead.querySelectorAll('th[aria-sort]').forEach((t) => t.setAttribute('aria-sort', 'none'));
			th.setAttribute('aria-sort', oplopend ? 'ascending' : 'descending');
			const richting = oplopend ? 1 : -1;
			data.berichten.sort((a, b) =>
				richting * String(a[key] || '').localeCompare(String(b[key] || ''), 'nl', { numeric: true })
			);
			const volgorde = new Map(data.berichten.map((b, i) => [b.id, i]));
			const tbody = lijst.tBodies[0];
			if (tbody) {
				Array.from(tbody.rows)
					.sort((a, b) => (volgorde.get(a.dataset.berichtId) ?? 0) - (volgorde.get(b.dataset.berichtId) ?? 0))
					.forEach((r) => tbody.appendChild(r));
			}
			huidigePagina = 1;
			herpagineerHuidigeView();
		});
	}

	// Unhappy-flow (feature flag): onbereikbare bron. De waarschuwing wordt door
	// feature-flags.js getoond/verborgen op basis van de flag. De retry-knop
	// simuleert een geslaagde herverbinding; toggelen van de flag zet de bron
	// weer op onbereikbaar. Bij elke wijziging worden lijst en tellers herrenderd.
	function herrenderInbox() {
		if (huidigeView() !== 'inbox') return;
		huidigePagina = 1;
		if (typeof herpagineerHuidigeView === 'function') herpagineerHuidigeView();
		render('inbox');
	}
	// Toon de waarschuwing alleen als de bron onbereikbaar is. De waarschuwing
	// heeft géén data-feature (anders zou feature-flags.js die al tijdens de
	// progress-animatie tonen); berichtenbox.js stuurt de zichtbaarheid zelf,
	// zodat de melding pas ná het ophalen bij de bronnen verschijnt.
	function werkBronWaarschuwingBij() {
		const een = document.querySelector('[data-bron-onbereikbaar]');
		const geen = document.querySelector('[data-geen-bronnen]');
		const sc = bronOnbereikbaar() ? huidigUnhappyScenario() : null;
		if (een) een.hidden = sc !== 'een';
		if (geen) geen.hidden = sc !== 'geen';
	}
	// "later"-scenario: toon de uitval-melding op de inbox zodra een bron is
	// uitgevallen (geregistreerd in sessionStorage) en vul de naam in.
	function werkBronUitvalBij() {
		const melding = document.querySelector('[data-bron-uitval]');
		if (!melding) return;
		const actief = bronOnbereikbaar() && huidigUnhappyScenario() === 'later';
		const uitval = actief ? leesBronUitval() : null;
		melding.hidden = !uitval;
		if (uitval) {
			const naamEl = melding.querySelector('[data-bron-uitval-naam]');
			if (naamEl) naamEl.textContent = uitval.naam;
		}
	}
	// Plan de uitval van één willekeurige bron op een willekeurig moment ná een
	// succesvolle load. Is het al gebeurd (sessionStorage), dan alleen tonen.
	let uitvalGepland = false;
	function plannBronUitval() {
		if (huidigeView() !== 'inbox') return;
		if (!bronOnbereikbaar() || huidigUnhappyScenario() !== 'later') return;
		if (leesBronUitval()) { werkBronUitvalBij(); return; }
		if (uitvalGepland) return;
		uitvalGepland = true;
		const bronnen = [...new Set(
			data.berichten.filter((b) => statusVan(b.id) === 'inbox' && magazijnToegestaan(b.magazijnId) && persoonRelevant(b)).map((b) => b.magazijnId)
		)];
		if (!bronnen.length) return;
		const vertraging = 4000 + Math.floor(Math.random() * 8000); // 4–12 s
		setTimeout(() => {
			if (!bronOnbereikbaar() || huidigUnhappyScenario() !== 'later' || leesBronUitval()) return;
			const id = bronnen[Math.floor(Math.random() * bronnen.length)];
			const voorbeeld = data.berichten.find((b) => b.magazijnId === id);
			schrijfBronUitval({ id: id, naam: voorbeeld ? voorbeeld.afzender : id });
			werkBronUitvalBij();
		}, vertraging);
	}
	function bindBronOnbereikbaar() {
		const waarschuwingen = document.querySelectorAll('[data-bron-onbereikbaar], [data-geen-bronnen], [data-bron-uitval]');
		if (!waarschuwingen.length) return;
		waarschuwingen.forEach((w) => {
			const retry = w.querySelector('[data-bron-retry]');
			if (retry) {
				retry.addEventListener('click', () => {
					bronHandmatigHersteld = true;
					schrijfBronUitval(null);
					uitvalGepland = false;
					werkBronWaarschuwingBij();
					werkBronUitvalBij();
					// Toon de progress-animatie opnieuw (bronnen worden opnieuw
					// bevraagd) voordat de volledige lijst verschijnt.
					voortgangsAnimatie(() => herrenderInbox());
				});
			}
		});
		// Flag-wijziging in het paneel: bij uitzetten zijn de bronnen weer beschikbaar
		// en wordt bij een volgende keer opnieuw een scenario gekozen. Na de eerste
		// progress-animatie mag de melding meteen mee-togglen.
		document.addEventListener('feature-flags-applied', () => {
			if (!unhappyFlowAan()) {
				bronHandmatigHersteld = false;
				scenarioGekozen = false;
				uitvalGepland = false;
				schrijfBronUitval(null);
			}
			werkBronWaarschuwingBij();
			werkBronUitvalBij();
			herrenderInbox();
		});
	}

	// Bericht-detailpagina: als de bron van dit bericht is uitgevallen ("later"-
	// scenario, gedeeld via sessionStorage), toon dan een melding en verberg de
	// berichtinhoud. De retry-knop herstelt de bron en toont het bericht weer.
	function werkBerichtBeschikbaarheidBij() {
		const melding = document.querySelector('[data-bericht-onbeschikbaar]');
		const content = document.querySelector('.berichtenbox-content[data-afzender-id]');
		if (!melding || !content) return;
		const uitval = leesBronUitval();
		const onbeschikbaar = !!uitval && uitval.id === content.dataset.afzenderId;
		melding.hidden = !onbeschikbaar;
		if (onbeschikbaar) {
			const naamEl = melding.querySelector('[data-bron-uitval-naam]');
			if (naamEl) naamEl.textContent = uitval.naam;
		}
		[
			content.querySelector('.berichtenbox-detail-body'),
			content.querySelector('[data-berichtenbox-attachments]'),
			content.querySelector('.berichtenbox-detail-pdf'),
		].forEach((el) => { if (el) el.hidden = onbeschikbaar; });
	}
	function bindBerichtBeschikbaarheid() {
		const melding = document.querySelector('[data-bericht-onbeschikbaar]');
		if (!melding) return;
		werkBerichtBeschikbaarheidBij();
		const retry = melding.querySelector('[data-bericht-retry]');
		if (retry) {
			retry.addEventListener('click', () => {
				schrijfBronUitval(null);
				werkBerichtBeschikbaarheidBij();
			});
		}
	}

	function bindInboxFilters() {
		if (huidigeView() !== 'inbox') return;
		const lijst = document.querySelector('[data-berichtenbox-list]');
		if (!lijst) return;

		const zoekInput = document.querySelector('[data-berichtenbox-search-input]');
		const afzenderPaneel = document.querySelector('[data-berichtenbox-sender-panel]');

		if (afzenderPaneel) {
			while (afzenderPaneel.firstChild) afzenderPaneel.removeChild(afzenderPaneel.firstChild);
			const uniek = new Map();
			data.berichten.forEach((b) => uniek.set(b.magazijnId, b.afzender));
			[...uniek.entries()]
				.sort((a, b) => a[1].localeCompare(b[1]))
				.forEach(([id, naam]) => {
					const label = document.createElement('label');
					const cb = document.createElement('input');
					cb.type = 'checkbox';
					cb.value = id;
					cb.dataset.afzenderCheck = '';
					label.appendChild(cb);
					label.appendChild(document.createTextNode(' ' + naam));
					afzenderPaneel.appendChild(label);
				});
		}

		function mapUitUrl() {
			const params = new URLSearchParams(location.search);
			return params.get('map');
		}

		// Alle berichten staan in de DOM; het map-filter in pasFilterToe verbergt de
		// niet-passende rijen en de paginering toont het juiste venster.

		function pasFilterToe() {
			const zoek = (zoekInput ? zoekInput.value : '').trim().toLowerCase();
			const gekozenAfzenders = new Set(
				[...document.querySelectorAll('[data-afzender-check]:checked')].map((c) => c.value)
			);
			const mapFilter = mapUitUrl();
			const zichtbareRijen = [];
			document.querySelectorAll('.berichtenbox-row').forEach((rij) => {
				if (statusVan(rij.dataset.berichtId) !== 'inbox') {
					rij.hidden = true;
					return;
				}
				if (!magazijnToegestaan(rij.dataset.afzenderId)) {
					rij.hidden = true;
					return;
				}
				// Persona-relevantie: verberg berichten met een relevantVoor-tag die
				// niet bij de actieve persona hoort.
				const bericht = data.berichten.find((b) => b.id === rij.dataset.berichtId);
				if (bericht && !persoonRelevant(bericht)) {
					rij.hidden = true;
					return;
				}
				let match = true;
				if (zoek) {
					const afzEl = rij.querySelector('.berichtenbox-row-sender');
					const ondEl = rij.querySelector('.berichtenbox-row-subject');
					const tekst = ((afzEl ? afzEl.textContent : '') + ' ' + (ondEl ? ondEl.textContent : '')).toLowerCase();
					if (!tekst.includes(zoek)) match = false;
				}
				if (gekozenAfzenders.size > 0) {
					if (!gekozenAfzenders.has(rij.dataset.afzenderId)) match = false;
				}
				if (mapFilter) {
					const dataMap = rij.dataset.map;
					const overrideMap = state.mapOverride[rij.dataset.berichtId];
					const effectieveMap = (rij.dataset.berichtId in state.mapOverride) ? overrideMap : dataMap;
					if (effectieveMap !== mapFilter) match = false;
				}
				rij.hidden = !match;
				if (match) zichtbareRijen.push(rij);
			});
			const leeg = document.querySelector('[data-berichtenbox-empty]');
			if (leeg) leeg.hidden = zichtbareRijen.length > 0;
			// Toon alleen het venster van de huidige pagina van de gematchte rijen.
			paginer(zichtbareRijen);
		}

		// Bij inbox stuurt het filter de paginering aan.
		herpagineerHuidigeView = pasFilterToe;

		// Een nieuw filter zet de weergave terug naar pagina 1.
		function filterVanafEerstePagina() { huidigePagina = 1; pasFilterToe(); }
		if (zoekInput) zoekInput.addEventListener('input', filterVanafEerstePagina);
		if (afzenderPaneel) afzenderPaneel.addEventListener('change', filterVanafEerstePagina);

		// A/B-test: schakelaar om ook berichten van andere organisaties te tonen.
		const orgToggle = document.querySelector('[data-berichtenbox-org-toggle]');
		if (orgToggle) {
			orgToggle.checked = andereOrgenFeatureAan() && !!state.toonAndereOrganisaties;
			werkZoekPlaceholderBij();
			orgToggle.addEventListener('change', () => {
				state.toonAndereOrganisaties = orgToggle.checked;
				opslaan();
				werkZoekPlaceholderBij();
				huidigePagina = 1;
				if (orgToggle.checked) {
					// Simuleer het ophalen van berichten bij de andere organisaties; de
					// eigen mappen verschijnen pas als die berichten binnen zijn.
					voortgangsAnimatie(() => { werkMappenZichtbaarheidBij(); pasFilterToe(); render('inbox'); });
				} else {
					werkMappenZichtbaarheidBij();
					pasFilterToe();
					render('inbox');
				}
			});

			// Wordt de feature-flag in het paneel uit-/aangezet, dan herfilteren
			// zonder herladen. Bij flag-uit valt magazijnToegestaan terug op
			// alleen-Belastingdienst, ook al stond de switch eerder aan.
			document.addEventListener('feature-flags-applied', () => {
				orgToggle.checked = andereOrgenFeatureAan() && !!state.toonAndereOrganisaties;
				werkZoekPlaceholderBij();
				werkMappenZichtbaarheidBij();
				huidigePagina = 1;
				pasFilterToe();
				render('inbox');
			});
		}

		const mapFilter = mapUitUrl();
		if (mapFilter) {
			const mapTab = document.querySelector('[data-map-slug="' + mapFilter + '"] a');
			if (mapTab) {
				mapTab.setAttribute('aria-current', 'page');
				mapTab.setAttribute('aria-selected', 'true');
			}
			const inboxTab = document.querySelector('[data-berichtenbox-count="inbox"]');
			if (inboxTab) {
				const inboxLink = inboxTab.closest('a');
				if (inboxLink) {
					inboxLink.removeAttribute('aria-current');
					inboxLink.removeAttribute('aria-selected');
				}
			}
			const counterP = document.querySelector('[data-berichtenbox-toolbar] > p');
			if (counterP) counterP.textContent = 'Deze map heeft u aangemaakt op 7 april 2026.';
		}
		pasFilterToe();
	}

	function bindDetailPaginaActies() {
		const content = document.querySelector('[data-bericht-id]');
		if (!content || !content.matches('.berichtenbox-content')) return;
		const berichtId = content.dataset.berichtId;

		delete state.ongelezenToegevoegd[berichtId];
		state.gelezen[berichtId] = true;
		// Herbereken de ongelezen-teller (met dit bericht als gelezen) zodat de
		// badges direct kloppen, en sla de bijgewerkte telling op.
		render(huidigeView());
		opslaan();

		const berichtData = data.berichten.find((b) => b.id === berichtId);

		// Markeren-knop: begintoestand uit localStorage.
		const markeerBtn = content.querySelector('[data-actie="markeren"]');
		if (markeerBtn) {
			werkMarkeerKnopBij(markeerBtn, isGemarkeerd(berichtId, berichtData ? berichtData.isGemarkeerd : false));
		}

		// Zet de actieve tab op basis van de status van dit bericht. De detail-URL
		// matcht server-side altijd 'Inbox'; voor een geopend archief-/prullenbak-
		// bericht corrigeren we dat hier.
		const tablist = document.querySelector('.tablist');
		if (tablist) {
			const status = statusVan(berichtId);
			const inboxBadge = tablist.querySelector('[data-berichtenbox-count="inbox"]');
			const inboxLink = inboxBadge ? inboxBadge.closest('a') : null;
			const archiefLink = tablist.querySelector('a[href*="berichtenbox-archief/"]');
			const prullenbakLink = tablist.querySelector('a[href*="berichtenbox-prullenbak/"]');
			[inboxLink, archiefLink, prullenbakLink].forEach((a) => {
				if (a) { a.removeAttribute('aria-current'); a.removeAttribute('aria-selected'); }
			});
			const actiefLink = status === 'archief' ? archiefLink : status === 'prullenbak' ? prullenbakLink : inboxLink;
			if (actiefLink) actiefLink.setAttribute('aria-current', 'page');
		}

		// Zit het bericht al in Archief, dan wordt "Archiveren" "Terugplaatsen in inbox".
		if (statusVan(berichtId) === 'archief') {
			const archiveerBtn = content.querySelector('[data-actie="archiveren"]');
			if (archiveerBtn) {
				const labelNode = [...archiveerBtn.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
				if (labelNode) labelNode.textContent = 'Terugplaatsen in inbox';
				else archiveerBtn.append('Terugplaatsen in inbox');
			}
		}

		content.querySelectorAll('[data-actie]').forEach((btn) => {
			btn.addEventListener('click', () => {
				const actie = btn.dataset.actie;
				if (actie === 'archiveren') {
					if (statusVan(berichtId) === 'archief') {
						// Zit al in Archief: terugplaatsen in inbox.
						delete state.gearchiveerd[berichtId];
					} else {
						state.gearchiveerd[berichtId] = true;
						delete state.verwijderd[berichtId];
					}
					opslaan();
					location.href = url(berichtenboxBasis());
				} else if (actie === 'verwijderen') {
					state.verwijderd[berichtId] = true;
					delete state.gearchiveerd[berichtId];
					opslaan();
					location.href = url(berichtenboxBasis());
				} else if (actie === 'markeer-ongelezen') {
					// Toggle gelezen/ongelezen; geen navigatie, blijf op het bericht.
					const wordtOngelezen = !isOngelezen(berichtId, false);
					if (wordtOngelezen) {
						state.ongelezenToegevoegd[berichtId] = true;
						delete state.gelezen[berichtId];
					} else {
						state.gelezen[berichtId] = true;
						delete state.ongelezenToegevoegd[berichtId];
					}
					render(huidigeView());
					opslaan();
					werkOngelezenKnopBij(btn, wordtOngelezen);
				} else if (actie === 'markeren') {
					// Toggle markering; geen navigatie, blijf op het bericht.
					const nu = !isGemarkeerd(berichtId, false);
					state.gemarkeerd[berichtId] = nu;
					opslaan();
					werkMarkeerKnopBij(btn, nu);
				} else if (actie === 'verplaatsen') {
					toonVerplaatsPaneel(berichtId, btn);
				}
			});
		});

		laadBijlagen();
	}

	function laadBijlagen() {
		const bijlSec = document.querySelector('[data-berichtenbox-attachments]');
		const previewVooraf = document.querySelector('[data-berichtenbox-attachments-preview]');
		// De PDF-viewer staat bij élk bericht (alleen zichtbaar in variant B); de
		// "Bijlage(n)"-lijst alleen bij een bericht met een echte bijlage.
		if (!bijlSec && !previewVooraf) return;
		const laden = bijlSec ? bijlSec.querySelector('[data-berichtenbox-attachments-loading]') : null;
		const lijst = bijlSec ? bijlSec.querySelector('[data-berichtenbox-attachments-list]') : null;

		// Toon de PDF-laadindicator meteen (de iframe blijft verborgen). De
		// vertraging hieronder fungeert als zichtbare laadtijd; zonder dit zou de
		// lokale PDF zó snel laden dat de indicator alleen even flitst.
		const pdfLadenVooraf = document.querySelector('[data-pdf-laden]');
		if (pdfLadenVooraf) pdfLadenVooraf.hidden = false;
		if (previewVooraf) previewVooraf.hidden = true;

		setTimeout(() => {
			// Voorbeeld-PDF voor zowel de bijlage-links als de preview (prototype).
			const pdfHref = url('/assets/documents/voorbeeld-bijlage.pdf');

			// Bijlagenlijst alleen opbouwen bij een bericht met een echte bijlage.
			if (bijlSec && laden && lijst) {
				const namen = [
					'Beschikking.pdf',
					'Bijlage-specificatie.pdf',
					'Toelichting.pdf',
					'Overzicht.pdf',
				];
				const aantal = 1 + Math.floor(Math.random() * 3);
				const gekozen = namen.slice(0, aantal);

				while (lijst.firstChild) lijst.removeChild(lijst.firstChild);

				// Unhappy-flow (feature flag): laat willekeurig 1 of meer bijlagen falen.
				// Elke gefaalde bijlage krijgt een foutmelding met een eigen retry-knop.
				const faalIndexen = new Set();
				if (unhappyFlowAan()) {
					const aantalFout = 1 + Math.floor(Math.random() * gekozen.length);
					while (faalIndexen.size < aantalFout) {
						faalIndexen.add(Math.floor(Math.random() * gekozen.length));
					}
				}

				// Werkende bijlage-link.
				function bijlageLink(naam) {
					const a = document.createElement('a');
					a.href = pdfHref;
					a.target = '_blank';
					a.rel = 'noopener';
					a.textContent = naam;
					return a;
				}
				// Gefaalde bijlage: feedback-warning met retry die de bijlage alsnog "ophaalt".
				const WARNING_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M23.38 19.64 13.67 2.47c-.73-1.3-2.6-1.3-3.34 0L.62 19.64c-.72 1.28.2 2.86 1.67 2.86h19.43c1.46 0 2.38-1.58 1.66-2.86z"/><path class="icon-color-inverse" d="M10.54 17.45c0-.44.12-.82.36-1.12.24-.31.6-.46 1.09-.46.48 0 .85.14 1.1.4.25.27.38.66.38 1.18 0 .43-.12.8-.36 1.09-.24.29-.6.44-1.09.44-.48 0-.85-.13-1.1-.39-.25-.25-.38-.63-.38-1.14zm.31-10.27 2.48-.2-.22 5.51v2.63l-2.27.05V7.18z"/></svg>';
				function bijlageFout(naam) {
					const feedback = document.createElement('div');
					feedback.className = 'feedback feedback-warning';
					feedback.setAttribute('role', 'status');
					const icoon = document.createElement('template');
					icoon.innerHTML = WARNING_ICON;
					feedback.appendChild(icoon.content.firstChild);

					const inner = document.createElement('div');
					const tekst = document.createElement('p');
					tekst.textContent = 'Bijlage kon niet worden opgehaald.';
					const actie = document.createElement('p');
					const retry = document.createElement('button');
					retry.type = 'button';
					retry.className = 'link-button';
					retry.textContent = 'Opnieuw proberen';
					retry.addEventListener('click', () => {
						feedback.replaceWith(bijlageLink(naam));
					});
					actie.appendChild(retry);
					inner.append(tekst, actie);
					feedback.appendChild(inner);
					return feedback;
				}

				// DOM-methoden i.p.v. innerHTML voorkomen XSS als bronnen ooit dynamisch worden.
				gekozen.forEach((n, i) => {
					const li = document.createElement('li');
					li.appendChild(faalIndexen.has(i) ? bijlageFout(n) : bijlageLink(n));
					lijst.appendChild(li);
				});

				laden.hidden = true;
				lijst.hidden = false;
			}

			// Preview van de bijlage in een ingesloten PDF-viewer (bij élk bericht).
			// Verberg de thumbnail-zijbalk en toon op volle breedte.
			const preview = document.querySelector('[data-berichtenbox-attachments-preview]');
			if (preview) {
				// Laad-indicator (feedback-progress-stijl) tonen tot de PDF geladen is.
				const pdfLaden = document.querySelector('[data-pdf-laden]');
				if (pdfLaden) pdfLaden.hidden = false;
				preview.hidden = true;
				let getoond = false;
				function toonPreview() {
					if (getoond) return;
					getoond = true;
					if (pdfLaden) pdfLaden.hidden = true;
					preview.hidden = false;
				}
				preview.addEventListener('load', toonPreview, { once: true });
				// Fallback: mocht 'load' niet vuren, toon de viewer alsnog.
				setTimeout(toonPreview, 8000);
				// Geen lazy-loading: een verborgen iframe met loading="lazy" zou niet
				// laden en de indicator zou blijven hangen.
				preview.removeAttribute('loading');
				preview.src = pdfHref + '#navpanes=0&view=FitH';
			}
			// Download PDF-link onder de preview.
			const download = document.querySelector('[data-berichtenbox-pdf-download]');
			if (download) {
				download.href = pdfHref;
				download.hidden = false;
			}
			// Optionele tekst-versie-link naast de download (indien aanwezig).
			const tekstVersie = document.querySelector('[data-berichtenbox-tekst-download]');
			if (tekstVersie) {
				tekstVersie.href = url('/assets/documents/voorbeeld-bijlage.txt');
				tekstVersie.hidden = false;
			}
		}, 1500);
	}

	// Vul de generieke demo-detailpagina met berichtdata uit state.
	function vulDemoDetailPagina() {
		const detail = document.querySelector('[data-demo-detail]');
		if (!detail) return;

		const params = new URLSearchParams(location.search);
		const id = params.get('id');
		if (!id) {
			detail.hidden = true;
			const melding = document.querySelector('[data-demo-niet-gevonden]');
			if (melding) melding.hidden = false;
			return;
		}

		const bericht = data.berichten.find((b) => b.id === id);
		if (!bericht) {
			detail.hidden = true;
			const melding = document.querySelector('[data-demo-niet-gevonden]');
			if (melding) melding.hidden = false;
			return;
		}

		// Vul data-attributen zodat bindDetailPaginaActies() werkt.
		detail.dataset.berichtId = bericht.id;
		detail.dataset.afzenderId = bericht.magazijnId;
		detail.dataset.afzenderNaam = bericht.afzender;
		if (bericht.heeftBijlage) detail.dataset.heeftBijlage = 'true';

		// Link naar de Berichtenbox van de afzender-organisatie. Alleen de
		// Belastingdienst heeft in dit prototype een eigen berichtenbox; de rest is
		// placeholder (#).
		const orgWrap = document.querySelector('[data-demo-organisatie]');
		if (orgWrap) {
			const naamEl = orgWrap.querySelector('[data-demo-organisatie-naam]');
			const orgLink = orgWrap.querySelector('[data-demo-organisatie-link]');
			if (naamEl) naamEl.textContent = bericht.afzender;
			if (orgLink) orgLink.setAttribute('href', bericht.magazijnId === 'belastingdienst' ? url('/mijn-belastingdienst/berichtenbox/') : '#');
			orgWrap.hidden = false;
		}

		const onderwerpEl = detail.querySelector('[data-demo-onderwerp]');
		if (onderwerpEl) onderwerpEl.textContent = bericht.onderwerp;

		const breadcrumb = document.querySelector('[data-demo-breadcrumb]');
		if (breadcrumb) breadcrumb.textContent = bericht.onderwerp;

		document.title = 'MijnOverheid Zakelijk: ' + bericht.onderwerp;

		const effMap = mapVan(bericht.id, bericht.map);
		const metaEl = detail.querySelector('[data-demo-meta]');
		if (metaEl) {
			metaEl.textContent = bericht.afzender + ' \u00b7 ' + datumNL(bericht.datum);
			if (effMap) {
				const span = document.createElement('span');
				span.dataset.maplabel = '';
				span.textContent = effMap;
				metaEl.appendChild(document.createTextNode(' \u00b7 '));
				metaEl.appendChild(span);
			}
		}

		const bodyEl = detail.querySelector('[data-demo-body]');
		if (bodyEl) {
			bericht.inhoud.split('\n\n').forEach((alinea) => {
				const p = document.createElement('p');
				p.textContent = alinea;
				bodyEl.appendChild(p);
			});
		}

		if (bericht.heeftBijlage) {
			const bijlSec = detail.querySelector('[data-berichtenbox-attachments]');
			if (bijlSec) {
				bijlSec.hidden = false;
				const laden = bijlSec.querySelector('[data-berichtenbox-attachments-loading]');
				if (laden) laden.textContent = 'Bijlagen ophalen bij ' + bericht.afzender + '\u2026';
			}
		}
	}

	function toonMappenZijbalk() {
		const kop = document.querySelector('[data-berichtenbox-folders-heading]');
		const lijst = document.querySelector('[data-berichtenbox-folders]');
		if (kop) kop.hidden = false;
		if (lijst) lijst.hidden = false;
		state.eigenMappen.forEach(voegMapToeAanZijbalk);
	}

	function voortgangsAnimatie(opKlaar) {
		const wrap = document.querySelector('[data-berichtenbox-progress]');
		const lijst = document.querySelector('[data-berichtenbox-list]');
		const pagnav = document.querySelector('.berichtenbox-content .pagination');
		if (!wrap || !lijst) { opKlaar(); return; }

		lijst.hidden = true;
		if (pagnav) pagnav.hidden = true;
		wrap.hidden = false;

		// Respecteer het org-filter: bij alleen Belastingdienst is er 1 bron en het
		// juiste aantal Belastingdienst-berichten; met andere organisaties alle bronnen.
		// We bevragen álle bronnen die het org-filter toelaat (totaalBronnen), ook een
		// onbereikbare. Alleen de bereikbare bronnen leveren berichten en "arriveren"
		// in de animatie; de onbereikbare blijft hangen, dus de teller stopt bij 11/12.
		const gezochteBronnen = new Set(
			data.berichten.filter((b) => statusVan(b.id) === 'inbox' && magazijnDoorOrgFilter(b.magazijnId)).map((b) => b.magazijnId)
		);
		const bereikteBerichten = data.berichten.filter((b) => statusVan(b.id) === 'inbox' && magazijnToegestaan(b.magazijnId) && persoonRelevant(b));
		const bereikteBronnen = new Set(bereikteBerichten.map((b) => b.magazijnId));
		const totaalBronnen = gezochteBronnen.size || 1;
		// Aantal bronnen dat daadwerkelijk antwoordt. Bij het "geen"-scenario is dit 0
		// (niets arriveert); bij "een" is het totaal - 1; normaal gelijk aan totaal.
		const aankomendeBronnen = bereikteBronnen.size;
		const totaalBerichten = bereikteBerichten.length;

		const bronEl = document.querySelector('[data-berichtenbox-progress-source]');
		const totaalEl = document.querySelector('[data-berichtenbox-progress-total]');
		const gevondenEl = document.querySelector('[data-berichtenbox-progress-found]');
		const balk = document.querySelector('[data-berichtenbox-progress-bar]');
		if (totaalEl) totaalEl.textContent = totaalBronnen;

		// Simuleer SSE-gedrag: elke bereikbare bron arriveert op eigen moment. Trekken
		// uit een zware-staart-verdeling (x^4) zodat de meeste bronnen snel antwoorden
		// maar de trage magazijnen tot laat in de rit nog binnendruppelen. Alleen de
		// bereikbare bronnen krijgen een aankomsttijd; de onbereikbare arriveert nooit.
		const bronTijden = [];
		for (let i = 0; i < aankomendeBronnen; i++) {
			const r = Math.random();
			bronTijden.push(Math.pow(r, 4));
		}
		bronTijden.sort((a, b) => a - b);

		const berichtTijden = [];
		for (let i = 0; i < totaalBerichten; i++) {
			const r = Math.random();
			berichtTijden.push(Math.pow(r, 4));
		}
		berichtTijden.sort((a, b) => a - b);

		// Bij één bron is er weinig op te halen: korte animatie. Meer bronnen = langer.
		const duur = totaalBronnen <= 1 ? 1200 : 4000;
		const start = performance.now();

		function aantalVoor(tijden, t) {
			// Binary-search lookup: hoeveel tijden <= t?
			let lo = 0, hi = tijden.length;
			while (lo < hi) {
				const mid = (lo + hi) >>> 1;
				if (tijden[mid] <= t) lo = mid + 1; else hi = mid;
			}
			return lo;
		}

		function stap(nu) {
			const t = Math.min(1, (nu - start) / duur);
			const bronnenBinnen = aantalVoor(bronTijden, t);
			const berichtenBinnen = aantalVoor(berichtTijden, t);
			if (bronEl) bronEl.textContent = bronnenBinnen;
			if (gevondenEl) gevondenEl.textContent = berichtenBinnen;
			werkMeervoudBij();
			if (balk) balk.style.inlineSize = ((bronnenBinnen / totaalBronnen) * 100) + '%';
			if (t < 1) {
				requestAnimationFrame(stap);
			} else {
				wrap.hidden = true;
				lijst.hidden = false;
				if (pagnav) pagnav.hidden = false;
				opKlaar();
			}
		}
		requestAnimationFrame(stap);
	}

	let nieuwBerichtTeller = 0;

	function voegNieuwBerichtToe() {
		if (huidigeView() !== 'inbox') return;
		if (!data.magazijnen.length) return;
		if (state.nieuweBerichten.length >= NIEUWE_BERICHTEN_LIMIET) return;
		nieuwBerichtTeller++;
		const mag = data.magazijnen[Math.floor(Math.random() * data.magazijnen.length)];
		const nu = new Date().toISOString().slice(0, 10);
		const id = 'msg-live-' + Date.now() + '-' + nieuwBerichtTeller;
		const onderwerpen = [
			'Nieuw bericht ontvangen',
			'Bevestiging ontvangst',
			'Bericht beschikbaar',
			'Actie mogelijk vereist',
		];
		const bericht = {
			id,
			magazijnId: mag.id,
			afzender: mag.naam,
			onderwerp: onderwerpen[Math.floor(Math.random() * onderwerpen.length)],
			inhoud: 'Dit is een demo-bericht van ' + mag.naam + '.',
			datum: nu,
			isOngelezen: true,
			map: null,
			heeftBijlage: Math.random() < 0.3,
		};
		state.nieuweBerichten.push(bericht);
		opslaan();

		// Synchroniseer window-data zodat render/filter het nieuwe bericht meenemen.
		data.berichten.unshift(bericht);

		const lijst = document.querySelector('[data-berichtenbox-list]');
		if (lijst) {
			const tbody = lijst.querySelector('tbody') || lijst;
			const tr = createRij(bericht);
			tr.classList.add('is-new');
			tbody.prepend(tr);

			// Her-filter en -pagineer: het nieuwe bericht komt bovenaan pagina 1 en het
			// onderste bericht schuift door naar de volgende pagina (echte reflow).
			herpagineerHuidigeView();
		}
		render('inbox');

		const live = document.querySelector('[data-berichtenbox-live]');
		if (live) live.textContent = 'Nieuw bericht van ' + bericht.afzender + ': ' + bericht.onderwerp;
	}

	// Feature flag "Dynamische berichten": staat standaard uit (default-off). Alleen
	// als de flag expliciet aan staat, druppelen er willekeurig nieuwe berichten binnen.
	function dynamischeBerichtenAan() {
		try {
			return localStorage.getItem('feature:Dynamische berichten') === 'true';
		} catch (e) {
			return false;
		}
	}
	function startPolling() {
		if (!dynamischeBerichtenAan()) return;
		if (huidigeView() !== 'inbox') return;
		// Alleen op pagina 1 — nieuwe berichten landen bovenaan, op pagina 2+ zouden ze onzichtbaar zijn.
		if (/\/pagina-\d+\/$/.test(location.pathname)) return;
		// Niet op detail-pagina's (geen inbox-lijst om aan te prepender).
		if (!document.querySelector('[data-berichtenbox-list]')) return;
		const params = new URLSearchParams(location.search);
		const pollParam = parseInt(params.get('poll'), 10);
		let intervalSec = Number.isFinite(pollParam) && pollParam > 0 ? pollParam : 60;
		if (intervalSec < POLL_MIN_SEC) intervalSec = POLL_MIN_SEC;
		const intervalId = setInterval(() => {
			try {
				voegNieuwBerichtToe();
			} catch (e) {
				// Bij corrupte state zou polling elke tick opnieuw gooien; stop om console-spam te voorkomen.
				console.error('[Berichtenbox] Polling gestopt door fout.', e);
				clearInterval(intervalId);
			}
		}, intervalSec * 1000);
	}

	// Herstel eerder via polling binnengekomen berichten na reload. Staat de flag
	// "Dynamische berichten" uit (standaard), dan worden ze niet hersteld maar juist
	// opgeruimd — zo verdwijnen eerder binnengedruppelde "Dit is een demo-bericht".
	if (!dynamischeBerichtenAan()) {
		if (state.nieuweBerichten.length > 0) {
			state.nieuweBerichten = [];
			opslaan();
		}
	} else if (state.nieuweBerichten.length > 0) {
		state.nieuweBerichten.forEach((b) => {
			if (!data.berichten.some((x) => x.id === b.id)) {
				data.berichten.unshift(b);
			}
		});
		const lijst = document.querySelector('[data-berichtenbox-list]');
		if (lijst && huidigeView() === 'inbox' && !(/\/pagina-\d+\/$/.test(location.pathname))) {
			const tbody = lijst.querySelector('tbody') || lijst;
			state.nieuweBerichten.forEach((b) => {
				if (lijst.querySelector('[data-bericht-id="' + b.id + '"]')) return;
				tbody.prepend(createRij(b));
			});
		}
	}

	document.querySelectorAll('[data-berichtenbox-reset]').forEach((link) => {
		link.addEventListener('click', (e) => {
			e.preventDefault();
			try {
				localStorage.removeItem(LS_KEY);
			} catch (err) {
				console.error('[Berichtenbox] Kon state niet wissen.', err);
			}
			location.href = url(berichtenboxBasis());
		});
	});

	// Gemarkeerd-kolom: klik op de vlag-knop wisselt de markering. Gedelegeerd zodat
	// het ook werkt voor dynamisch (via createRij) toegevoegde rijen.
	document.addEventListener('click', (e) => {
		const knop = e.target.closest('[data-mark-toggle]');
		if (!knop) return;
		const rij = knop.closest('.berichtenbox-row');
		if (!rij) return;
		const id = rij.dataset.berichtId;
		const nu = !isGemarkeerd(id, knop.classList.contains('is-marked'));
		state.gemarkeerd[id] = nu;
		opslaan();
		knop.classList.toggle('is-marked', nu);
		knop.setAttribute('aria-pressed', nu ? 'true' : 'false');
	});

	// Acties-kolom: de acties zelf (openen/sluiten van het menu gebeurt in het
	// pre-guard deel, zodat het ook op demo-berichtenboxen zonder data werkt).
	// Gedelegeerd zodat het ook werkt voor dynamisch (via createRij) toegevoegde rijen.
	document.addEventListener('click', (e) => {
		const actie = e.target.closest('[data-row-actie]');
		if (!actie) return;
		const rij = actie.closest('.berichtenbox-row');
		if (!rij) return;
		const id = rij.dataset.berichtId;
		if (!id) return; // demo-rijen zonder bericht-id: geen actie
		const soort = actie.dataset.rowActie;
		if (soort === 'archiveren') {
			state.gearchiveerd[id] = true;
			delete state.verwijderd[id];
			opslaan();
		} else if (soort === 'verwijderen') {
			state.verwijderd[id] = true;
			delete state.gearchiveerd[id];
			opslaan();
		}
		// 'doorsturen' is een schets zonder functionaliteit in het prototype.
		if (soort === 'archiveren' || soort === 'verwijderen') {
			pasStateToeOpRijen();
			huidigePagina = 1;
			if (typeof herpagineerHuidigeView === 'function') herpagineerHuidigeView();
			render(huidigeView());
		}
	});

	pasStateToeOpRijen();
	werkMappenZichtbaarheidBij();
	renderLijstVoorView(huidigeView());
	render(huidigeView());
	vulDemoDetailPagina();
	bindDetailPaginaActies();
	bindSortering();
	bindBronOnbereikbaar();
	bindBerichtBeschikbaarheid();

	const isEerstePagina = !/\/pagina-\d+\/$/.test(location.pathname);

	if (huidigeView() === 'inbox' && isEerstePagina && !state.eersteBezoekGehad) {
		voortgangsAnimatie(() => {
			state.eersteBezoekGehad = true;
			opslaan();
			toonMappenZijbalk();
			bindInboxFilters();
			startPolling();
			werkBronWaarschuwingBij();
			plannBronUitval();
		});
	} else {
		toonMappenZijbalk();
		bindInboxFilters();
		startPolling();
		werkBronWaarschuwingBij();
		plannBronUitval();
	}

	// Debug-handle; niet bedoeld voor productiegebruik.
	window.Berichtenbox = {
		state,
		readState,
		writeState,
		statusVan,
		isOngelezen,
		mapVan,
		huidigeView,
		pasStateToeOpRijen,
		render,
	};
})();
