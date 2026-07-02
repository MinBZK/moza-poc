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

	const wrapper = document.querySelector('.berichtenbox');
	if (!wrapper) return;

	const data = window.berichtenboxData;
	if (!data || !Array.isArray(data.berichten) || !Array.isArray(data.mappen) || !Array.isArray(data.magazijnen)) {
		console.error('[Berichtenbox] window.berichtenboxData ontbreekt of is incompleet; script gestopt.');
		return;
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
	function magazijnToegestaan(magazijnId) {
		if (!orgFilterActief()) return true;
		if (andereOrgenFeatureAan() && state.toonAndereOrganisaties) return true;
		return magazijnId === ORG_EIGEN;
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
			getoond = data.berichten.filter((b) => statusVan(b.id) === 'inbox' && magazijnToegestaan(b.magazijnId)).length;
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
					.filter((b) => statusVan(b.id) === 'inbox' && magazijnToegestaan(b.magazijnId))
					.map((b) => b.magazijnId)
			);
			tellerBronnen.textContent = bronnen.size;
		}

		const tellerOngelezen = document.querySelector('[data-berichtenbox-counter-unread]');
		if (tellerOngelezen) {
			const n = data.berichten.filter((b) =>
				statusVan(b.id) === 'inbox' && magazijnToegestaan(b.magazijnId) && isOngelezen(b.id, b.isOngelezen)
			).length;
			tellerOngelezen.textContent = n;
		}

		const navInbox = document.querySelector('[data-berichtenbox-count="inbox"]');
		if (navInbox) {
			navInbox.textContent = data.berichten.filter((b) =>
				statusVan(b.id) === 'inbox' && magazijnToegestaan(b.magazijnId) && isOngelezen(b.id, b.isOngelezen)
			).length;
		}
		const ongelezenAantal = data.berichten.filter((b) =>
			statusVan(b.id) === 'inbox' && magazijnToegestaan(b.magazijnId) && isOngelezen(b.id, b.isOngelezen)
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
			icon.setAttribute('viewBox', '0 0 482.14 482.14');
			icon.setAttribute('aria-hidden', 'true');
			icon.setAttribute('class', 'icon-sm');
			const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path1.setAttribute('d', 'M142.024 310.194c0-8.007-5.556-12.782-15.359-12.782-4.003 0-6.714.395-8.132.773v25.69c1.679.378 3.743.504 6.588.504 10.449 0 16.903-5.279 16.903-14.185zm60.685-12.513c-4.39 0-7.227.379-8.905.772v56.896c1.679.394 4.39.394 6.841.394 17.809.126 29.424-9.677 29.424-30.449.126-18.063-10.458-27.613-27.36-27.613z');
			icon.appendChild(path1);
			const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path2.setAttribute('d', 'M315.458 0H121.811c-28.29 0-51.315 23.041-51.315 51.315v189.754h-5.012c-11.418 0-20.678 9.251-20.678 20.679v125.404c0 11.427 9.259 20.677 20.678 20.677h5.012v22.995c0 28.305 23.025 51.315 51.315 51.315h264.223c28.272 0 51.3-23.011 51.3-51.315V121.449L315.458 0zM99.053 284.379c6.06-1.024 14.578-1.796 26.579-1.796 12.128 0 20.772 2.315 26.58 6.965 5.548 4.382 9.292 11.615 9.292 20.127 0 8.51-2.837 15.745-7.999 20.646-6.714 6.32-16.643 9.157-28.258 9.157-2.585 0-4.902-.128-6.714-.379v31.096h-19.48v-85.816zm286.981 166.334H121.811c-10.954 0-19.874-8.92-19.874-19.889v-22.995h246.31c11.42 0 20.679-9.25 20.679-20.677V261.748c0-11.428-9.259-20.679-20.679-20.679h-246.31V51.315c0-10.938 8.921-19.858 19.874-19.858l181.89-.19V98.5c0 19.638 15.934 35.587 35.587 35.587l65.862-.189.741 296.925c0 10.97-8.904 19.89-19.857 19.89zm-211.969-80.912v-85.422c7.225-1.15 16.642-1.796 26.58-1.796 16.516 0 27.226 2.963 35.618 9.282 9.031 6.714 14.704 17.416 14.704 32.781 0 16.643-6.06 28.133-14.453 35.224-9.157 7.612-23.096 11.222-40.125 11.222-10.198 0-17.423-.646-22.324-1.291zm140.827-50.575v15.996h-31.23v34.973h-19.74v-86.966h53.16v16.122h-33.42v19.875h31.23z');
			icon.appendChild(path2);
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

		return tr;
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
		if (!bijlSec) return;
		const laden = bijlSec.querySelector('[data-berichtenbox-attachments-loading]');
		const lijst = bijlSec.querySelector('[data-berichtenbox-attachments-list]');
		if (!laden || !lijst) {
			console.warn('[Berichtenbox] Bijlage-sectie onvolledig: template-drift?');
			return;
		}

		setTimeout(() => {
			const namen = [
				'Beschikking.pdf',
				'Bijlage-specificatie.pdf',
				'Toelichting.pdf',
				'Overzicht.pdf',
			];
			const aantal = 1 + Math.floor(Math.random() * 3);
			const gekozen = namen.slice(0, aantal);

			// Voorbeeld-PDF voor zowel de bijlage-links als de preview (prototype).
			const pdfHref = url('/assets/documents/voorbeeld-bijlage.pdf');

			while (lijst.firstChild) lijst.removeChild(lijst.firstChild);

			// DOM-methoden i.p.v. innerHTML voorkomen XSS als bronnen ooit dynamisch worden.
			gekozen.forEach((n) => {
				const li = document.createElement('li');
				const a = document.createElement('a');
				a.href = pdfHref;
				a.target = '_blank';
				a.rel = 'noopener';
				a.textContent = n;
				li.appendChild(a);
				lijst.appendChild(li);
			});

			laden.hidden = true;
			lijst.hidden = false;

			// Preview van de bijlage in een ingesloten PDF-viewer. Verberg de
			// thumbnail-zijbalk (navpanes=0) en toon de PDF op volle breedte (FitH).
			const preview = bijlSec.querySelector('[data-berichtenbox-attachments-preview]');
			if (preview) {
				preview.src = pdfHref + '#navpanes=0&view=FitH';
				preview.hidden = false;
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
		const inboxBerichten = data.berichten.filter((b) => statusVan(b.id) === 'inbox' && magazijnToegestaan(b.magazijnId));
		const totaalBerichten = inboxBerichten.length;
		const totaalBronnen = new Set(inboxBerichten.map((b) => b.magazijnId)).size || 1;

		const bronEl = document.querySelector('[data-berichtenbox-progress-source]');
		const totaalEl = document.querySelector('[data-berichtenbox-progress-total]');
		const gevondenEl = document.querySelector('[data-berichtenbox-progress-found]');
		const balk = document.querySelector('[data-berichtenbox-progress-bar]');
		if (totaalEl) totaalEl.textContent = totaalBronnen;

		// Simuleer SSE-gedrag: elke bron arriveert op eigen moment. Trekken uit een
		// zware-staart-verdeling (x^4) zodat de meeste bronnen snel antwoorden maar
		// de trage magazijnen tot laat in de rit nog binnendruppelen.
		const bronTijden = [];
		for (let i = 0; i < totaalBronnen; i++) {
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

	function startPolling() {
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

	// Herstel eerder via polling binnengekomen berichten na reload.
	if (state.nieuweBerichten.length > 0) {
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

	pasStateToeOpRijen();
	werkMappenZichtbaarheidBij();
	renderLijstVoorView(huidigeView());
	render(huidigeView());
	vulDemoDetailPagina();
	bindDetailPaginaActies();
	bindSortering();

	const isEerstePagina = !/\/pagina-\d+\/$/.test(location.pathname);

	if (huidigeView() === 'inbox' && isEerstePagina && !state.eersteBezoekGehad) {
		voortgangsAnimatie(() => {
			state.eersteBezoekGehad = true;
			opslaan();
			toonMappenZijbalk();
			bindInboxFilters();
			startPolling();
		});
	} else {
		toonMappenZijbalk();
		bindInboxFilters();
		startPolling();
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
