# Wetten en regels als bord — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/moza/regelgeving/` wordt een bord (Te doen · Mee bezig · Komt eraan · Niet beoordelen · Afgerond) met alle regels en subsidies van de actieve persona, een zoekbalk over het hele corpus, en per kaart een gescopete digitale assistent in een zijpaneel.

**Architecture:** Pure logica (voorstel-indeling, bordstaat, zoeken) in een UMD-module zonder DOM, getest met `node --test`. Rendering in `regelbord.js` op de bestaande `window.*Data`-globals en `window.Personas`. Het zijpaneel bevat de bestaande chat-elementen zodat `digitale-assistent.js` ongewijzigd werkt; de scope gaat via de berichttekst en een regel-id in de gesprekssleutel.

**Tech Stack:** Eleventy/Nunjucks, vanilla JS (ES5-stijl zoals de rest van `assets/javascript/`), CSS met `--toepassing-*`-tokens, Storybook, Node 24 (`node --test`), Prettier.

**Spec:** `docs/superpowers/specs/2026-08-27-wetten-en-regels-bord-design.md`

## Global Constraints

- Schrijfwijzer: u-vorm, B1, knopteksten werkwoord-gericht, datums "27 augustus 2026", typografische aanhalingstekens in lopende tekst.
- Semantische HTML; `aria-disabled` i.p.v. `disabled`; labels boven velden; toetsenbord en screenreader kunnen alles wat de muis kan.
- CSS: alleen `--toepassing-*`-tokens, logical properties, `gap` óf `> * + *`, nooit beide.
- JS: geen frameworks; nieuwe modules in de stijl van `assets/javascript/assistent-vraag.js` (UMD) en `homepage-profiel.js` (IIFE, `var`).
- Commits ondertekend (SSH-signing staat in de repo-config); commitberichten met emoji-conventie uit `README.md` (➕ Added, ✏️ Modified, ❌ Deleted, 🐛 Bugfix).
- Storage-sleutels: `bord:<kvkNummer>`; bestaande sleutels `zaken`, `hidden:<titel>`, `persona` ongewijzigd.
- Bestaande links naar `/moza/digitale-assistent/?vraag=` blijven werken.

---

## Bestandsstructuur

| Bestand | Verantwoordelijkheid |
|---|---|
| `assets/javascript/regelbord-logica.js` (nieuw, UMD) | pure functies: kaarten uit persona, voorstelkolom, bordstaat lezen/schrijven, zoeken. Geen DOM. |
| `tests/regelbord-logica.test.mjs` (nieuw) | `node --test` voor de logica |
| `assets/javascript/regelbord.js` (nieuw, IIFE) | DOM: kolommen en kaarten renderen, verplaatsen-menu, reden-formulier, zoekbalk, zijpaneel openen/sluiten |
| `assets/javascript/assistent-vraag.js` | + `scopeVraag(item, soort, vraag)` |
| `assets/javascript/digitale-assistent.js` | gesprekssleutel krijgt regel-id (`window.MozaRegelScope`) |
| `moza/regelgeving.njk` | markup van bord, zoekbalk en zijpaneel |
| `moza/moza.json` | menu: label "Wetten en regels", assistent-item weg |
| `_includes/base.njk` | scripts laden |
| `style/style.css` | `.regel-zoek`, `.regelbord`, `.regelkaart`, `.assistent-paneel` |
| `stories/Regelbord.stories.js` (nieuw) | kaart en bord in Storybook |
| `package.json` | script `test` |

---

### Task 1: Logica-module met tests

**Files:**
- Create: `assets/javascript/regelbord-logica.js`
- Create: `tests/regelbord-logica.test.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces (global `window.MozaRegelbord` / CommonJS export):
  - `KOLOMMEN`: `[{id:"te-doen",label:"Te doen"},{id:"mee-bezig",label:"Mee bezig"},{id:"komt-eraan",label:"Komt eraan"},{id:"niet-beoordelen",label:"Niet beoordelen"},{id:"afgerond",label:"Afgerond"}]`
  - `kaartenVoor(persona, regelgeving, subsidies)` → `[{id, soort:"regeling"|"subsidie", item}]`
  - `voorstelKolom(kaart, context)` → kolom-id; `context = {vandaag: Date, zaken: [], verborgenTitels: Set<string>}`
  - `leesBord(storage, kvk)` → `{[kaartId]: {kolom, door, op, reden?}}`
  - `schrijfBord(storage, kvk, bord)`
  - `plaatsing(kaart, bord, context)` → `{kolom, door:"assistent"|"ondernemer", op?, reden?}`
  - `zoek(vraag, regelgeving, subsidies, extraTermen)` → `[{id, soort, item, score}]`
  - `parseDatum("1 juli 2026")` → `Date|null`

- [ ] **Step 1: Test script en falende tests**

`package.json` → `"scripts"` uitbreiden met `"test": "node --test tests/"`.

`tests/regelbord-logica.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const bord = require("../assets/javascript/regelbord-logica.js");

const REGELS = [
	{ id: "milieubeheer", titel: "Wet milieubeheer: rapportageplicht energiebesparing", beschrijving: "Energie", inhoud: ["kWh aardgas koelinstallatie"], geldtVoor: "Ondernemingen met hoog energieverbruik", bron: "Rijksoverheid", inwerkingtreding: "1 juli 2023", regelrechtRegel: "omgevingswet/energiebesparing/informatieplicht" },
	{ id: "upv", titel: "Uitgebreide producentenverantwoordelijkheid verpakkingen", beschrijving: "Verpakkingen", inhoud: ["recycling"], geldtVoor: "Retailers", bron: "Rijksoverheid", inwerkingtreding: "1 juli 2027" },
	{ id: "arbowet", titel: "Arbowet: RI&E", beschrijving: "Veilig werken", inhoud: ["risico-inventarisatie"], geldtVoor: "Werkgevers", bron: "SZW", inwerkingtreding: "1 januari 2020" },
];
const SUBSIDIES = [
	{ id: "isde", titel: "Investeringssubsidie Duurzame Energie (ISDE)", beschrijving: "Warmtepomp", inhoud: ["zonneboiler"], verstrekker: "RVO", aanvraagperiode: "Tot 31 december 2026" },
];
const PERSONA = { bedrijf: { kvkNummer: "62345681" }, regelgeving: ["milieubeheer", "upv", "onbekend-id"], subsidies: ["isde"] };
const VANDAAG = new Date("2026-08-27");

test("parseDatum leest een Nederlandse datum", () => {
	assert.equal(bord.parseDatum("1 juli 2026").toISOString().slice(0, 10), "2026-07-01");
	assert.equal(bord.parseDatum("onzin"), null);
	assert.equal(bord.parseDatum(""), null);
});

test("kaartenVoor levert regels en subsidies van de persona, onbekende ids overgeslagen", () => {
	const kaarten = bord.kaartenVoor(PERSONA, REGELS, SUBSIDIES);
	assert.deepEqual(kaarten.map((k) => k.id), ["milieubeheer", "upv", "isde"]);
	assert.equal(kaarten[2].soort, "subsidie");
});

test("voorstelKolom: toekomstige inwerkingtreding is Komt eraan", () => {
	const [, upv] = bord.kaartenVoor(PERSONA, REGELS, SUBSIDIES);
	assert.equal(bord.voorstelKolom(upv, { vandaag: VANDAAG, zaken: [], verborgenTitels: new Set() }), "komt-eraan");
});

test("voorstelKolom: ingediende zaak is Afgerond, lopende zaak is Mee bezig", () => {
	const [milieu] = bord.kaartenVoor(PERSONA, REGELS, SUBSIDIES);
	const ctx = (status) => ({ vandaag: VANDAAG, verborgenTitels: new Set(), zaken: [{ onderwerp: "Informatieplicht energiebesparing", regelId: "milieubeheer", status }] });
	assert.equal(bord.voorstelKolom(milieu, ctx("ingediend")), "afgerond");
	assert.equal(bord.voorstelKolom(milieu, ctx("in behandeling")), "mee-bezig");
});

test("voorstelKolom: eerder verborgen is Niet beoordelen, anders Te doen", () => {
	const kaarten = bord.kaartenVoor(PERSONA, REGELS, SUBSIDIES);
	const arbo = { id: "arbowet", soort: "regeling", item: REGELS[2] };
	assert.equal(bord.voorstelKolom(arbo, { vandaag: VANDAAG, zaken: [], verborgenTitels: new Set(["Arbowet: RI&E"]) }), "niet-beoordelen");
	assert.equal(bord.voorstelKolom(kaarten[0], { vandaag: VANDAAG, zaken: [], verborgenTitels: new Set() }), "te-doen");
});

test("plaatsing: het voorstel geldt tot de ondernemer verplaatst", () => {
	const [milieu] = bord.kaartenVoor(PERSONA, REGELS, SUBSIDIES);
	const ctx = { vandaag: VANDAAG, zaken: [], verborgenTitels: new Set() };
	assert.deepEqual(bord.plaatsing(milieu, {}, ctx), { kolom: "te-doen", door: "assistent" });
	const handmatig = { milieubeheer: { kolom: "mee-bezig", door: "ondernemer", op: "2026-08-27" } };
	assert.deepEqual(bord.plaatsing(milieu, handmatig, ctx), { kolom: "mee-bezig", door: "ondernemer", op: "2026-08-27" });
});

test("leesBord en schrijfBord gaan via storage per kvk", () => {
	const opslag = new Map();
	const storage = { getItem: (k) => (opslag.has(k) ? opslag.get(k) : null), setItem: (k, v) => opslag.set(k, v) };
	assert.deepEqual(bord.leesBord(storage, "62345681"), {});
	bord.schrijfBord(storage, "62345681", { upv: { kolom: "afgerond", door: "ondernemer", op: "2026-08-27" } });
	assert.equal(bord.leesBord(storage, "62345681").upv.kolom, "afgerond");
	assert.deepEqual(bord.leesBord(storage, "11111111"), {});
	storage.setItem("bord:62345681", "geen json");
	assert.deepEqual(bord.leesBord(storage, "62345681"), {});
});

test("zoek: titel weegt zwaarder dan inhoud, en extra termen tellen mee", () => {
	const uit = bord.zoek("energiebesparing", REGELS, SUBSIDIES, []);
	assert.equal(uit[0].id, "milieubeheer");
	const metTermen = bord.zoek("koelcel", REGELS, SUBSIDIES, ["koelinstallatie"]);
	assert.equal(metTermen[0].id, "milieubeheer");
	assert.deepEqual(bord.zoek("kinderopvang", REGELS, SUBSIDIES, []), []);
	assert.deepEqual(bord.zoek("  ", REGELS, SUBSIDIES, []), []);
});

test("zoek: hoofdletters en diakrieten doen er niet toe", () => {
	assert.equal(bord.zoek("RI&E", REGELS, SUBSIDIES, [])[0].id, "arbowet");
	assert.equal(bord.zoek("Duurzame Énergie", REGELS, SUBSIDIES, [])[0].id, "isde");
});
```

- [ ] **Step 2: Run, verwacht falen**

Run: `npm test`
Expected: FAIL — `Cannot find module '../assets/javascript/regelbord-logica.js'`

- [ ] **Step 3: Implementatie**

`assets/javascript/regelbord-logica.js`:

```js
/**
 * regelbord-logica.js
 *
 * Alles wat het bord "Wetten en regels" beslist zonder DOM: welke kaarten een
 * persona krijgt, in welke kolom de assistent ze voorstelt, hoe de stand per
 * persona wordt bewaard, en hoe de zoekbalk zoekt. Eén bron voor de browser
 * (regelbord.js) en voor de tests (node --test).
 */
(function (root, maak) {
	var api = maak();
	if (typeof module === "object" && module.exports) module.exports = api;
	else root.MozaRegelbord = api;
})(typeof self !== "undefined" ? self : this, function () {
	"use strict";

	var KOLOMMEN = [
		{ id: "te-doen", label: "Te doen" },
		{ id: "mee-bezig", label: "Mee bezig" },
		{ id: "komt-eraan", label: "Komt eraan" },
		{ id: "niet-beoordelen", label: "Niet beoordelen" },
		{ id: "afgerond", label: "Afgerond" },
	];

	var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

	// "1 juli 2026" -> Date; alles wat niet die vorm heeft -> null. Datums in
	// _data/ staan uitgeschreven (schrijfwijzer), dus dit is de enige vorm.
	function parseDatum(tekst) {
		var m = /^\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})\s*$/i.exec(String(tekst || ""));
		if (!m) return null;
		var maand = MAANDEN.indexOf(m[2].toLowerCase());
		if (maand < 0) return null;
		return new Date(Date.UTC(Number(m[3]), maand, Number(m[1])));
	}

	function vind(lijst, id) {
		for (var i = 0; i < lijst.length; i++) if (lijst[i].id === id) return lijst[i];
		return null;
	}

	function kaartenVoor(persona, regelgeving, subsidies) {
		var kaarten = [];
		((persona && persona.regelgeving) || []).forEach(function (id) {
			var item = vind(regelgeving || [], id);
			if (item) kaarten.push({ id: id, soort: "regeling", item: item });
		});
		((persona && persona.subsidies) || []).forEach(function (id) {
			var item = vind(subsidies || [], id);
			if (item) kaarten.push({ id: id, soort: "subsidie", item: item });
		});
		return kaarten;
	}

	// Een zaak hoort bij een kaart als de zaak de regel-id draagt, of als het
	// onderwerp de titel raakt (de assistent zet nog geen regel-id op een zaak).
	function zaakVoor(kaart, zaken) {
		var titel = String(kaart.item.titel || "").toLowerCase();
		for (var i = 0; i < (zaken || []).length; i++) {
			var z = zaken[i];
			if (z.regelId === kaart.id) return z;
			var onderwerp = String(z.onderwerp || z.titel || "").toLowerCase();
			if (kaart.id === "milieubeheer" && /energiebespar|informatieplicht/.test(onderwerp)) return z;
			if (onderwerp && titel.indexOf(onderwerp) >= 0) return z;
		}
		return null;
	}

	function isAfgerond(zaak) {
		return /ingediend|afgehandeld|afgerond|toegekend/i.test(String(zaak.status || ""));
	}

	function voorstelKolom(kaart, context) {
		var vandaag = context.vandaag || new Date();
		var zaak = zaakVoor(kaart, context.zaken);
		if (zaak) return isAfgerond(zaak) ? "afgerond" : "mee-bezig";
		if (context.verborgenTitels && context.verborgenTitels.has(kaart.item.titel)) return "niet-beoordelen";
		var start = parseDatum(kaart.item.inwerkingtreding);
		if (start && start.getTime() > vandaag.getTime()) return "komt-eraan";
		return "te-doen";
	}

	function sleutel(kvk) {
		return "bord:" + String(kvk || "");
	}

	function leesBord(storage, kvk) {
		try {
			var ruw = storage.getItem(sleutel(kvk));
			var data = ruw ? JSON.parse(ruw) : null;
			return data && typeof data === "object" ? data : {};
		} catch (e) {
			return {};
		}
	}

	function schrijfBord(storage, kvk, bord) {
		try {
			storage.setItem(sleutel(kvk), JSON.stringify(bord || {}));
		} catch (e) {
			/* opslag vol of geblokkeerd: het bord werkt dan alleen deze sessie */
		}
	}

	function plaatsing(kaart, bord, context) {
		var eigen = bord && bord[kaart.id];
		if (eigen && eigen.door === "ondernemer") return eigen;
		return { kolom: voorstelKolom(kaart, context), door: "assistent" };
	}

	function normaliseer(tekst) {
		return String(tekst || "")
			.toLowerCase()
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.replace(/[^a-z0-9&+ ]+/g, " ");
	}

	function woorden(tekst) {
		return normaliseer(tekst).split(/\s+/).filter(function (w) { return w.length >= 2; });
	}

	// Gewogen woordmatch: titel > geldtVoor > beschrijving > inhoud. Een woord
	// raakt ook als het als deel van een langer woord voorkomt
	// (energiebesparing ⊂ energiebesparingsplicht).
	function scoreVoor(termen, item) {
		var velden = [
			[item.titel, 5],
			[item.geldtVoor, 3],
			[item.beschrijving, 2],
			[(item.inhoud || []).join(" "), 1],
		];
		var score = 0;
		termen.forEach(function (term) {
			velden.forEach(function (veld) {
				if (normaliseer(veld[0]).indexOf(term) >= 0) score += veld[1];
			});
		});
		return score;
	}

	function zoek(vraag, regelgeving, subsidies, extraTermen) {
		var termen = woorden(vraag).concat((extraTermen || []).map(normaliseer).filter(Boolean));
		if (!termen.length) return [];
		var alles = (regelgeving || []).map(function (r) { return { id: r.id, soort: "regeling", item: r }; })
			.concat((subsidies || []).map(function (s) { return { id: s.id, soort: "subsidie", item: s }; }));
		return alles
			.map(function (k) { k.score = scoreVoor(termen, k.item); return k; })
			.filter(function (k) { return k.score > 0; })
			.sort(function (a, b) { return b.score - a.score; });
	}

	return {
		KOLOMMEN: KOLOMMEN,
		parseDatum: parseDatum,
		kaartenVoor: kaartenVoor,
		voorstelKolom: voorstelKolom,
		leesBord: leesBord,
		schrijfBord: schrijfBord,
		plaatsing: plaatsing,
		zoek: zoek,
	};
});
```

- [ ] **Step 4: Run, verwacht slagen**

Run: `npm test`
Expected: alle tests PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/javascript/regelbord-logica.js tests/regelbord-logica.test.mjs package.json
git commit -m "➕ Logica voor het bord Wetten en regels: kaarten, voorstelkolom, bordstaat, zoeken"
```

---

### Task 2: Menu en pagina-markup

**Files:**
- Modify: `moza/moza.json` (subNav)
- Modify: `moza/regelgeving.njk` (hele body)
- Modify: `_includes/base.njk:104-111` (scripts)
- Modify: `style/style.css` (nieuwe blokken achteraan)

**Interfaces:**
- Produces DOM-haken voor Task 3–5: `[data-regelbord]`, `[data-kolom="<id>"] ul`, `#regel-zoek-form`, `#regel-zoek-input`, `[data-zoekresultaten]`, `#assistent-paneel`, `#assistent-paneel-titel`, `#assistent-paneel-sluit`, `[data-bord-melding]` (aria-live).

- [ ] **Step 1: Menu**

In `moza/moza.json`: het item met `"url": "/moza/regelgeving/"` krijgt `"label": "Wetten en regels"`. Het item met `"url": "/moza/digitale-assistent/"` verwijderen (de pagina zelf blijft bestaan).

- [ ] **Step 2: Pagina**

`moza/regelgeving.njk` volledig vervangen:

```njk
---
title: "MijnOverheid Zakelijk: Wetten en regels"
permalink: "/moza/regelgeving/"
subNavActive: "/moza/regelgeving/"
---

{% include "side-nav-overheid.njk" %}

<article id="hoofd-inhoud" class="regelbord-pagina">
	<nav class="breadcrumb">
		<ol>
			<li><a href="{{ '/moza/' | url }}">Home</a></li>
			<li aria-current="page">Wetten en regels</li>
		</ol>
	</nav>

	<h1>Wetten en regels</h1>

	<section class="card regel-zoek">
		<h2 class="visually-hidden">Zoeken in alle wetten, regels en subsidies</h2>
		<form id="regel-zoek-form" role="search">
			<label for="regel-zoek-input">Waar zoekt u naar? Bijvoorbeeld “koelcel”, “personeel” of “verpakkingen”.</label>
			<div class="regel-zoek-rij">
				<input id="regel-zoek-input" type="search" autocomplete="off" />
				<button type="submit">Zoeken</button>
			</div>
			<p class="klein" data-feature="Slim zoeken in wetten en regels" data-feature-type="functionaliteit" data-feature-default="off" data-slim-zoeken>De assistent vertaalt uw woorden naar zoektermen; de resultaten komen altijd uit de officiële bronnen.</p>
		</form>
		<div data-zoekresultaten class="dynamic-list" aria-live="polite"></div>
	</section>

	<p class="visually-hidden" role="status" data-bord-melding></p>

	<section class="regelbord" data-regelbord aria-label="Uw wetten, regels en subsidies">
		<section class="regelbord-kolom" data-kolom="te-doen"><h2>Te doen</h2><ul class="dynamic-list"></ul></section>
		<section class="regelbord-kolom" data-kolom="mee-bezig"><h2>Mee bezig</h2><ul class="dynamic-list"></ul></section>
		<section class="regelbord-kolom" data-kolom="komt-eraan"><h2>Komt eraan</h2><ul class="dynamic-list"></ul></section>
		<section class="regelbord-kolom" data-kolom="niet-beoordelen"><h2>Niet beoordelen</h2><ul class="dynamic-list"></ul></section>
		<section class="regelbord-kolom" data-kolom="afgerond"><h2>Afgerond</h2><ul class="dynamic-list"></ul></section>
	</section>

	<aside id="assistent-paneel" class="assistent-paneel" role="complementary" aria-labelledby="assistent-paneel-titel" hidden>
		<div class="assistent-paneel-kop">
			<h2 id="assistent-paneel-titel">Digitale assistent (AI)</h2>
			<button id="assistent-paneel-sluit" type="button" class="secondary">Sluit</button>
		</div>
		<p class="klein" data-paneel-scope></p>
		<section class="chat-container">
			<h3 class="visually-hidden">Gesprek</h3>
			<div id="chat-messages" class="chat-messages" role="log" aria-live="polite" data-url-zaken="{{ '/moza/lopende-zaken/' | url }}" data-url-contact="{{ '/moza/contact/' | url }}"></div>
			<form id="chat-form">
				<label class="visually-hidden" for="chat-input">Uw vraag</label>
				<textarea id="chat-input" placeholder="Stel uw vraag over deze regel" required></textarea>
				<div class="action-group">
					<button type="submit">Vraag stellen</button>
					<button id="chat-nieuw" class="secondary" type="button" aria-disabled="true">Nieuw gesprek starten</button>
					<button id="chat-bewaar" class="secondary" type="button" aria-disabled="true">Bewaar gesprek</button>
				</div>
				<p id="chat-bewaar-melding" class="visually-hidden" role="status"></p>
			</form>
			<small class="disclaimer">{% icon "/assets/icons/icon-informatie.svg" %} De antwoorden van deze assistent worden door AI gegenereerd en kunnen fouten bevatten. In dit gesprek gaat het alleen over de gekozen regel; controleer belangrijke informatie bij de bron.</small>
			<div id="chat-status" class="chat-status" aria-live="polite" data-feature="Status van bronnen in de Digitale assistent" data-feature-type="functionaliteit" data-feature-default="off"></div>
		</section>
	</aside>
</article>
```

- [ ] **Step 3: Scripts laden**

In `_includes/base.njk`, ná de regel die `personas.js` laadt (regel 104) en vóór `digitale-assistent.js` (regel 111):

```njk
		<script src="{{ '/assets/javascript/regelbord-logica.js' | url }}" defer></script>
		<script src="{{ '/assets/javascript/regelbord.js' | url }}" defer></script>
```

(`regelbord.js` bestaat pas na Task 3; een 404 op een `defer`-script breekt niets. Wie Task 2 los oplevert, maakt een leeg `regelbord.js` met alleen `"use strict";`.)

- [ ] **Step 4: CSS**

Achteraan `style/style.css`:

```css
/* Wetten en regels: zoekbalk, bord, kaarten, assistent-paneel */
.regel-zoek form {
	display: flex;
	flex-direction: column;
	gap: var(--toepassing-space-margin-xs);
}
.regel-zoek-rij {
	display: flex;
	flex-wrap: wrap;
	gap: var(--toepassing-space-margin-xs);
}
.regel-zoek-rij input {
	flex: 1 1 20rem;
	min-inline-size: 0;
}
.regelbord {
	display: grid;
	gap: var(--toepassing-space-layout-xs);
	grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
}
.regelbord-kolom {
	background: var(--toepassing-color-background-subtle);
	border-radius: var(--toepassing-border-radius-md);
	display: flex;
	flex-direction: column;
	gap: var(--toepassing-space-margin-sm);
	padding: var(--toepassing-space-padding-sm);
}
.regelbord-kolom h2 {
	font: var(--toepassing-text-heading-3);
}
.regelbord-kolom ul {
	display: flex;
	flex-direction: column;
	gap: var(--toepassing-space-margin-sm);
	list-style: none;
	margin: 0;
	padding: 0;
}
.regelkaart {
	background: var(--toepassing-color-background-default);
	border-radius: var(--toepassing-border-radius-md);
	box-shadow: var(--toepassing-border-card-default);
	display: flex;
	flex-direction: column;
	gap: var(--toepassing-space-margin-xs);
	padding: var(--toepassing-space-padding-sm);
}
.regelkaart h3 {
	font: var(--toepassing-text-heading-4);
	margin: 0;
}
.regelkaart-label {
	font: var(--toepassing-text-smalltext);
	color: var(--toepassing-color-text-subtle);
}
.regelkaart-feiten {
	border-inline-start: var(--toepassing-border-width-md) solid var(--toepassing-color-feedback-info-border);
	font: var(--toepassing-text-smalltext);
	margin: 0;
	padding-inline-start: var(--toepassing-space-padding-xs);
}
.regelkaart-feiten dt {
	font-weight: var(--toepassing-font-weight-bold);
}
.regelkaart-herkomst {
	font: var(--toepassing-text-smalltext);
	color: var(--toepassing-color-text-subtle);
}
.regelkaart-acties {
	display: flex;
	flex-wrap: wrap;
	gap: var(--toepassing-space-margin-xs);
}
.regelkaart-menu {
	position: relative;
}
.regelkaart-menu ul {
	background: var(--toepassing-color-background-default);
	border-radius: var(--toepassing-border-radius-md);
	box-shadow: var(--toepassing-border-card-default);
	inset-block-start: 100%;
	inset-inline-start: 0;
	list-style: none;
	margin: 0;
	min-inline-size: 12rem;
	padding: var(--toepassing-space-padding-2xs);
	position: absolute;
	z-index: 2;
}
.regelkaart-menu ul button {
	inline-size: 100%;
	text-align: start;
}
.regelkaart-reden {
	display: flex;
	flex-direction: column;
	gap: var(--toepassing-space-margin-2xs);
}
.assistent-paneel {
	background: var(--toepassing-color-background-default);
	block-size: 100dvh;
	box-shadow: var(--toepassing-border-card-default);
	display: flex;
	flex-direction: column;
	gap: var(--toepassing-space-margin-sm);
	inline-size: min(100%, 32rem);
	inset-block-start: 0;
	inset-inline-end: 0;
	overflow: auto;
	padding: var(--toepassing-space-card-padding);
	position: fixed;
	z-index: 10;
}
.assistent-paneel[hidden] {
	display: none;
}
.assistent-paneel-kop {
	align-items: center;
	display: flex;
	justify-content: space-between;
}
```

Run: `npm run lint:css` → geen fouten. Run: `npx @11ty/eleventy` → build slaagt, `_site/moza/regelgeving/index.html` bevat de vijf kolommen.

- [ ] **Step 5: Commit**

```bash
git add moza/moza.json moza/regelgeving.njk _includes/base.njk style/style.css assets/javascript/regelbord.js
git commit -m "✏️ Wetten en regelgeving wordt Wetten en regels: bord, zoekbalk en assistent-paneel (markup)"
```

---

### Task 3: Bord renderen en verplaatsen

**Files:**
- Create/Modify: `assets/javascript/regelbord.js`

**Interfaces:**
- Consumes: `window.MozaRegelbord` (Task 1), `window.personasData`, `window.regelgevingData`, `window.subsidiesData`, `window.Personas.actief()`, `localStorage` sleutels `zaken` en `hidden:<titel>`, `window.PATH_PREFIX`.
- Produces: `window.MozaRegelbordUI = { render, open }`; events: klik op `[data-actie="assistent"]` en `[data-actie="toets"]` roepen `window.MozaRegelbordUI.open(kaart, modus)` aan (Task 4 vult `open` in; hier is het een no-op die de kaart logt).

- [ ] **Step 1: Handmatige testlijst (geen DOM-testrunner in deze repo)**

Voor Task 3 gelden deze controles in de browser (`npm run dev`, `http://localhost:8080/moza/regelgeving/`, persona Bloemenkweker via `?persona=bloemenkweker`):

1. Vijf kolommen; kaarten: milieubeheer, arbowet, minimumloon, loonbelasting, bestrijdingsmiddelen + zeven subsidies.
2. Elke kaart toont label Wet/Subsidie, titel, één zin, strook "Wat we weten" met de datum, herkomst "Voorgesteld door de assistent".
3. Knop "Verplaats naar…" opent een menu met de vier andere kolommen; Enter/Space werkt; Escape sluit; focus terug op de knop.
4. Verplaatsen naar "Niet beoordelen" vraagt een reden; zonder reden geen verplaatsing; met reden verschijnt de reden op de kaart.
5. Na verplaatsen staat de kaart in de nieuwe kolom, herkomst "Door u geplaatst op 27 augustus 2026", `[data-bord-melding]` bevat "Verplaatst naar …". Herladen bewaart de stand. Persona-wissel geeft een ander bord.
6. Een zaak in localStorage `zaken` met `status: "ingediend"` en onderwerp "Informatieplicht energiebesparing" zet milieubeheer in Afgerond (mits niet handmatig verplaatst).

- [ ] **Step 2: Implementatie**

`assets/javascript/regelbord.js`:

```js
/**
 * regelbord.js
 *
 * Het bord op /moza/regelgeving/: kaarten uit de actieve persona, ingedeeld
 * volgens het voorstel van de assistent (regelbord-logica.js) of de keuze van
 * de ondernemer, met verplaatsen via een knopmenu. Geen slepen: toetsenbord en
 * screenreader kunnen alles wat de muis kan.
 */
(function () {
	"use strict";

	var wortel = document.querySelector("[data-regelbord]");
	if (!wortel || !window.MozaRegelbord) return;

	var logica = window.MozaRegelbord;
	var PATH_PREFIX = typeof window.PATH_PREFIX === "string" && window.PATH_PREFIX !== "/" ? window.PATH_PREFIX.replace(/\/$/, "") : "";
	var melding = document.querySelector("[data-bord-melding]");

	function persona() {
		return window.Personas && window.Personas.actief ? window.Personas.actief() : null;
	}
	function kvk() {
		var p = persona();
		return (p && p.bedrijf && p.bedrijf.kvkNummer) || "";
	}
	function zaken() {
		try {
			return JSON.parse(localStorage.getItem("zaken")) || [];
		} catch (e) {
			return [];
		}
	}
	function verborgenTitels() {
		var set = new Set();
		for (var i = 0; i < localStorage.length; i++) {
			var k = localStorage.key(i);
			if (k && k.indexOf("hidden:") === 0) set.add(k.slice(7));
		}
		return set;
	}
	function context() {
		return { vandaag: new Date(), zaken: zaken(), verborgenTitels: verborgenTitels() };
	}
	function datumNL(iso) {
		var d = new Date(iso);
		if (isNaN(d.getTime())) return "";
		return d.getUTCDate() + " " + ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"][d.getUTCMonth()] + " " + d.getUTCFullYear();
	}
	function zeg(tekst) {
		if (melding) melding.textContent = tekst;
	}
	function el(tag, klasse, tekst) {
		var e = document.createElement(tag);
		if (klasse) e.className = klasse;
		if (tekst != null) e.textContent = tekst;
		return e;
	}

	// De strook "Wat we weten": alleen feiten met een bron. Geen aannames.
	function feitenVoor(kaart, ctx) {
		var item = kaart.item;
		var feiten = [];
		var start = logica.parseDatum(item.inwerkingtreding);
		if (start) feiten.push([start.getTime() > ctx.vandaag.getTime() ? "Geldt vanaf" : "Geldt sinds", item.inwerkingtreding]);
		if (item.aanvraagperiode) feiten.push(["Aanvragen", item.aanvraagperiode]);
		var zaak = null;
		ctx.zaken.forEach(function (z) {
			var onderwerp = String(z.onderwerp || z.titel || "");
			if (!zaak && (z.regelId === kaart.id || (kaart.id === "milieubeheer" && /energiebespar|informatieplicht/i.test(onderwerp)))) zaak = z;
		});
		if (zaak) feiten.push(["Zaak", (zaak.status ? zaak.status.charAt(0).toUpperCase() + zaak.status.slice(1) : "Aangemaakt") + (zaak.referentienummer ? ", referentie " + zaak.referentienummer : "")]);
		feiten.push(["Toets", item.regelrechtRegel ? "Automatisch te toetsen (RegelRecht)" : "Niet automatisch te toetsen"]);
		return feiten;
	}

	function maakMenu(kaart, huidigeKolom) {
		var wrap = el("div", "regelkaart-menu");
		var knop = el("button", "secondary", "Verplaats naar…");
		knop.type = "button";
		knop.setAttribute("aria-haspopup", "true");
		knop.setAttribute("aria-expanded", "false");
		var lijst = el("ul");
		lijst.hidden = true;
		logica.KOLOMMEN.forEach(function (kolom) {
			if (kolom.id === huidigeKolom) return;
			var li = el("li");
			var b = el("button", "link-button", kolom.label);
			b.type = "button";
			b.addEventListener("click", function () {
				sluit();
				verplaats(kaart, kolom.id, knop);
			});
			li.appendChild(b);
			lijst.appendChild(li);
		});
		function open() {
			lijst.hidden = false;
			knop.setAttribute("aria-expanded", "true");
			var eerste = lijst.querySelector("button");
			if (eerste) eerste.focus();
		}
		function sluit() {
			lijst.hidden = true;
			knop.setAttribute("aria-expanded", "false");
		}
		knop.addEventListener("click", function () {
			if (lijst.hidden) open();
			else sluit();
		});
		wrap.addEventListener("keydown", function (e) {
			if (e.key === "Escape" && !lijst.hidden) {
				e.preventDefault();
				sluit();
				knop.focus();
			}
		});
		wrap.appendChild(knop);
		wrap.appendChild(lijst);
		return wrap;
	}

	// "Niet beoordelen" vraagt een reden: die blijft op de kaart staan, zodat de
	// ondernemer (en wie meekijkt) later ziet waarom.
	function vraagReden(kaart, artikel, terugNaar) {
		var form = el("form", "regelkaart-reden");
		var label = el("label", null, "Waarom wilt u deze regel niet beoordelen?");
		var veld = document.createElement("input");
		veld.type = "text";
		veld.required = true;
		veld.id = "reden-" + kaart.id;
		label.htmlFor = veld.id;
		var acties = el("div", "action-group");
		var ok = el("button", null, "Opslaan");
		ok.type = "submit";
		var annuleer = el("button", "secondary", "Annuleren");
		annuleer.type = "button";
		annuleer.addEventListener("click", function () {
			form.remove();
			terugNaar.focus();
		});
		acties.appendChild(ok);
		acties.appendChild(annuleer);
		form.appendChild(label);
		form.appendChild(veld);
		form.appendChild(acties);
		form.addEventListener("submit", function (e) {
			e.preventDefault();
			var reden = veld.value.trim();
			if (!reden) return;
			bewaarPlaatsing(kaart, "niet-beoordelen", reden);
			render();
			focusKaart(kaart.id);
			zeg("Verplaatst naar Niet beoordelen.");
		});
		artikel.appendChild(form);
		veld.focus();
	}

	function bewaarPlaatsing(kaart, kolomId, reden) {
		var bord = logica.leesBord(localStorage, kvk());
		bord[kaart.id] = { kolom: kolomId, door: "ondernemer", op: new Date().toISOString().slice(0, 10) };
		if (reden) bord[kaart.id].reden = reden;
		logica.schrijfBord(localStorage, kvk(), bord);
	}

	function verplaats(kaart, kolomId, knop) {
		if (kolomId === "niet-beoordelen") {
			vraagReden(kaart, knop.closest(".regelkaart"), knop);
			return;
		}
		bewaarPlaatsing(kaart, kolomId, null);
		render();
		focusKaart(kaart.id);
		var label = logica.KOLOMMEN.filter(function (k) { return k.id === kolomId; })[0].label;
		zeg("Verplaatst naar " + label + ".");
	}

	function focusKaart(id) {
		var knop = wortel.querySelector('[data-kaart="' + id + '"] .regelkaart-menu > button');
		if (knop) knop.focus();
	}

	function maakKaart(kaart, stand, ctx) {
		var item = kaart.item;
		var li = el("li");
		var artikel = el("article", "regelkaart");
		artikel.setAttribute("data-kaart", kaart.id);
		artikel.setAttribute("aria-labelledby", "kaart-" + kaart.id);
		artikel.appendChild(el("p", "regelkaart-label", (kaart.soort === "subsidie" ? "Subsidie" : "Wet") + " · " + (item.bron || item.verstrekker || "")));
		var h3 = el("h3", null, item.titel);
		h3.id = "kaart-" + kaart.id;
		artikel.appendChild(h3);
		artikel.appendChild(el("p", null, item.beschrijving || ""));

		var dl = el("dl", "regelkaart-feiten");
		feitenVoor(kaart, ctx).forEach(function (f) {
			dl.appendChild(el("dt", null, f[0]));
			dl.appendChild(el("dd", null, f[1]));
		});
		artikel.appendChild(dl);

		var herkomst = stand.door === "ondernemer" ? "Door u geplaatst op " + datumNL(stand.op) : "Voorgesteld door de assistent";
		if (stand.reden) herkomst += " · Reden: " + stand.reden;
		artikel.appendChild(el("p", "regelkaart-herkomst", herkomst));

		var acties = el("div", "regelkaart-acties");
		if (item.regelrechtRegel) {
			var toets = el("button", null, "Geldt dit voor mij?");
			toets.type = "button";
			toets.setAttribute("data-actie", "toets");
			toets.addEventListener("click", function () { window.MozaRegelbordUI.open(kaart, "toets"); });
			acties.appendChild(toets);
		}
		var vraag = el("button", "secondary", "Vraag de assistent");
		vraag.type = "button";
		vraag.setAttribute("data-actie", "assistent");
		vraag.addEventListener("click", function () { window.MozaRegelbordUI.open(kaart, "vraag"); });
		acties.appendChild(vraag);
		acties.appendChild(maakMenu(kaart, stand.kolom));
		if (item.externUrl) {
			var lees = el("a", "link-button", "Lees de regel");
			lees.href = item.externUrl;
			lees.target = "_blank";
			lees.rel = "noopener";
			acties.appendChild(lees);
		}
		artikel.appendChild(acties);
		li.appendChild(artikel);
		return li;
	}

	function render() {
		var ctx = context();
		var bord = logica.leesBord(localStorage, kvk());
		var kaarten = logica.kaartenVoor(persona(), window.regelgevingData || [], window.subsidiesData || []);
		wortel.querySelectorAll("[data-kolom] ul").forEach(function (ul) {
			while (ul.firstChild) ul.removeChild(ul.firstChild);
		});
		kaarten.forEach(function (kaart) {
			var stand = logica.plaatsing(kaart, bord, ctx);
			var ul = wortel.querySelector('[data-kolom="' + stand.kolom + '"] ul');
			if (ul) ul.appendChild(maakKaart(kaart, stand, ctx));
		});
	}

	window.MozaRegelbordUI = {
		render: render,
		open: function (kaart, modus) {
			/* Task 4 vult dit in: zijpaneel openen met de scope van de kaart. */
			if (window.console) console.log("assistent openen", modus, kaart.id);
		},
		bewaarPlaatsing: bewaarPlaatsing,
	};

	render();
	document.addEventListener("persona:changed", render);
	window.addEventListener("storage", function (e) {
		if (e.key === "zaken") render();
	});
})();
```

Controleer of `personas.js` een event uitstuurt bij persona-wissel (`grep -n "dispatchEvent" assets/javascript/personas.js`). Heet het anders dan `persona:changed`, gebruik die naam.

- [ ] **Step 3: Handmatig testen**

Run: `npm run dev`; loop de zes controles uit Step 1 na, ook met alleen het toetsenbord (Tab, Enter, Escape) en met VoiceOver/NVDA als beschikbaar. Run: `npx prettier --check assets/javascript/regelbord.js`.

- [ ] **Step 4: Commit**

```bash
git add assets/javascript/regelbord.js
git commit -m "➕ Bord Wetten en regels: kaarten per persona, voorstelkolom, verplaatsen via knopmenu"
```

---

### Task 4: Zijpaneel met gescopete assistent

**Files:**
- Modify: `assets/javascript/assistent-vraag.js`
- Modify: `assets/javascript/digitale-assistent.js:363-365` (`getComboKey`) en de plek waar `startvraag` wordt afgehandeld (regel ~1971)
- Modify: `assets/javascript/regelbord.js` (`open`)

**Interfaces:**
- `MozaAssistentVraag.scopeVraag(item, soort, modus)` → string. `modus` "toets" → `item.assistentVraag` of "Geldt “<titel>” voor mijn bedrijf?"; "vraag" → "Ik heb een vraag over “<titel>”."
- `window.MozaRegelScope = { id: string|null }`; `getComboKey()` voegt `":" + id` toe als gezet, zodat gesprek en sessie per regel apart lopen.
- `window.MozaChat.stel(vraag)`: nieuwe, kleine publieke functie in `digitale-assistent.js` die `input.value = vraag` zet en `form.requestSubmit()` doet (zelfde pad als `?vraag=`).

- [ ] **Step 1: Test voor scopeVraag**

Toevoegen aan `tests/regelbord-logica.test.mjs`:

```js
const vraagModule = require("../assets/javascript/assistent-vraag.js");

test("scopeVraag: toets gebruikt de redactionele vraag, vraag opent met de regel", () => {
	const item = { titel: "Wet milieubeheer: rapportageplicht energiebesparing", assistentVraag: "Help mij met de informatieplicht energiebesparing voor mijn bedrijf" };
	assert.equal(vraagModule.scopeVraag(item, "regeling", "toets"), "Help mij met de informatieplicht energiebesparing voor mijn bedrijf");
	assert.equal(vraagModule.scopeVraag({ titel: "Arbowet: RI&E" }, "regeling", "toets"), "Geldt “Arbowet: RI&E” voor mijn bedrijf?");
	assert.equal(vraagModule.scopeVraag({ titel: "Arbowet: RI&E" }, "regeling", "vraag"), "Ik heb een vraag over “Arbowet: RI&E”.");
});
```

Run: `npm test` → FAIL: `scopeVraag is not a function`.

- [ ] **Step 2: scopeVraag**

In `assistent-vraag.js`, vóór `return { vraag: vraag };`:

```js
	/**
	 * De openingszin vanuit een kaart op het bord. "toets" start de bestaande
	 * flow (dezelfde vraag als de knop op de detailpagina); "vraag" opent het
	 * gesprek met de regel als onderwerp, zodat de assistent weet waar het
	 * over gaat zonder dat de ondernemer dat zelf hoeft te typen.
	 */
	function scopeVraag(item, soort, modus) {
		if (!item) return "";
		if (modus === "toets") return vraag(item, soort);
		return "Ik heb een vraag over " + tussenAanhalingstekens(item.titel) + ".";
	}

	return { vraag: vraag, scopeVraag: scopeVraag };
```

Run: `npm test` → PASS.

- [ ] **Step 3: Gesprekssleutel per regel en `stel()`**

In `digitale-assistent.js`:

`getComboKey` (regel 363):

```js
	function getComboKey() {
		var scope = window.MozaRegelScope && window.MozaRegelScope.id ? ":" + window.MozaRegelScope.id : "";
		return getLLM() + ":" + getTransport() + ":" + getPersonaId() + scope;
	}
```

Direct na de definitie van `form`/`input` (rond regel 30), een publieke haak:

```js
	// Voor het bord Wetten en regels: een kaart stelt een vraag namens de
	// ondernemer, via hetzelfde pad als ?vraag=.
	window.MozaChat = {
		stel: function (vraag) {
			if (!vraag) return;
			input.value = vraag;
			form.requestSubmit();
		},
		herlaad: function () {
			// Ander gesprek (andere regel): geschiedenis van die sleutel tonen.
			var combo = getComboKey();
			messages.innerHTML = chatHistory[combo] || "";
			heeftGesprek = !!chatHistory[combo];
			if (heeftGesprek) enableNieuwKnop(); else disableNieuwKnop();
		},
	};
```

Zet dit blok ná de definities van `chatHistory`, `heeftGesprek`, `enableNieuwKnop`, `disableNieuwKnop` (anders `undefined` op het moment van aanroepen — controleer met `grep -n "var chatHistory\|function enableNieuwKnop" assets/javascript/digitale-assistent.js`; plaats het blok onder de laatste daarvan).

- [ ] **Step 4: `open` in regelbord.js**

Vervang de placeholder `open` in `window.MozaRegelbordUI`:

```js
	var paneel = document.getElementById("assistent-paneel");
	var paneelTitel = document.getElementById("assistent-paneel-titel");
	var paneelScope = document.querySelector("[data-paneel-scope]");
	var paneelSluit = document.getElementById("assistent-paneel-sluit");
	var laatsteKnop = null;

	function sluitPaneel() {
		if (!paneel) return;
		paneel.hidden = true;
		window.MozaRegelScope = { id: null };
		if (laatsteKnop) laatsteKnop.focus();
	}

	function openPaneel(kaart, modus) {
		if (!paneel) return;
		laatsteKnop = document.activeElement;
		window.MozaRegelScope = { id: kaart.id };
		paneelTitel.textContent = "Digitale assistent (AI)";
		paneelScope.textContent = "Dit gesprek gaat over: " + kaart.item.titel;
		paneel.hidden = false;
		if (window.MozaChat) {
			window.MozaChat.herlaad();
			var vraag = window.MozaAssistentVraag.scopeVraag(kaart.item, kaart.soort, modus);
			if (modus === "toets" || !document.getElementById("chat-messages").childElementCount) window.MozaChat.stel(vraag);
		}
		paneelSluit.focus();
	}

	if (paneelSluit) paneelSluit.addEventListener("click", sluitPaneel);
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && paneel && !paneel.hidden) sluitPaneel();
	});
```

en in `window.MozaRegelbordUI`: `open: openPaneel`.

Bij een "vraag"-opening met bestaande geschiedenis stelt het paneel geen nieuwe vraag: het gesprek gaat verder waar het was.

- [ ] **Step 5: Handmatig testen**

1. "Geldt dit voor mij?" op milieubeheer → paneel open, vraag "Help mij met de informatieplicht…" verstuurd, flow loopt (Delen-knop, formulieren) — backend lokaal op `:8000` of `MOZA_CHAT_API`.
2. "Vraag de assistent" op arbowet → paneel met "Dit gesprek gaat over: Arbowet…", vraag "Ik heb een vraag over “…”." verstuurd; antwoord komt.
3. Sluit (knop en Escape) → focus terug op de knop van de kaart. Opnieuw openen op arbowet → geschiedenis staat er nog; openen op minimumloon → leeg gesprek.
4. Na indienen in de informatieplicht-flow: kaart milieubeheer springt naar Afgerond (event `storage` vuurt niet in hetzelfde tabblad — roep `window.MozaRegelbordUI.render()` aan vanuit `addZaak` in `digitale-assistent.js`: `if (window.MozaRegelbordUI) window.MozaRegelbordUI.render();` direct na `lijst.push(zaak)`).

Run: `npm test`, `npx prettier --check assets/javascript/*.js`.

- [ ] **Step 6: Commit**

```bash
git add assets/javascript/assistent-vraag.js assets/javascript/digitale-assistent.js assets/javascript/regelbord.js tests/regelbord-logica.test.mjs
git commit -m "➕ Assistent per kaart: zijpaneel met gesprek per regel"
```

---

### Task 5: Zoekbalk

**Files:**
- Modify: `assets/javascript/regelbord.js`

**Interfaces:**
- Consumes: `MozaRegelbord.zoek`, `MozaRegelbordUI.bewaarPlaatsing`, `MozaRegelbordUI.render`.
- Optioneel endpoint (bestaat nog niet; frontend werkt zonder): `POST <chatApi>/zoektermen` `{vraag}` → `{termen: string[]}`. Basis-URL zoals de chat hem bepaalt (`window.MOZA_CHAT_API` / `_data/chatApi.js`); bij fout of 404: geen extra termen.

- [ ] **Step 1: Implementatie**

Toevoegen aan `regelbord.js`, vóór `render();` onderaan:

```js
	var zoekForm = document.getElementById("regel-zoek-form");
	var zoekInput = document.getElementById("regel-zoek-input");
	var zoekUit = document.querySelector("[data-zoekresultaten]");
	var slimZoeken = document.querySelector("[data-slim-zoeken]");

	function chatApiBasis() {
		return (window.MOZA_CHAT_API || (window.chatApi && window.chatApi.base) || "").replace(/\/$/, "");
	}

	// Het model mag alleen zoektermen teruggeven; de frontend toont nooit
	// modeltekst als resultaat. Zonder endpoint (404, netwerkfout) gewoon
	// zonder extra termen zoeken.
	function extraTermen(vraag) {
		var basis = chatApiBasis();
		if (!slimZoeken || slimZoeken.hidden || !basis) return Promise.resolve([]);
		return fetch(basis + "/zoektermen", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ vraag: vraag }),
			signal: AbortSignal.timeout(4000),
		})
			.then(function (r) { return r.ok ? r.json() : { termen: [] }; })
			.then(function (d) { return Array.isArray(d.termen) ? d.termen.slice(0, 8) : []; })
			.catch(function () { return []; });
	}

	function toonResultaten(vraag, resultaten) {
		while (zoekUit.firstChild) zoekUit.removeChild(zoekUit.firstChild);
		var kop = el("h3", null, resultaten.length ? resultaten.length + " gevonden voor “" + vraag + "”" : "Geen regel gevonden voor “" + vraag + "”");
		zoekUit.appendChild(kop);
		if (!resultaten.length) {
			var p = el("p", null, "Probeer een ander woord, of kijk op ");
			var a = el("a", null, "wetten.overheid.nl");
			a.href = "https://wetten.overheid.nl/";
			a.target = "_blank";
			a.rel = "noopener";
			p.appendChild(a);
			p.appendChild(document.createTextNode("."));
			zoekUit.appendChild(p);
			return;
		}
		var ctx = context();
		var bord = logica.leesBord(localStorage, kvk());
		var eigen = logica.kaartenVoor(persona(), window.regelgevingData || [], window.subsidiesData || []).map(function (k) { return k.id; });
		var ul = el("ul");
		resultaten.slice(0, 10).forEach(function (kaart) {
			var opBord = eigen.indexOf(kaart.id) >= 0 || !!bord[kaart.id];
			var stand = opBord ? logica.plaatsing(kaart, bord, ctx) : null;
			var li = maakKaart(kaart, stand || { kolom: "te-doen", door: "assistent" }, ctx);
			var artikel = li.querySelector(".regelkaart");
			var status = el("p", "regelkaart-herkomst");
			if (opBord) {
				status.textContent = "Staat op uw bord: " + logica.KOLOMMEN.filter(function (k) { return k.id === stand.kolom; })[0].label;
			} else {
				var voeg = el("button", "secondary", "Toevoegen aan bord");
				voeg.type = "button";
				voeg.addEventListener("click", function () {
					bewaarPlaatsing(kaart, "te-doen", null);
					extraKaarten[kaart.id] = kaart;
					render();
					toonResultaten(vraag, resultaten);
					zeg("“" + kaart.item.titel + "” toegevoegd aan Te doen.");
				});
				status.appendChild(voeg);
			}
			artikel.insertBefore(status, artikel.querySelector(".regelkaart-acties"));
			ul.appendChild(li);
		});
		zoekUit.appendChild(ul);
	}

	// Kaarten die de ondernemer via zoeken toevoegde, buiten de persona-lijst om.
	var extraKaarten = {};

	if (zoekForm) {
		zoekForm.addEventListener("submit", function (e) {
			e.preventDefault();
			var vraag = zoekInput.value.trim();
			if (!vraag) return;
			extraTermen(vraag).then(function (termen) {
				toonResultaten(vraag, logica.zoek(vraag, window.regelgevingData || [], window.subsidiesData || [], termen));
			});
		});
	}
```

En in `render()`: na `var kaarten = logica.kaartenVoor(...)` de toegevoegde kaarten meenemen:

```js
		var bordIds = Object.keys(bord);
		var alle = (window.regelgevingData || []).map(function (r) { return { id: r.id, soort: "regeling", item: r }; })
			.concat((window.subsidiesData || []).map(function (s) { return { id: s.id, soort: "subsidie", item: s }; }));
		bordIds.forEach(function (id) {
			if (kaarten.some(function (k) { return k.id === id; })) return;
			var extra = alle.filter(function (k) { return k.id === id; })[0];
			if (extra) kaarten.push(extra);
		});
```

(Daarmee is `extraKaarten` overbodig: een toegevoegde kaart staat in het bord-object. Laat `extraKaarten` weg en verwijder de regel `extraKaarten[kaart.id] = kaart;`.)

- [ ] **Step 2: Handmatig testen**

1. "koelcel" zonder slim zoeken → geen resultaat, tekst met link naar wetten.overheid.nl.
2. "energiebesparing" → milieubeheer bovenaan, "Staat op uw bord: Te doen".
3. "verpakkingen" → UPV-kaart met "Toevoegen aan bord" → na klikken staat hij in Te doen met "Door u geplaatst", en de zoekresultaten tonen "Staat op uw bord".
4. Feature "Slim zoeken in wetten en regels" aan (Flags-paneel) zonder backend → zoeken werkt nog steeds (fetch faalt stil).
5. Toetsenbord: Tab naar veld, Enter zoekt, Tab door resultaten.

Run: `npx prettier --check assets/javascript/regelbord.js`.

- [ ] **Step 3: Commit**

```bash
git add assets/javascript/regelbord.js
git commit -m "➕ Zoekbalk over alle wetten, regels en subsidies, met toevoegen aan het bord"
```

---

### Task 6: Storybook en documentatie

**Files:**
- Create: `stories/Regelbord.stories.js`
- Modify: `README.md` (sectie over pagina's/scripts, waar `digitale-assistent.js` wordt genoemd)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Story**

`stories/Regelbord.stories.js`:

```js
export default {
	title: "Patronen/Wetten en regels (bord)",
	tags: ["autodocs"],
};

const kaart = (titel, feiten, herkomst, toetsbaar) => `
<li>
	<article class="regelkaart" aria-labelledby="k-${titel.length}">
		<p class="regelkaart-label">Wet · Rijksoverheid</p>
		<h3 id="k-${titel.length}">${titel}</h3>
		<p>Korte omschrijving van de regel in één zin.</p>
		<dl class="regelkaart-feiten">${feiten.map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`).join("")}</dl>
		<p class="regelkaart-herkomst">${herkomst}</p>
		<div class="regelkaart-acties">
			${toetsbaar ? '<button type="button">Geldt dit voor mij?</button>' : ""}
			<button type="button" class="secondary">Vraag de assistent</button>
			<div class="regelkaart-menu"><button type="button" class="secondary" aria-haspopup="true" aria-expanded="false">Verplaats naar…</button></div>
			<a class="link-button" href="#">Lees de regel</a>
		</div>
	</article>
</li>`;

export const Kaart = {
	parameters: { docs: { description: { story: "Eén regel of subsidie. De strook “Wat we weten” bevat alleen feiten met een bron; de herkomstregel zegt of de assistent de kaart plaatste of de ondernemer." } } },
	render: () => `<ul class="regelbord-kolom" style="list-style:none">${kaart("Wet milieubeheer: rapportageplicht energiebesparing", [["Geldt sinds", "1 juli 2023"], ["Toets", "Automatisch te toetsen (RegelRecht)"]], "Voorgesteld door de assistent", true)}</ul>`,
};

export const Bord = {
	parameters: { docs: { description: { story: "Vijf kolommen. Verplaatsen gaat via een knopmenu, niet via slepen." } } },
	render: () => `
<section class="regelbord" aria-label="Uw wetten, regels en subsidies">
	<section class="regelbord-kolom"><h2>Te doen</h2><ul>${kaart("Arbowet: RI&E", [["Geldt sinds", "1 januari 2020"], ["Toets", "Niet automatisch te toetsen"]], "Voorgesteld door de assistent", false)}</ul></section>
	<section class="regelbord-kolom"><h2>Mee bezig</h2><ul>${kaart("Wet milieubeheer: rapportageplicht energiebesparing", [["Zaak", "In behandeling, referentie RVO-EBR-2026-62345681-001"]], "Voorgesteld door de assistent", true)}</ul></section>
	<section class="regelbord-kolom"><h2>Komt eraan</h2><ul>${kaart("Uitgebreide producentenverantwoordelijkheid verpakkingen", [["Geldt vanaf", "1 juli 2027"]], "Voorgesteld door de assistent", false)}</ul></section>
	<section class="regelbord-kolom"><h2>Niet beoordelen</h2><ul>${kaart("Wijziging Dienstenwet", [["Geldt sinds", "1 januari 2026"]], "Door u geplaatst op 27 augustus 2026 · Reden: geen online platform", false)}</ul></section>
	<section class="regelbord-kolom"><h2>Afgerond</h2><ul></ul></section>
</section>`,
};
```

Run: `npm run storybook` → beide stories renderen zonder consolefouten.

- [ ] **Step 2: README en CHANGELOG**

README: in de opsomming van pagina's/scripts een regel: "`/moza/regelgeving/` — Wetten en regels als bord (`regelbord.js`, logica in `regelbord-logica.js`, tests via `npm test`). De assistent per kaart gebruikt `digitale-assistent.js` in een zijpaneel; het menu-item Digitale assistent is vervallen, de pagina `/moza/digitale-assistent/` blijft bestaan voor `?vraag=`-links."

CHANGELOG bovenaan: "➕ Wetten en regels als bord: kolommen Te doen / Mee bezig / Komt eraan / Niet beoordelen / Afgerond, zoekbalk over alle regels, assistent per kaart in een zijpaneel. ❌ Menu-item Digitale assistent (AI)."

- [ ] **Step 3: Alles nalopen en commit**

Run: `npm test && npm run lint:css && npx prettier --check . && npx @11ty/eleventy`
Expected: alles groen; build slaagt.

```bash
git add stories/Regelbord.stories.js README.md CHANGELOG.md
git commit -m "➕ Storybook en documentatie voor het bord Wetten en regels"
```

---

## Self-review (uitgevoerd bij het schrijven)

- Spec-dekking: principe (wijzen/rekenen/uitleggen) → Task 3 strook "Wat we weten" + Task 4 scope; menu/pagina → Task 2; kolommen incl. Afgerond → Task 1/2/3; kaart-acties → Task 3/4; voorstel-indeling + overrule + localStorage → Task 1/3; zijpaneel met bestaande chat en historie per regel → Task 2/4; zoekbalk incl. `/zoektermen`, "Toevoegen aan bord", geen-resultaat-tekst → Task 5; toegankelijkheid → Task 2 (markup/ARIA), Task 3 (menu, focus, aria-live), Task 4 (Escape, focus terug); Storybook → Task 6. Buiten scope (host-`regel`-veld, `/zoektermen`-endpoint) bewust niet in dit plan.
- Namen consistent: `MozaRegelbord` (logica), `MozaRegelbordUI` (DOM), `MozaAssistentVraag.scopeVraag`, `MozaChat.stel/herlaad`, `MozaRegelScope`.
- Open punt in Task 3 Step 2: de exacte naam van het persona-wissel-event; het plan zegt hoe je die vindt.
