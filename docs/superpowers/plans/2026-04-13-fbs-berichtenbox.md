# FBS Berichtenbox — Implementatieplan

> **Voor werkende agents:** VEREIST: gebruik superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans om dit plan taak-voor-taak uit te voeren. Stappen gebruiken `- [ ]` checkboxes.

**Goal:** Een werkende mock-frontend voor de FBS Berichtenbox in MOZa, volgens `docs/superpowers/specs/2026-04-13-fbs-berichtenbox-design.md`.

**Architecture:** Eleventy-gegenereerde statische pagina's (inbox, archief, prullenbak, detail per bericht) op basis van één data-bestand. Eén JS-bestand voegt client-side gedrag toe: filter/zoek, acties (archiveren/verwijderen/verplaatsen/markeer ongelezen), voortgangsindicator bij eerste bezoek, auto-polling van nieuw bericht, asynchroon bijlage-ophalen, demo-reset.

**Tech Stack:** Eleventy (3.x), Nunjucks, plain JavaScript, CSS met `--toepassing-*` design-tokens. Geen frameworks.

**Verificatie:** Dit project heeft geen test-suite (statisch prototype). Verificatie per stap = `npm run dev` draaien en de betreffende URL in de browser openen. Let op: `npm run dev` hoeft maar één keer te starten — daarna herlaadt Eleventy automatisch bij wijzigingen.

---

## Bestandsstructuur

**Nieuw aan te maken:**
- `_data/berichtenboxData.js` — genereert magazijnen (~400) en berichten (~120) runtime bij build
- `moza/berichtenbox/berichtenbox.json` — frontmatter-defaults voor berichtenbox sub-pagina's
- `moza/berichtenbox/archief.html` — archief-weergave
- `moza/berichtenbox/prullenbak.html` — prullenbak-weergave
- `moza/berichtenbox/bericht.njk` — detail-pagina template (pagination per bericht)
- `_includes/berichtenbox-side-nav.njk` — lokale zijbalk binnen Berichtenbox
- `_includes/berichtenbox-row.njk` — één bericht-rij in de lijst
- `_includes/berichtenbox-footer-link.njk` — "Demo opnieuw starten"-link onderaan
- `assets/javascript/berichtenbox.js` — alle client-side gedrag

**Te wijzigen:**
- `moza/berichtenbox.html` — volledige vervanging ("binnenkort beschikbaar" wordt de echte inbox)
- `style/style.css` — nieuwe CSS-regels voor berichtenbox-klassen (achteraan toegevoegd)
- `_includes/base.njk` — `<script>`-tag voor `berichtenbox.js` toevoegen

---

## Task 1: Data-generator voor magazijnen en berichten

**Files:**
- Create: `_data/berichtenboxData.js`

**Doel:** Eén data-bron voor alle pagina's en voor de JS (via `<script>`-inline data). ~400 magazijnen (10 instanties + ~390 gemeentes), ~120 berichten verspreid over ~25 magazijnen, 2 voorgevulde mappen.

- [ ] **Stap 1: Maak `_data/berichtenboxData.js` aan**

```js
// Genereert de dataset voor de FBS Berichtenbox-mock.
// 400 magazijnen (10 instanties + gemeentes), ~120 berichten, 2 voorgevulde mappen.

const INSTANTIES = [
	{ id: "belastingdienst", naam: "Belastingdienst" },
	{ id: "kvk", naam: "Kamer van Koophandel" },
	{ id: "rvo", naam: "Rijksdienst voor Ondernemend Nederland" },
	{ id: "svb", naam: "Sociale Verzekeringsbank" },
	{ id: "uwv", naam: "UWV" },
	{ id: "rdw", naam: "RDW" },
	{ id: "cbs", naam: "Centraal Bureau voor de Statistiek" },
	{ id: "ind", naam: "IND" },
	{ id: "ap", naam: "Autoriteit Persoonsgegevens" },
	{ id: "kadaster", naam: "Kadaster" },
];

// Nederlandse gemeentes (selectie van ~390 — echte namen)
const GEMEENTES = [
	"Amsterdam", "Rotterdam", "'s-Gravenhage", "Utrecht", "Eindhoven", "Groningen",
	"Tilburg", "Almere", "Breda", "Nijmegen", "Enschede", "Apeldoorn", "Haarlem",
	"Arnhem", "Amersfoort", "Zaanstad", "'s-Hertogenbosch", "Haarlemmermeer", "Zwolle",
	"Zoetermeer", "Leeuwarden", "Leiden", "Dordrecht", "Maastricht", "Emmen",
	"Ede", "Westland", "Venlo", "Delft", "Deventer", "Alkmaar", "Helmond", "Sittard-Geleen",
	"Alphen aan den Rijn", "Hilversum", "Heerlen", "Amstelveen", "Roosendaal",
	"Purmerend", "Oss", "Schiedam", "Hoorn", "Spijkenisse", "Gouda", "Lelystad",
	"Vlaardingen", "Almelo", "Assen", "Capelle aan den IJssel", "Veenendaal",
	"Bergen op Zoom", "Nieuwegein", "Hengelo", "Zeist", "Katwijk", "Roermond",
	"Hardenberg", "Tiel", "Zutphen", "Weert", "Middelburg", "Kerkrade",
	"Papendrecht", "Rijswijk", "Brunssum", "Waalwijk", "Ridderkerk", "Barneveld",
	"Culemborg", "IJsselstein", "Gorinchem", "Houten", "Woerden", "Terneuzen",
	"Stichtse Vecht", "Wageningen", "Harderwijk", "Noordoostpolder", "Soest",
	"Veldhoven", "Doetinchem", "Huizen", "De Bilt", "Etten-Leur", "Oosterhout",
	"Smallingerland", "Goes", "Veere", "Kampen", "Meppel", "Epe", "Dronten", "Coevorden",
	"Zandvoort", "Vlissingen", "Opsterland", "Sluis", "Stadskanaal", "Emmeloord",
	"Ooststellingwerf", "Beverwijk", "Hof van Twente", "Teylingen", "Wijchen",
	"Noordwijk", "Bloemendaal", "Weesp", "Nijkerk", "Montferland", "Medemblik",
	"Heiloo", "Geldrop-Mierlo", "Waadhoeke", "Drechterland", "Bodegraven-Reeuwijk",
	"Bunnik", "Oirschot", "Oude IJsselstreek", "Oudewater", "Pijnacker-Nootdorp",
	"Raalte", "Renkum", "Rheden", "Rhenen", "Roerdalen", "Staphorst", "Steenbergen",
	"Steenwijkerland", "Tynaarlo", "Tytsjerksteradiel", "Uden", "Uithoorn",
	"Urk", "Valkenburg aan de Geul", "Valkenswaard", "Veldhoven", "Venray",
	"Voerendaal", "Voorst", "Vught", "Waddinxveen", "Wassenaar", "Waterland",
	"Westerveld", "Westervoort", "Westland", "Wierden", "Wijdemeren", "Winterswijk",
	"Zevenaar", "Zoeterwoude", "Zuidplas", "Zundert", "Zwijndrecht", "Noardeast-Fryslân",
	"Vijfheerenlanden", "Molenlanden", "Het Hogeland", "Westerkwartier", "Midden-Groningen",
	"Dijk en Waard", "Maashorst", "Land van Cuijk", "Voorne aan Zee", "Altena",
	"Nissewaard", "Gooise Meren", "Krimpenerwaard", "De Fryske Marren", "De Wolden",
	"Dantumadiel", "Eemsdelta", "Meierijstad",
];
// Vul verder aan met fictieve varianten om op ~390 te komen.
while (GEMEENTES.length < 390) {
	GEMEENTES.push(`Gemeente ${GEMEENTES.length + 1}`);
}

function slugify(naam) {
	return naam
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

// ---- Magazijnen ----
const magazijnen = [
	...INSTANTIES.map((i) => ({ id: i.id, naam: i.naam, type: "instantie" })),
	...GEMEENTES.map((g) => ({
		id: "gem-" + slugify(g),
		naam: `Gemeente ${g}`,
		type: "gemeente",
	})),
];

// ---- Mappen (voorgevuld) ----
const mappen = [
	{ slug: "belastingen-2025", naam: "Belastingen 2025" },
	{ slug: "subsidies", naam: "Subsidies" },
];

// ---- Berichten ----
// Deterministic pseudo-random zodat de build reproduceerbaar is.
let seed = 42;
function rnd() {
	seed = (seed * 9301 + 49297) % 233280;
	return seed / 233280;
}
function pick(arr) {
	return arr[Math.floor(rnd() * arr.length)];
}

const ONDERWERPEN = {
	belastingdienst: [
		"Voorlopige aanslag inkomstenbelasting 2025",
		"Btw-aangifte eerste kwartaal beschikbaar",
		"Beschikking kleineondernemersregeling",
		"Vooraankondiging btw-controle",
		"Bevestiging aangifte omzetbelasting",
	],
	kvk: [
		"Bevestiging inschrijving handelsregister",
		"Wijziging bestuurder geregistreerd",
		"Herinnering jaarstukken deponeren",
		"Bevestiging uittreksel aangevraagd",
	],
	rvo: [
		"Subsidie SLIM toegekend",
		"Aanvraag MIT-regeling in behandeling",
		"Beschikking WBSO 2025",
		"Betaalspecificatie subsidie",
	],
	svb: ["Bevestiging AOW-aanvraag", "Wijziging uitkering doorgegeven"],
	uwv: ["Aanvraag WW verwerkt", "Loonheffingskorting gewijzigd"],
	rdw: ["Kenteken overgeschreven", "APK-herinnering bedrijfsauto"],
	cbs: ["Verzoek productie-enquête", "Herinnering statistiek-opgave"],
	ind: ["Besluit aanvraag kennismigrant"],
	ap: ["Melding datalek ontvangen"],
	kadaster: ["Inschrijving eigendomsoverdracht"],
	gemeente: [
		"Aanslag toeristenbelasting",
		"Aanslag reclamebelasting",
		"Vergunning evenement verleend",
		"Bevestiging melding openbare ruimte",
		"Aanslag onroerendezaakbelasting",
		"Besluit ontheffing venstertijden",
		"Besluit terrasvergunning",
		"Parkeervergunning verleend",
		"Handhavingsbesluit reclame-uiting",
		"Melding werkzaamheden openbare weg",
	],
};

function onderwerpVoor(mag) {
	if (mag.type === "gemeente") return pick(ONDERWERPEN.gemeente);
	return pick(ONDERWERPEN[mag.id] || ONDERWERPEN.gemeente);
}

function inhoudVoor(mag, onderwerp) {
	return [
		`Geachte ondernemer,`,
		`Dit bericht van ${mag.naam} betreft "${onderwerp}". De behandeling van dit bericht verloopt volgens de standaardprocedure van de betreffende organisatie.`,
		`Voor vragen over de inhoud kunt u contact opnemen via de bij ${mag.naam} bekende kanalen.`,
	].join("\n\n");
}

// Kies ~25 magazijnen die berichten leveren (mix instanties + gemeentes).
const leverendeMagazijnen = [
	...magazijnen.filter((m) => m.type === "instantie"),
	...magazijnen.filter((m) => m.type === "gemeente").slice(0, 15),
];

function datumVoorIndex(i) {
	// Spreid datums van ~6 maanden terug tot vandaag.
	const eind = new Date("2026-04-10");
	const dag = new Date(eind);
	dag.setDate(eind.getDate() - Math.floor((i / 120) * 180) - Math.floor(rnd() * 4));
	return dag.toISOString().slice(0, 10);
}

const berichten = [];
for (let i = 0; i < 120; i++) {
	const mag = pick(leverendeMagazijnen);
	const onderwerp = onderwerpVoor(mag);
	const isOngelezen = i < 12; // de eerste (nieuwste) 12 zijn ongelezen
	let map = null;
	if (mag.id === "belastingdienst" && rnd() < 0.7) map = "belastingen-2025";
	else if (mag.id === "rvo" && rnd() < 0.6) map = "subsidies";
	berichten.push({
		id: "msg-" + String(i + 1).padStart(4, "0"),
		magazijnId: mag.id,
		afzender: mag.naam,
		onderwerp,
		inhoud: inhoudVoor(mag, onderwerp),
		datum: datumVoorIndex(i),
		isOngelezen,
		map,
		heeftBijlage: rnd() < 0.4,
	});
}

// Sorteer op datum, nieuwste eerst.
berichten.sort((a, b) => (a.datum < b.datum ? 1 : -1));

module.exports = {
	magazijnen,
	berichten,
	mappen,
	aantalMagazijnen: magazijnen.length,
};
```

- [ ] **Stap 2: Verifieer dat data laadt bij build**

Run: `npm run build`
Expected: build-output toont ~120 berichten-pagina's (zie Task 7) en er zijn geen fouten. Controleer bovendien `_site/moza/berichtenbox/index.html` bestaat niet nog (die komt in Task 2).

- [ ] **Stap 3: Commit**

```bash
git add _data/berichtenboxData.js
git commit -m "➕ Data-generator voor FBS Berichtenbox (magazijnen, berichten, mappen)"
```

---

## Task 2: Sub-directory config en placeholders

**Files:**
- Create: `moza/berichtenbox/berichtenbox.json`

**Doel:** Per-directory frontmatter-defaults zodat alle pagina's onder `moza/berichtenbox/` automatisch de MOZa-layout en overheid-header/footer gebruiken.

- [ ] **Stap 1: Maak `moza/berichtenbox/berichtenbox.json`**

```json
{
	"layout": "base.njk",
	"bodyClass": "moza",
	"headerType": "overheid",
	"footerType": "overheid"
}
```

De `subNav` wordt geërfd uit `moza/moza.json` (die al het juiste menu definieert).

- [ ] **Stap 2: Commit**

```bash
git add moza/berichtenbox/berichtenbox.json
git commit -m "➕ Frontmatter-defaults voor berichtenbox sub-pagina's"
```

---

## Task 3: Lokale zijbalk-include voor Berichtenbox

**Files:**
- Create: `_includes/berichtenbox-side-nav.njk`

**Doel:** De lokale zijbalk (Inbox, Archief, Prullenbak, mappen-sectie) die op elke Berichtenbox-pagina getoond wordt. Mappen worden statisch gerenderd (uit `berichtenboxData.mappen`) — JS verbergt ze initieel tijdens eerste-bezoek-animatie (Task 11).

- [ ] **Stap 1: Maak `_includes/berichtenbox-side-nav.njk`**

```njk
{% set box = berichtenboxData %}
{% set path = page.url %}
<nav class="berichtenbox-nav" aria-label="Berichtenbox">
	<ul>
		<li>
			<a href="{{ '/moza/berichtenbox/' | url }}"{% if path == '/moza/berichtenbox/' %} aria-current="page"{% endif %}>
				Inbox
				<span class="berichtenbox-nav-count" data-berichtenbox-count="inbox">{{ box.berichten | length }}</span>
			</a>
		</li>
		<li>
			<a href="{{ '/moza/berichtenbox/archief/' | url }}"{% if path == '/moza/berichtenbox/archief/' %} aria-current="page"{% endif %}>
				Archief
				<span class="berichtenbox-nav-count" data-berichtenbox-count="archief">0</span>
			</a>
		</li>
		<li>
			<a href="{{ '/moza/berichtenbox/prullenbak/' | url }}"{% if path == '/moza/berichtenbox/prullenbak/' %} aria-current="page"{% endif %}>
				Prullenbak
				<span class="berichtenbox-nav-count" data-berichtenbox-count="prullenbak">0</span>
			</a>
		</li>
	</ul>
	<p class="berichtenbox-nav-mappen-kop" data-berichtenbox-mappen-kop hidden>Mappen</p>
	<ul class="berichtenbox-nav-mappen" data-berichtenbox-mappen hidden>
		{% for map in box.mappen %}
			<li data-map-slug="{{ map.slug }}">
				<a href="{{ '/moza/berichtenbox/?map=' | url }}{{ map.slug }}">
					{{ map.naam }}
					<span class="berichtenbox-nav-count" data-berichtenbox-count="map:{{ map.slug }}">0</span>
				</a>
			</li>
		{% endfor %}
	</ul>
</nav>
```

**Waarom `hidden` op mappen?** De spec stelt dat mappen pas na eerste ophalen verschijnen. JS (Task 11) verwijdert `hidden` zodra de voortgangsindicator klaar is. Op bezoeken ná het eerste bezoek verwijdert JS `hidden` meteen.

- [ ] **Stap 2: Commit**

```bash
git add _includes/berichtenbox-side-nav.njk
git commit -m "➕ Lokale zijbalk voor Berichtenbox"
```

---

## Task 4: Inbox-pagina (vervangt de "binnenkort beschikbaar"-placeholder)

**Files:**
- Modify: `moza/berichtenbox.html` (volledige vervanging)
- Create: `_includes/berichtenbox-row.njk`

**Doel:** Werkende inbox-pagina met teller, zoekveld, filter-knop (niet-functioneel in deze stap), berichtenlijst en paginering. Nog geen voortgangsindicator of mappen-filter — die komen in latere taken.

- [ ] **Stap 1: Maak `_includes/berichtenbox-row.njk`**

```njk
{# Verwacht: bericht (object uit berichtenboxData.berichten) #}
<li class="berichtenbox-rij{% if bericht.isOngelezen %} is-ongelezen{% endif %}" data-bericht-id="{{ bericht.id }}" data-afzender-id="{{ bericht.magazijnId }}"{% if bericht.map %} data-map="{{ bericht.map }}"{% endif %}>
	<a href="{{ '/moza/berichtenbox/bericht/' | url }}{{ bericht.id }}/">
		{% if bericht.isOngelezen %}<span><i class="visually-hidden">Ongelezen.</i></span> {% endif %}
		<span class="berichtenbox-rij-afzender">{{ bericht.afzender }}</span>
		<span class="berichtenbox-rij-onderwerp">{{ bericht.onderwerp }}</span>
		<span class="berichtenbox-rij-datum">{{ bericht.datum | datumNL }}</span>
		{% if bericht.heeftBijlage %}<span class="berichtenbox-rij-bijlage" aria-label="heeft bijlage">📎</span>{% endif %}
		{% if bericht.map %}<span class="berichtenbox-rij-maplabel" data-maplabel>{{ bericht.map }}</span>{% endif %}
	</a>
</li>
```

- [ ] **Stap 2: Voeg `datumNL` filter toe aan Eleventy config**

Modify `.eleventy.js` — voeg vóór de `return` toe:

```js
// Nederlandse datum-notatie: "19 februari 2026"
eleventyConfig.addFilter('datumNL', function(datumStr) {
	if (!datumStr) return '';
	const MAANDEN = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
	const d = new Date(datumStr);
	return d.getDate() + ' ' + MAANDEN[d.getMonth()] + ' ' + d.getFullYear();
});
```

- [ ] **Stap 3: Vervang `moza/berichtenbox.html`**

```njk
---
title: "MijnOverheid Zakelijk: Berichtenbox"
pagination:
  data: berichtenboxData.berichten
  size: 25
  alias: berichtenPagina
permalink: "/moza/berichtenbox/{% if pagination.pageNumber > 0 %}pagina-{{ pagination.pageNumber + 1 }}/{% endif %}"
---

{% include "side-nav-overheid.njk" %}

<article class="berichtenbox">
	<nav class="breadcrumb">
		<ol>
			<li><a href="{{ '/moza/' | url }}">Home</a></li>
			<li aria-current="page">Berichtenbox</li>
		</ol>
	</nav>

	<h1>Berichtenbox</h1>

	<div class="berichtenbox-layout">
		{% include "berichtenbox-side-nav.njk" %}

		<section class="berichtenbox-content">
			<p class="berichtenbox-teller">
				<span data-berichtenbox-teller-totaal>{{ berichtenboxData.berichten | length }}</span> berichten ·
				<span data-berichtenbox-teller-ongelezen>0</span> ongelezen
				<span class="berichtenbox-bronnen">opgehaald uit <span data-berichtenbox-bronnen>{{ berichtenboxData.aantalMagazijnen }}</span> bronnen</span>
			</p>

			<div class="berichtenbox-filters">
				<label class="berichtenbox-zoek">
					<span class="visually-hidden">Zoek in afzender of onderwerp</span>
					<input type="search" data-berichtenbox-zoek placeholder="Zoek in afzender of onderwerp" />
				</label>
				<details class="berichtenbox-filter-afzender">
					<summary>Afzender</summary>
					<div class="berichtenbox-filter-afzender-paneel" data-berichtenbox-afzender-paneel>
						{# Wordt gevuld door JS (Task 9) op basis van afzenders met berichten #}
					</div>
				</details>
			</div>

			<div class="berichtenbox-voortgang" data-berichtenbox-voortgang hidden role="status" aria-live="polite">
				Berichten ophalen…
				<span class="berichtenbox-voortgang-telling"><span data-berichtenbox-voortgang-bron>0</span> van <span data-berichtenbox-voortgang-totaal>{{ berichtenboxData.aantalMagazijnen }}</span> bronnen</span>
				<span class="berichtenbox-voortgang-berichten"><span data-berichtenbox-voortgang-gevonden>0</span> berichten gevonden</span>
				<div class="berichtenbox-voortgang-balk"><div class="berichtenbox-voortgang-balk-vulling" data-berichtenbox-voortgang-balk></div></div>
			</div>

			<ul class="berichtenbox-lijst" data-berichtenbox-lijst>
				{% for bericht in berichtenPagina %}
					{% include "berichtenbox-row.njk" %}
				{% endfor %}
			</ul>

			<div class="berichtenbox-leeg" data-berichtenbox-leeg hidden>
				Er zijn geen berichten die overeenkomen met uw zoekopdracht.
			</div>

			{% if pagination.pages.length > 1 %}
			<nav class="pagination" aria-label="Paginering">
				<ol>
					{% if pagination.previousPageHref %}
					<li><a href="{{ pagination.previousPageHref | url }}" rel="prev">Vorige<span class="visually-hidden"> pagina</span></a></li>
					{% endif %}
					{% for href in pagination.hrefs %}
					<li>
						{% if loop.index0 == pagination.pageNumber %}
							<span aria-current="page">{{ loop.index }}</span>
						{% else %}
							<a href="{{ href | url }}">{{ loop.index }}</a>
						{% endif %}
					</li>
					{% endfor %}
					{% if pagination.nextPageHref %}
					<li><a href="{{ pagination.nextPageHref | url }}" rel="next">Volgende<span class="visually-hidden"> pagina</span></a></li>
					{% endif %}
				</ol>
			</nav>
			{% endif %}
		</section>
	</div>

	{% include "berichtenbox-footer-link.njk" ignore missing %}
</article>
```

De eerste pagina krijgt URL `/moza/berichtenbox/`, volgende `/moza/berichtenbox/pagina-2/`, etc. — consistent met bestaand `/moza/berichten/pagina-2/` patroon.

- [ ] **Stap 4: Verifieer in browser**

Run: `npm run dev` (indien nog niet aan)
Open: `http://localhost:8080/moza/berichtenbox/`
Expected: de pagina toont breadcrumb "Home › Berichtenbox", h1, teller, zoekveld, lijst met 25 berichten (afzender, onderwerp, datum), paginering onderaan. Klikken op een bericht geeft een 404 (detail-pagina komt in Task 7). Zijbalk toont Inbox/Archief/Prullenbak; mappen-sectie is nog niet zichtbaar (JS komt later).

- [ ] **Stap 5: Commit**

```bash
git add moza/berichtenbox.html _includes/berichtenbox-row.njk .eleventy.js
git commit -m "➕ Inbox-pagina met lijst en paginering vervangt placeholder"
```

---

## Task 5: CSS voor de Berichtenbox

**Files:**
- Modify: `style/style.css` (nieuwe regels achteraan)

**Doel:** De inbox krijgt de MOZa-stijl: lokale zijbalk naast de content, lijst zonder inline acties, ongelezen-markering (stip + vet), teller, voortgangsindicator, responsive gedrag.

- [ ] **Stap 1: Bekijk bestaande tokens en patronen**

Lees `style/_toepassing.css` (tokens) en de bestaande `.card` / `.list-content-links`-regels in `style/style.css` om te zien welke tokens beschikbaar zijn.

- [ ] **Stap 2: Voeg CSS toe achteraan `style/style.css`**

```css
/* ==========================================================================
   Berichtenbox — FBS
   ========================================================================== */

.berichtenbox-layout {
	display: grid;
	grid-template-columns: minmax(14rem, 16rem) 1fr;
	gap: var(--toepassing-ruimte-groot, 2rem);
	margin-block-start: var(--toepassing-ruimte-groot, 2rem);
}

@media (max-width: 48em) {
	.berichtenbox-layout { grid-template-columns: 1fr; }
}

/* Lokale zijbalk */
.berichtenbox-nav ul {
	list-style: none;
	padding-inline-start: 0;
	margin-block: 0;
}
.berichtenbox-nav li {
	margin-block-end: 0.25rem;
}
.berichtenbox-nav a {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding-block: 0.5rem;
	padding-inline: 0.75rem;
	border-radius: var(--toepassing-rand-radius, 0.25rem);
	text-decoration: none;
	color: var(--toepassing-tekst-kleur, inherit);
}
.berichtenbox-nav a:hover,
.berichtenbox-nav a:focus-visible {
	background: var(--toepassing-oppervlak-hover, rgba(0,0,0,0.04));
}
.berichtenbox-nav a[aria-current="page"] {
	background: var(--toepassing-oppervlak-selectie, rgba(0,0,50,0.08));
	font-weight: 600;
}
.berichtenbox-nav-count {
	font-variant-numeric: tabular-nums;
	color: var(--toepassing-tekst-kleur-rustig, #555);
	font-size: 0.9em;
}
.berichtenbox-nav-mappen-kop {
	font-size: 0.9em;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--toepassing-tekst-kleur-rustig, #555);
	margin-block-start: 1.5rem;
	padding-inline: 0.75rem;
}

/* Teller */
.berichtenbox-teller {
	margin-block: 0 1rem;
	font-size: 1.1em;
}
.berichtenbox-bronnen {
	display: block;
	font-size: 0.85em;
	color: var(--toepassing-tekst-kleur-rustig, #666);
	margin-block-start: 0.25rem;
}

/* Filters */
.berichtenbox-filters {
	display: flex;
	gap: 1rem;
	align-items: center;
	margin-block-end: 1rem;
	flex-wrap: wrap;
}
.berichtenbox-zoek { flex: 1 1 15rem; }
.berichtenbox-zoek input {
	inline-size: 100%;
	padding-block: 0.5rem;
	padding-inline: 0.75rem;
	border: 1px solid var(--toepassing-rand-kleur, #888);
	border-radius: var(--toepassing-rand-radius, 0.25rem);
}

/* Voortgangsindicator */
.berichtenbox-voortgang {
	padding: 1.5rem;
	border: 1px dashed var(--toepassing-rand-kleur, #888);
	border-radius: var(--toepassing-rand-radius, 0.25rem);
	text-align: center;
}
.berichtenbox-voortgang-telling,
.berichtenbox-voortgang-berichten {
	display: block;
	font-size: 0.9em;
	color: var(--toepassing-tekst-kleur-rustig, #555);
	margin-block-start: 0.25rem;
}
.berichtenbox-voortgang-balk {
	block-size: 0.5rem;
	background: var(--toepassing-oppervlak-hover, #eee);
	border-radius: 1rem;
	margin-block-start: 0.75rem;
	overflow: hidden;
}
.berichtenbox-voortgang-balk-vulling {
	block-size: 100%;
	inline-size: 0%;
	background: var(--toepassing-accent-kleur, #0b71ca);
	transition: inline-size 0.2s linear;
}

/* Lijst */
.berichtenbox-lijst {
	list-style: none;
	padding-inline-start: 0;
	margin-block: 0;
	border-block-start: 1px solid var(--toepassing-rand-kleur-rustig, #e0e0e0);
}
.berichtenbox-rij {
	border-block-end: 1px solid var(--toepassing-rand-kleur-rustig, #e0e0e0);
}
.berichtenbox-rij a {
	display: grid;
	grid-template-columns: auto 1fr auto auto;
	gap: 0.5rem 1rem;
	align-items: baseline;
	padding-block: 0.75rem;
	padding-inline: 0.5rem;
	text-decoration: none;
	color: var(--toepassing-tekst-kleur, inherit);
}
.berichtenbox-rij a:hover,
.berichtenbox-rij a:focus-visible {
	background: var(--toepassing-oppervlak-hover, rgba(0,0,0,0.03));
}
.berichtenbox-rij-afzender {
	min-inline-size: 10rem;
	font-weight: 500;
}
.berichtenbox-rij-onderwerp { color: inherit; }
.berichtenbox-rij-datum {
	font-variant-numeric: tabular-nums;
	color: var(--toepassing-tekst-kleur-rustig, #555);
	font-size: 0.9em;
	white-space: nowrap;
}
.berichtenbox-rij-bijlage,
.berichtenbox-rij-maplabel {
	font-size: 0.85em;
	color: var(--toepassing-tekst-kleur-rustig, #555);
}
.berichtenbox-rij-maplabel {
	background: var(--toepassing-oppervlak-selectie, rgba(0,0,50,0.06));
	padding-inline: 0.5rem;
	padding-block: 0.1rem;
	border-radius: 1rem;
}

/* Ongelezen */
.berichtenbox-rij.is-ongelezen .berichtenbox-rij-afzender,
.berichtenbox-rij.is-ongelezen .berichtenbox-rij-onderwerp {
	font-weight: 700;
}
.berichtenbox-rij.is-ongelezen::before {
	content: "";
	display: inline-block;
	inline-size: 0.5rem;
	block-size: 0.5rem;
	background: var(--toepassing-accent-kleur, #0b71ca);
	border-radius: 50%;
	position: relative;
	inset-inline-start: 0.25rem;
	inset-block-start: 1rem;
}

/* Nieuwe-binnenkomer animatie */
@media (prefers-reduced-motion: no-preference) {
	.berichtenbox-rij.is-nieuw-binnen {
		animation: berichtenbox-fade-in 0.4s ease-out;
	}
}
@keyframes berichtenbox-fade-in {
	from { opacity: 0; transform: translateY(-0.5rem); }
	to   { opacity: 1; transform: translateY(0); }
}

/* Lege staat */
.berichtenbox-leeg {
	padding: 2rem;
	text-align: center;
	color: var(--toepassing-tekst-kleur-rustig, #555);
}

/* Detail-pagina */
.berichtenbox-detail-meta {
	color: var(--toepassing-tekst-kleur-rustig, #555);
	margin-block-end: 1rem;
}
.berichtenbox-detail-acties {
	display: flex;
	gap: 1rem;
	align-items: center;
	flex-wrap: wrap;
	margin-block: 1rem;
}
.berichtenbox-bijlagen {
	margin-block-start: 2rem;
	padding-block-start: 1rem;
	border-block-start: 1px solid var(--toepassing-rand-kleur-rustig, #e0e0e0);
}
.berichtenbox-bijlagen-laden {
	color: var(--toepassing-tekst-kleur-rustig, #555);
	font-style: italic;
}

/* Demo-footer-link */
.berichtenbox-demo-reset {
	margin-block-start: 3rem;
	padding-block-start: 1rem;
	border-block-start: 1px solid var(--toepassing-rand-kleur-rustig, #e0e0e0);
	font-size: 0.85em;
	color: var(--toepassing-tekst-kleur-rustig, #666);
	text-align: center;
}
```

**Let op over tokens:** de fallback-waarden (bijv. `#555`) zijn voor als het toepassingstoken niet bestaat. Controleer tijdens verificatie of ze vervangen worden door échte tokens; pas in dat geval de custom-property-namen aan naar wat er daadwerkelijk bestaat in `_toepassing.css`.

- [ ] **Stap 3: Verifieer in browser**

Herlaad `http://localhost:8080/moza/berichtenbox/`.
Expected: lokale zijbalk links, content rechts, lijst is netjes opgemaakt met kolommen (afzender · onderwerp · datum), ongelezen-berichten vet met stip links, hover-effect, paginering onderaan. Op mobile (DevTools) klapt de zijbalk boven de content.

- [ ] **Stap 4: Commit**

```bash
git add style/style.css
git commit -m "💄 Styling voor Berichtenbox-inbox en zijbalk"
```

---

## Task 6: Archief- en Prullenbak-pagina

**Files:**
- Create: `moza/berichtenbox/archief.html`
- Create: `moza/berichtenbox/prullenbak.html`

**Doel:** Twee pagina's met dezelfde layout als de inbox, maar initieel zonder berichten. JS vult ze later op basis van `localStorage`-state.

- [ ] **Stap 1: Maak `moza/berichtenbox/archief.html`**

```njk
---
title: "MijnOverheid Zakelijk: Berichtenbox — Archief"
---

{% include "side-nav-overheid.njk" %}

<article class="berichtenbox">
	<nav class="breadcrumb">
		<ol>
			<li><a href="{{ '/moza/' | url }}">Home</a></li>
			<li><a href="{{ '/moza/berichtenbox/' | url }}">Berichtenbox</a></li>
			<li aria-current="page">Archief</li>
		</ol>
	</nav>

	<h1>Archief</h1>

	<div class="berichtenbox-layout">
		{% include "berichtenbox-side-nav.njk" %}

		<section class="berichtenbox-content">
			<p class="berichtenbox-teller">
				<span data-berichtenbox-teller-totaal>0</span> gearchiveerde berichten
			</p>
			<ul class="berichtenbox-lijst" data-berichtenbox-lijst data-berichtenbox-view="archief">
				{# Wordt gevuld door JS op basis van localStorage #}
			</ul>
			<div class="berichtenbox-leeg" data-berichtenbox-leeg>
				U heeft nog geen berichten gearchiveerd.
			</div>
		</section>
	</div>

	{% include "berichtenbox-footer-link.njk" ignore missing %}
</article>
```

- [ ] **Stap 2: Maak `moza/berichtenbox/prullenbak.html`**

```njk
---
title: "MijnOverheid Zakelijk: Berichtenbox — Prullenbak"
---

{% include "side-nav-overheid.njk" %}

<article class="berichtenbox">
	<nav class="breadcrumb">
		<ol>
			<li><a href="{{ '/moza/' | url }}">Home</a></li>
			<li><a href="{{ '/moza/berichtenbox/' | url }}">Berichtenbox</a></li>
			<li aria-current="page">Prullenbak</li>
		</ol>
	</nav>

	<h1>Prullenbak</h1>

	<div class="berichtenbox-layout">
		{% include "berichtenbox-side-nav.njk" %}

		<section class="berichtenbox-content">
			<p class="berichtenbox-teller">
				<span data-berichtenbox-teller-totaal>0</span> verwijderde berichten
			</p>
			<ul class="berichtenbox-lijst" data-berichtenbox-lijst data-berichtenbox-view="prullenbak">
				{# Wordt gevuld door JS op basis van localStorage #}
			</ul>
			<div class="berichtenbox-leeg" data-berichtenbox-leeg>
				Uw prullenbak is leeg.
			</div>
		</section>
	</div>

	{% include "berichtenbox-footer-link.njk" ignore missing %}
</article>
```

- [ ] **Stap 3: Verifieer in browser**

Open `http://localhost:8080/moza/berichtenbox/archief/` en `/prullenbak/`.
Expected: elke pagina toont breadcrumb, heading, zijbalk met Inbox/Archief/Prullenbak waarvan de juiste `aria-current="page"` heeft, en de lege-staat-tekst.

- [ ] **Stap 4: Commit**

```bash
git add moza/berichtenbox/archief.html moza/berichtenbox/prullenbak.html
git commit -m "➕ Archief- en Prullenbak-pagina voor Berichtenbox"
```

---

## Task 7: Detail-pagina per bericht

**Files:**
- Create: `moza/berichtenbox/bericht.njk`

**Doel:** Één detail-pagina per bericht via Eleventy-pagination over `berichtenboxData.berichten`. Toont onderwerp, metadata, inhoud, actieknoppen, en een bijlage-sectie die later async gevuld wordt.

- [ ] **Stap 1: Maak `moza/berichtenbox/bericht.njk`**

```njk
---
pagination:
  data: berichtenboxData.berichten
  size: 1
  alias: bericht
permalink: "/moza/berichtenbox/bericht/{{ bericht.id }}/"
eleventyComputed:
  title: "MijnOverheid Zakelijk: {{ bericht.onderwerp }}"
---

{% include "side-nav-overheid.njk" %}

<article class="berichtenbox">
	<nav class="breadcrumb">
		<ol>
			<li><a href="{{ '/moza/' | url }}">Home</a></li>
			<li><a href="{{ '/moza/berichtenbox/' | url }}">Berichtenbox</a></li>
			<li aria-current="page">{{ bericht.onderwerp }}</li>
		</ol>
	</nav>

	<div class="berichtenbox-layout">
		{% include "berichtenbox-side-nav.njk" %}

		<section class="berichtenbox-content" data-bericht-id="{{ bericht.id }}" data-afzender-id="{{ bericht.magazijnId }}" data-afzender-naam="{{ bericht.afzender }}"{% if bericht.heeftBijlage %} data-heeft-bijlage="true"{% endif %}>
			<h1>{{ bericht.onderwerp }}</h1>

			<p class="berichtenbox-detail-meta">
				{{ bericht.afzender }} · {{ bericht.datum | datumNL }}
				{% if bericht.map %}· <span data-maplabel>{{ bericht.map }}</span>{% endif %}
			</p>

			<div class="berichtenbox-detail-acties">
				<button type="button" class="button" data-actie="archiveren">Archiveren</button>
				<button type="button" class="button button-secondary" data-actie="verplaatsen">Verplaatsen naar map…</button>
				<button type="button" class="link-button" data-actie="markeer-ongelezen">Markeer als ongelezen</button>
				<button type="button" class="link-button" data-actie="verwijderen">Verwijderen</button>
			</div>

			<div class="berichtenbox-detail-inhoud">
				{% for alinea in bericht.inhoud.split('\n\n') %}
				<p>{{ alinea }}</p>
				{% endfor %}
			</div>

			{% if bericht.heeftBijlage %}
			<section class="berichtenbox-bijlagen" data-berichtenbox-bijlagen>
				<h2>Bijlagen</h2>
				<p class="berichtenbox-bijlagen-laden" data-berichtenbox-bijlagen-laden>Bijlagen ophalen bij {{ bericht.afzender }}…</p>
				<ul class="berichtenbox-bijlagen-lijst" data-berichtenbox-bijlagen-lijst hidden>
					{# Wordt gevuld door JS na ±1,5s (Task 12) #}
				</ul>
			</section>
			{% endif %}
		</section>
	</div>

	{% include "berichtenbox-footer-link.njk" ignore missing %}
</article>
```

**Let op:** `bericht.inhoud.split('\n\n')` werkt in Nunjucks via de ingebouwde split-methode op strings.

- [ ] **Stap 2: Verifieer in browser**

Open `http://localhost:8080/moza/berichtenbox/` en klik op het eerste bericht.
Expected: URL wordt iets als `/moza/berichtenbox/bericht/msg-0120/` (id kan variëren), pagina toont breadcrumb, h1 = onderwerp, meta-regel met afzender en datum, vier actieknoppen (werken nog niet), bericht-inhoud in twee à drie alinea's, bijlage-sectie toont "Bijlagen ophalen bij {afzender}…" indien het bericht een bijlage heeft.

- [ ] **Stap 3: Commit**

```bash
git add moza/berichtenbox/bericht.njk
git commit -m "➕ Detail-pagina per bericht"
```

---

## Task 8: JavaScript-skeleton en state-laag

**Files:**
- Create: `assets/javascript/berichtenbox.js`
- Modify: `_includes/base.njk` (script-tag toevoegen)

**Doel:** Alleen de state-laag werkend maken: `localStorage` lezen/schrijven, initiële status toepassen op lijst (verberg gearchiveerde/verwijderde berichten in Inbox, toon ze in Archief/Prullenbak, zet gelezen-status). Acties komen in Task 9.

- [ ] **Stap 1: Maak `assets/javascript/berichtenbox.js`**

```js
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

	const wrapper = document.querySelector('.berichtenbox');
	if (!wrapper) return; // niet op een berichtenbox-pagina

	const LS_KEY = "berichtenbox";

	const defaultState = {
		eersteBezoekGehad: false,
		gelezen: {},        // { [berichtId]: true }
		ongelezenToegevoegd: {}, // { [berichtId]: true } — "markeer als ongelezen" op oorspronkelijk gelezen
		gearchiveerd: {},   // { [berichtId]: true }
		verwijderd: {},     // { [berichtId]: true }
		mapOverride: {},    // { [berichtId]: mapSlug | null }
		eigenMappen: [],    // [{ slug, naam }]
		nieuweBerichten: [], // berichten die via polling zijn toegevoegd (full objects)
	};

	function readState() {
		try {
			const raw = localStorage.getItem(LS_KEY);
			if (!raw) return { ...defaultState };
			return { ...defaultState, ...JSON.parse(raw) };
		} catch (e) {
			return { ...defaultState };
		}
	}

	function writeState(state) {
		localStorage.setItem(LS_KEY, JSON.stringify(state));
	}

	const state = readState();

	/**
	 * Bepaalt de effectieve status van één bericht.
	 * Retourneert: "inbox" | "archief" | "prullenbak"
	 */
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

	/**
	 * Bepaalt welke view de huidige pagina toont.
	 * Gebruikt een data-attribuut op de lijst, of valt terug op URL-pad.
	 */
	function huidigeView() {
		const lijst = document.querySelector('[data-berichtenbox-lijst]');
		const attr = lijst ? lijst.dataset.berichtenboxView : null;
		if (attr) return attr;
		const path = location.pathname;
		if (path.includes('/archief/')) return 'archief';
		if (path.includes('/prullenbak/')) return 'prullenbak';
		return 'inbox';
	}

	/**
	 * Past de status van alle statisch-gerenderde rijen toe.
	 * Op de Inbox: verbergt rijen die gearchiveerd/verwijderd zijn.
	 */
	function pasStateToeOpRijen() {
		const view = huidigeView();
		const rijen = document.querySelectorAll('.berichtenbox-rij');
		rijen.forEach((rij) => {
			const id = rij.dataset.berichtId;
			const status = statusVan(id);
			if (view === 'inbox') {
				rij.hidden = status !== 'inbox';
				// Pas ongelezen-klasse aan
				const origineel = rij.classList.contains('is-ongelezen');
				const nu = isOngelezen(id, origineel);
				rij.classList.toggle('is-ongelezen', nu);
			} else {
				rij.hidden = true; // alle statische rijen verbergen op andere views
			}
		});
	}

	/**
	 * Vult Archief / Prullenbak door clones van inbox-rijen te tonen.
	 * Simpel en robuust: we genereren HTML uit de window-data.
	 */
	function render(view) {
		// Voor deze eerste stap alleen het totaal-aantal tellen.
		const tellerTotaal = document.querySelector('[data-berichtenbox-teller-totaal]');
		const data = window.berichtenboxData || { berichten: [] };
		let getoond = 0;
		if (view === 'inbox') {
			getoond = data.berichten.filter((b) => statusVan(b.id) === 'inbox').length
				+ state.nieuweBerichten.filter((b) => statusVan(b.id) === 'inbox').length;
		} else if (view === 'archief') {
			getoond = Object.keys(state.gearchiveerd).length;
		} else if (view === 'prullenbak') {
			getoond = Object.keys(state.verwijderd).length;
		}
		if (tellerTotaal) tellerTotaal.textContent = getoond;

		// Update ongelezen-teller in inbox
		const tellerOngelezen = document.querySelector('[data-berichtenbox-teller-ongelezen]');
		if (tellerOngelezen) {
			const n = data.berichten.filter((b) =>
				statusVan(b.id) === 'inbox' && isOngelezen(b.id, b.isOngelezen)
			).length;
			tellerOngelezen.textContent = n;
		}

		// Update nav-tellers in de zijbalk
		const navInbox = document.querySelector('[data-berichtenbox-count="inbox"]');
		if (navInbox) {
			navInbox.textContent = data.berichten.filter((b) => statusVan(b.id) === 'inbox').length;
		}
		const navArchief = document.querySelector('[data-berichtenbox-count="archief"]');
		if (navArchief) navArchief.textContent = Object.keys(state.gearchiveerd).length;
		const navPrullenbak = document.querySelector('[data-berichtenbox-count="prullenbak"]');
		if (navPrullenbak) navPrullenbak.textContent = Object.keys(state.verwijderd).length;
	}

	// Initialisatie
	pasStateToeOpRijen();
	render(huidigeView());

	// Exporteer voor latere taken via een global namespace
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
```

- [ ] **Stap 2: Embed de data in elke berichtenbox-pagina**

Modify `_includes/berichtenbox-side-nav.njk` — voeg bovenaan toe (zodat data beschikbaar is voordat `berichtenbox.js` draait):

```njk
{% set box = berichtenboxData %}
<script>
	window.berichtenboxData = {
		berichten: {{ box.berichten | dump | safe }},
		magazijnen: {{ box.magazijnen | dump | safe }},
		mappen: {{ box.mappen | dump | safe }},
		aantalMagazijnen: {{ box.aantalMagazijnen }}
	};
</script>
```

Plaats het `<script>`-blok boven de `<nav class="berichtenbox-nav">`. De Nunjucks `dump`-filter serialiseert naar JSON.

- [ ] **Stap 3: Voeg script-tag toe in `_includes/base.njk`**

Modify — voeg onderaan in het bestaande `<body>`, na de andere scripts:

```html
<script src="{{ '/assets/javascript/berichtenbox.js' | url }}"></script>
```

- [ ] **Stap 4: Verifieer in browser**

Herlaad `http://localhost:8080/moza/berichtenbox/`.
Expected: de teller "X berichten · Y ongelezen" toont de juiste aantallen (Y zou 12 moeten zijn, Task 1 zet de eerste 12 als ongelezen). Geen console-fouten. Op Archief en Prullenbak pagina's toont de teller 0. Zijbalk-tellers kloppen.

- [ ] **Stap 5: Commit**

```bash
git add assets/javascript/berichtenbox.js _includes/berichtenbox-side-nav.njk _includes/base.njk
git commit -m "➕ State-laag voor Berichtenbox (localStorage + lezen/archief/prullenbak)"
```

---

## Task 9: Acties op detail-pagina

**Files:**
- Modify: `assets/javascript/berichtenbox.js`

**Doel:** De vier actieknoppen op de detail-pagina werkend maken: archiveren, verwijderen, verplaatsen naar map, markeer als ongelezen. Plus: bij het openen van een bericht wordt het automatisch gemarkeerd als gelezen.

- [ ] **Stap 1: Voeg actie-handlers toe**

Voeg achter de `render`-functie en vóór de initialisatie-blok toe in `berichtenbox.js`:

```js
	function opslaan() {
		writeState(state);
	}

	/**
	 * Verplaats-naar-map-dialoog: toont een klein inline-paneel met
	 * bestaande mappen + optie "Nieuwe map aanmaken".
	 */
	function toonVerplaatsPaneel(berichtId, knop) {
		const bestaand = document.querySelector('.berichtenbox-verplaats-paneel');
		if (bestaand) { bestaand.remove(); return; }

		const data = window.berichtenboxData;
		const alleMappen = [
			...data.mappen,
			...state.eigenMappen,
		];

		const paneel = document.createElement('div');
		paneel.className = 'berichtenbox-verplaats-paneel';
		paneel.innerHTML = '<p>Kies een map:</p><ul></ul><p><label>Nieuwe map: <input type="text" data-nieuwe-map-input /></label> <button type="button" class="link-button" data-nieuwe-map-bevestig>Aanmaken</button></p>';
		const ul = paneel.querySelector('ul');
		alleMappen.forEach((m) => {
			const li = document.createElement('li');
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'link-button';
			btn.textContent = m.naam;
			btn.addEventListener('click', () => {
				state.mapOverride[berichtId] = m.slug;
				opslaan();
				paneel.remove();
				render(huidigeView());
				updateMapLabelDetail(m.slug);
			});
			li.appendChild(btn);
			ul.appendChild(li);
		});
		// Optie: uit map halen
		if (state.mapOverride[berichtId]) {
			const li = document.createElement('li');
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'link-button';
			btn.textContent = 'Uit map halen';
			btn.addEventListener('click', () => {
				state.mapOverride[berichtId] = null;
				opslaan();
				paneel.remove();
				render(huidigeView());
				updateMapLabelDetail(null);
			});
			li.appendChild(btn);
			ul.appendChild(li);
		}
		paneel.querySelector('[data-nieuwe-map-bevestig]').addEventListener('click', () => {
			const input = paneel.querySelector('[data-nieuwe-map-input]');
			const naam = input.value.trim();
			if (!naam) return;
			const slug = naam.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
			if (!slug) return;
			if (!state.eigenMappen.some((m) => m.slug === slug)) {
				state.eigenMappen.push({ slug, naam });
			}
			state.mapOverride[berichtId] = slug;
			opslaan();
			paneel.remove();
			render(huidigeView());
			updateMapLabelDetail(slug);
			// Voeg nieuwe map toe aan zijbalk
			voegMapToeAanZijbalk({ slug, naam });
		});
		knop.parentNode.insertBefore(paneel, knop.nextSibling);
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
		const lijst = document.querySelector('[data-berichtenbox-mappen]');
		if (!lijst) return;
		if (lijst.querySelector(`[data-map-slug="${map.slug}"]`)) return;
		const li = document.createElement('li');
		li.dataset.mapSlug = map.slug;
		li.innerHTML = `<a href="/moza/berichtenbox/?map=${map.slug}">${map.naam} <span class="berichtenbox-nav-count" data-berichtenbox-count="map:${map.slug}">0</span></a>`;
		lijst.appendChild(li);
	}

	function bindDetailPaginaActies() {
		const content = document.querySelector('[data-bericht-id]');
		if (!content || !content.matches('.berichtenbox-content')) return;
		const berichtId = content.dataset.berichtId;

		// Markeer als gelezen bij openen
		delete state.ongelezenToegevoegd[berichtId];
		state.gelezen[berichtId] = true;
		opslaan();

		content.querySelectorAll('[data-actie]').forEach((btn) => {
			btn.addEventListener('click', () => {
				const actie = btn.dataset.actie;
				if (actie === 'archiveren') {
					state.gearchiveerd[berichtId] = true;
					delete state.verwijderd[berichtId];
					opslaan();
					location.href = '/moza/berichtenbox/';
				} else if (actie === 'verwijderen') {
					state.verwijderd[berichtId] = true;
					delete state.gearchiveerd[berichtId];
					opslaan();
					location.href = '/moza/berichtenbox/';
				} else if (actie === 'markeer-ongelezen') {
					state.ongelezenToegevoegd[berichtId] = true;
					delete state.gelezen[berichtId];
					opslaan();
					location.href = '/moza/berichtenbox/';
				} else if (actie === 'verplaatsen') {
					toonVerplaatsPaneel(berichtId, btn);
				}
			});
		});
	}

	bindDetailPaginaActies();
```

- [ ] **Stap 2: Voeg ook CSS toe voor het verplaats-paneel**

In `style/style.css` achteraan:

```css
.berichtenbox-verplaats-paneel {
	margin-block: 1rem;
	padding: 1rem;
	border: 1px solid var(--toepassing-rand-kleur, #888);
	border-radius: var(--toepassing-rand-radius, 0.25rem);
	background: var(--toepassing-oppervlak, #fafafa);
}
.berichtenbox-verplaats-paneel ul {
	list-style: none;
	padding-inline-start: 0;
	margin-block: 0.5rem;
}
```

- [ ] **Stap 3: Verifieer in browser**

1. Open een bericht. Teller "ongelezen" zou met 1 moeten dalen zodra je op Inbox terug bent.
2. Klik "Archiveren" → redirect naar Inbox, bericht is weg uit Inbox, Archief-teller staat op 1.
3. Open een ander bericht, klik "Verwijderen" → redirect, Prullenbak-teller op 1.
4. Open een derde bericht, klik "Verplaatsen naar map…" → paneel opent met 2 mappen + input, kies "Belastingen 2025" → meta-regel toont de map.
5. Open een bericht, klik "Markeer als ongelezen" → redirect, Inbox toont het bericht weer als ongelezen (vet + stip).

- [ ] **Stap 4: Commit**

```bash
git add assets/javascript/berichtenbox.js style/style.css
git commit -m "➕ Acties op detail-pagina (archiveren/verwijderen/verplaatsen/markeer ongelezen)"
```

---

## Task 10: Rendering van Archief, Prullenbak en map-filter; zoeken en afzender-filter

**Files:**
- Modify: `assets/javascript/berichtenbox.js`

**Doel:** Archief en Prullenbak dynamisch vullen. Inbox filteren op zoekterm, afzender-filter, en `?map=`-query-parameter. Lege staat tonen wanneer er niets matcht.

- [ ] **Stap 1: Voeg rendering van Archief/Prullenbak-lijsten toe**

Voeg vóór de init-blok toe in `berichtenbox.js`:

```js
	function rijHTML(bericht) {
		const ongelezen = isOngelezen(bericht.id, bericht.isOngelezen);
		const map = mapVan(bericht.id, bericht.map);
		const NL = (() => {
			const M = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
			const d = new Date(bericht.datum);
			return d.getDate() + ' ' + M[d.getMonth()] + ' ' + d.getFullYear();
		})();
		return `<li class="berichtenbox-rij${ongelezen ? ' is-ongelezen' : ''}" data-bericht-id="${bericht.id}" data-afzender-id="${bericht.magazijnId}"${map ? ` data-map="${map}"` : ''}>
			<a href="/moza/berichtenbox/bericht/${bericht.id}/">
				${ongelezen ? '<span><i class="visually-hidden">Ongelezen.</i></span> ' : ''}
				<span class="berichtenbox-rij-afzender">${bericht.afzender}</span>
				<span class="berichtenbox-rij-onderwerp">${bericht.onderwerp}</span>
				<span class="berichtenbox-rij-datum">${NL}</span>
				${bericht.heeftBijlage ? '<span class="berichtenbox-rij-bijlage" aria-label="heeft bijlage">📎</span>' : ''}
				${map ? `<span class="berichtenbox-rij-maplabel" data-maplabel>${map}</span>` : ''}
			</a>
		</li>`;
	}

	function renderLijstVoorView(view) {
		const lijst = document.querySelector('[data-berichtenbox-lijst]');
		const leeg = document.querySelector('[data-berichtenbox-leeg]');
		if (!lijst) return;
		const data = window.berichtenboxData;
		let items = [];
		if (view === 'archief') {
			items = data.berichten.filter((b) => state.gearchiveerd[b.id]);
		} else if (view === 'prullenbak') {
			items = data.berichten.filter((b) => state.verwijderd[b.id]);
		}
		if (view === 'archief' || view === 'prullenbak') {
			lijst.innerHTML = items.map(rijHTML).join('');
			if (leeg) leeg.hidden = items.length > 0;
		}
	}
```

- [ ] **Stap 2: Roep `renderLijstVoorView` aan in de init**

Vervang in `berichtenbox.js` het huidige eind van de IIFE:

```js
	// Initialisatie
	pasStateToeOpRijen();
	renderLijstVoorView(huidigeView());
	render(huidigeView());
	bindDetailPaginaActies();
	bindInboxFilters();
```

- [ ] **Stap 3: Voeg zoek-, afzender- en map-filter toe (Inbox)**

Voeg toe vóór de init-blok:

```js
	function bindInboxFilters() {
		if (huidigeView() !== 'inbox') return;
		const lijst = document.querySelector('[data-berichtenbox-lijst]');
		if (!lijst) return;

		const zoekInput = document.querySelector('[data-berichtenbox-zoek]');
		const afzenderPaneel = document.querySelector('[data-berichtenbox-afzender-paneel]');

		// Vul afzender-filterpaneel met unieke afzenders uit data
		if (afzenderPaneel) {
			const data = window.berichtenboxData;
			const uniek = new Map();
			data.berichten.forEach((b) => uniek.set(b.magazijnId, b.afzender));
			afzenderPaneel.innerHTML = '';
			[...uniek.entries()]
				.sort((a, b) => a[1].localeCompare(b[1]))
				.forEach(([id, naam]) => {
					const label = document.createElement('label');
					label.innerHTML = `<input type="checkbox" value="${id}" data-afzender-check /> ${naam}`;
					afzenderPaneel.appendChild(label);
				});
		}

		function mapUitUrl() {
			const params = new URLSearchParams(location.search);
			return params.get('map');
		}

		function pasFilterToe() {
			const zoek = (zoekInput ? zoekInput.value : '').trim().toLowerCase();
			const gekozenAfzenders = new Set(
				[...document.querySelectorAll('[data-afzender-check]:checked')].map((c) => c.value)
			);
			const mapFilter = mapUitUrl();
			let zichtbaar = 0;
			document.querySelectorAll('.berichtenbox-rij').forEach((rij) => {
				if (statusVan(rij.dataset.berichtId) !== 'inbox') {
					rij.hidden = true;
					return;
				}
				let match = true;
				if (zoek) {
					const tekst = (rij.querySelector('.berichtenbox-rij-afzender').textContent + ' ' + rij.querySelector('.berichtenbox-rij-onderwerp').textContent).toLowerCase();
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
				if (match) zichtbaar++;
			});
			const leeg = document.querySelector('[data-berichtenbox-leeg]');
			if (leeg) leeg.hidden = zichtbaar > 0;
		}

		if (zoekInput) zoekInput.addEventListener('input', pasFilterToe);
		if (afzenderPaneel) afzenderPaneel.addEventListener('change', pasFilterToe);

		// Als er een map-filter actief is, toon dat visueel in de kop
		const mapFilter = mapUitUrl();
		if (mapFilter) {
			const data = window.berichtenboxData;
			const mapObj = [...data.mappen, ...state.eigenMappen].find((m) => m.slug === mapFilter);
			if (mapObj) {
				const kop = document.querySelector('.berichtenbox h1');
				if (kop) kop.textContent = `Berichtenbox — ${mapObj.naam}`;
			}
		}
		pasFilterToe();
	}
```

- [ ] **Stap 4: Update map-tellers in `render()`**

Vervang de sectie in `render()` die nav-tellers update door:

```js
		// Update nav-tellers in de zijbalk
		const navInbox = document.querySelector('[data-berichtenbox-count="inbox"]');
		if (navInbox) {
			navInbox.textContent = data.berichten.filter((b) => statusVan(b.id) === 'inbox').length;
		}
		const navArchief = document.querySelector('[data-berichtenbox-count="archief"]');
		if (navArchief) navArchief.textContent = Object.keys(state.gearchiveerd).length;
		const navPrullenbak = document.querySelector('[data-berichtenbox-count="prullenbak"]');
		if (navPrullenbak) navPrullenbak.textContent = Object.keys(state.verwijderd).length;

		// Map-tellers: tel berichten in inbox per map
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
```

- [ ] **Stap 5: Verifieer in browser**

1. Inbox: typ "belasting" in zoekveld → alleen matching rijen blijven.
2. Open afzender-filter, vink "Belastingdienst" aan → alleen Belastingdienst-berichten.
3. Archief toont daadwerkelijk gearchiveerde berichten uit Task 9.
4. Prullenbak toont daadwerkelijk verwijderde berichten.
5. Ga naar `http://localhost:8080/moza/berichtenbox/?map=belastingen-2025` → heading verandert, alleen berichten met die map-label zichtbaar.

- [ ] **Stap 6: Commit**

```bash
git add assets/javascript/berichtenbox.js
git commit -m "➕ Archief/Prullenbak rendering en Inbox-filters (zoek, afzender, map)"
```

---

## Task 11: Voortgangsindicator bij eerste bezoek + mappen-onthulling

**Files:**
- Modify: `assets/javascript/berichtenbox.js`

**Doel:** Bij eerste bezoek op `/moza/berichtenbox/` toont de pagina een voortgangsindicator (oplopende bron-teller, oplopende berichten-teller, balk) in plaats van de lijst. Na ~3 seconden verdwijnt de indicator en worden lijst + mappen-zijbalk in één keer zichtbaar. `eersteBezoekGehad` wordt op `true` gezet. Op volgende bezoeken: meteen volledige weergave.

- [ ] **Stap 1: Voeg voortgangsindicator-logica toe**

Voeg toe vóór de init-blok in `berichtenbox.js`:

```js
	function toonMappenZijbalk() {
		const kop = document.querySelector('[data-berichtenbox-mappen-kop]');
		const lijst = document.querySelector('[data-berichtenbox-mappen]');
		if (kop) kop.hidden = false;
		if (lijst) lijst.hidden = false;
		// Voeg eigen mappen toe
		state.eigenMappen.forEach(voegMapToeAanZijbalk);
	}

	function voortgangsAnimatie(opKlaar) {
		const wrap = document.querySelector('[data-berichtenbox-voortgang]');
		const lijst = document.querySelector('[data-berichtenbox-lijst]');
		const pagnav = document.querySelector('.berichtenbox-content .pagination');
		if (!wrap || !lijst) { opKlaar(); return; }

		// Verberg lijst tijdens animatie
		lijst.hidden = true;
		if (pagnav) pagnav.hidden = true;
		wrap.hidden = false;

		const data = window.berichtenboxData;
		const totaalBronnen = data.aantalMagazijnen;
		const duur = 3000; // ms
		const start = performance.now();

		const bronEl = document.querySelector('[data-berichtenbox-voortgang-bron]');
		const totaalEl = document.querySelector('[data-berichtenbox-voortgang-totaal]');
		const gevondenEl = document.querySelector('[data-berichtenbox-voortgang-gevonden]');
		const balk = document.querySelector('[data-berichtenbox-voortgang-balk]');
		if (totaalEl) totaalEl.textContent = totaalBronnen;

		// Aantal berichten dat in de inbox hoort (dynamisch, rekening houdend met state)
		const totaalBerichten = data.berichten.filter((b) => statusVan(b.id) === 'inbox').length;

		function stap(nu) {
			const t = Math.min(1, (nu - start) / duur);
			const eased = 1 - Math.pow(1 - t, 2);
			if (bronEl) bronEl.textContent = Math.floor(eased * totaalBronnen);
			if (gevondenEl) gevondenEl.textContent = Math.floor(eased * totaalBerichten);
			if (balk) balk.style.inlineSize = (eased * 100) + '%';
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
```

- [ ] **Stap 2: Integreer in init-volgorde**

Vervang het init-blok onderaan de IIFE:

```js
	// Initialisatie
	pasStateToeOpRijen();
	renderLijstVoorView(huidigeView());
	render(huidigeView());
	bindDetailPaginaActies();

	const isEerstePagina = !/\/pagina-\d+\/$/.test(location.pathname);

	if (huidigeView() === 'inbox' && isEerstePagina && !state.eersteBezoekGehad) {
		voortgangsAnimatie(() => {
			state.eersteBezoekGehad = true;
			opslaan();
			toonMappenZijbalk();
			bindInboxFilters();
		});
	} else {
		toonMappenZijbalk();
		bindInboxFilters();
	}
```

- [ ] **Stap 3: Verifieer in browser**

1. Open DevTools → Application → Local Storage → wis de key `berichtenbox`.
2. Herlaad `http://localhost:8080/moza/berichtenbox/`.
3. Expected: de lijst is een paar seconden verborgen, er is een voortgangsindicator met oplopende getallen ("X van 400 bronnen · Y berichten gevonden") en een balk die vol loopt. Mappen zijn nog niet zichtbaar in de zijbalk. Na ~3s: lijst verschijnt, mappen verschijnen in de zijbalk ("Belastingen 2025", "Subsidies"). Tellers per map kloppen.
4. Herlaad de pagina. Expected: geen voortgangsanimatie meer, lijst en mappen zijn meteen zichtbaar.

- [ ] **Stap 4: Commit**

```bash
git add assets/javascript/berichtenbox.js
git commit -m "➕ Voortgangsindicator bij eerste bezoek en mappen-onthulling"
```

---

## Task 12: Auto-polling nieuw bericht (60s, overridebaar via `?poll=`)

**Files:**
- Modify: `assets/javascript/berichtenbox.js`

**Doel:** Elke N seconden (default 60, override via `?poll=N`) verschijnt één nieuw bericht bovenaan de inbox-lijst. Tellers lopen op. Het nieuwe bericht krijgt `is-nieuw-binnen`-klasse voor fade-in-animatie. Het kan uit een magazijn komen dat eerder stil was.

- [ ] **Stap 1: Voeg polling-logica toe**

Voeg toe vóór de init-blok:

```js
	let nieuwBerichtTeller = 0;

	function voegNieuwBerichtToe() {
		if (huidigeView() !== 'inbox') return;
		const data = window.berichtenboxData;
		nieuwBerichtTeller++;
		// Kies random magazijn — mag ook één zonder bestaande berichten zijn
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
			inhoud: `Dit is een automatisch toegevoegd demo-bericht van ${mag.naam}. In productie zou dit een echt bericht uit het magazijn zijn.`,
			datum: nu,
			isOngelezen: true,
			map: null,
			heeftBijlage: Math.random() < 0.3,
		};
		state.nieuweBerichten.push(bericht);
		opslaan();

		// Voeg ook toe aan window-data zodat render/filter het meenemen
		data.berichten.unshift(bericht);

		// Render nieuw rij bovenaan
		const lijst = document.querySelector('[data-berichtenbox-lijst]');
		if (lijst) {
			const tmp = document.createElement('div');
			tmp.innerHTML = rijHTML(bericht);
			const li = tmp.firstElementChild;
			li.classList.add('is-nieuw-binnen');
			lijst.prepend(li);
		}
		render('inbox');
		// Announceer voor screenreaders
		const live = document.querySelector('[data-berichtenbox-live]');
		if (live) live.textContent = `Nieuw bericht van ${bericht.afzender}: ${bericht.onderwerp}`;
	}

	function startPolling() {
		if (huidigeView() !== 'inbox') return;
		// Alleen op de eerste inbox-pagina — nieuwe berichten landen bovenaan daar
		if (/\/pagina-\d+\/$/.test(location.pathname)) return;
		const params = new URLSearchParams(location.search);
		const pollParam = parseInt(params.get('poll'), 10);
		const intervalSec = Number.isFinite(pollParam) && pollParam > 0 ? pollParam : 60;
		setInterval(voegNieuwBerichtToe, intervalSec * 1000);
	}

	// Herstel eerder gepolde berichten (na reload): voeg ze aan data toe
	if (state.nieuweBerichten.length > 0) {
		const data = window.berichtenboxData;
		state.nieuweBerichten.forEach((b) => {
			if (!data.berichten.some((x) => x.id === b.id)) {
				data.berichten.unshift(b);
			}
		});
		// De statisch gegenereerde HTML bevat deze niet — voeg dynamisch toe
		const lijst = document.querySelector('[data-berichtenbox-lijst]');
		if (lijst && huidigeView() === 'inbox') {
			state.nieuweBerichten.forEach((b) => {
				if (lijst.querySelector(`[data-bericht-id="${b.id}"]`)) return;
				const tmp = document.createElement('div');
				tmp.innerHTML = rijHTML(b);
				lijst.prepend(tmp.firstElementChild);
			});
		}
	}
```

- [ ] **Stap 2: Voeg live-region toe aan `moza/berichtenbox.html`**

Modify — direct boven `<ul class="berichtenbox-lijst"`:

```njk
<div class="visually-hidden" data-berichtenbox-live aria-live="polite"></div>
```

- [ ] **Stap 3: Start polling na init**

Pas het init-blok onderaan de IIFE aan — voeg `startPolling();` toe aan het einde van beide takken:

```js
	if (huidigeView() === 'inbox' && !state.eersteBezoekGehad) {
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
```

**Belangrijk:** detail-pagina's en archief/prullenbak moeten `startPolling` niet activeren — de view-check in `startPolling` regelt dat.

Er is ook een detail-pagina-bericht dat via polling is toegevoegd waarvan de detail-pagina niet bestaat (statisch gegenereerd). Voor de demo: klikken op zo'n rij geeft 404. Dat is acceptabel voor een prototype; noem het in de spec als beperking. (Eventueel kan later een JS-gerenderde fallback-detail op `/moza/berichtenbox/bericht/*/` komen, maar dat is buiten scope.)

- [ ] **Stap 4: Voeg 404-fallback-noot toe**

Aan de bericht-rij voor dynamisch toegevoegde berichten: in `rijHTML`, voeg een `data-dynamisch="true"`-attribuut toe voor `msg-live-`-IDs, en laat de rij niet linkbaar zijn:

```js
	function rijHTML(bericht) {
		const ongelezen = isOngelezen(bericht.id, bericht.isOngelezen);
		const map = mapVan(bericht.id, bericht.map);
		const dynamisch = bericht.id.startsWith('msg-live-');
		const NL = (() => {
			const M = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
			const d = new Date(bericht.datum);
			return d.getDate() + ' ' + M[d.getMonth()] + ' ' + d.getFullYear();
		})();
		const innerTag = dynamisch ? 'div' : 'a';
		const innerAttr = dynamisch ? '' : ` href="/moza/berichtenbox/bericht/${bericht.id}/"`;
		return `<li class="berichtenbox-rij${ongelezen ? ' is-ongelezen' : ''}${dynamisch ? ' is-dynamisch' : ''}" data-bericht-id="${bericht.id}" data-afzender-id="${bericht.magazijnId}"${map ? ` data-map="${map}"` : ''}>
			<${innerTag}${innerAttr}>
				${ongelezen ? '<span><i class="visually-hidden">Ongelezen.</i></span> ' : ''}
				<span class="berichtenbox-rij-afzender">${bericht.afzender}</span>
				<span class="berichtenbox-rij-onderwerp">${bericht.onderwerp}${dynamisch ? : ''}</span>
				<span class="berichtenbox-rij-datum">${NL}</span>
				${bericht.heeftBijlage ? '<span class="berichtenbox-rij-bijlage" aria-label="heeft bijlage">📎</span>' : ''}
				${map ? `<span class="berichtenbox-rij-maplabel" data-maplabel>${map}</span>` : ''}
			</${innerTag}>
		</li>`;
	}
```

Dynamisch toegevoegde berichten zijn dus niet-klikbaar in deze versie — acceptabel voor demo.

- [ ] **Stap 5: Verifieer in browser**

1. Open `/moza/berichtenbox/?poll=5` (sneller voor test).
2. Wacht 5 seconden: nieuw bericht verschijnt bovenaan met fade-in, teller "totaal" en "ongelezen" lopen op met 1.
3. Herlaad: het nieuwe bericht blijft staan.
4. Open `/moza/berichtenbox/` zonder poll-param → na ±60s komt er een bericht bij.

- [ ] **Stap 6: Commit**

```bash
git add assets/javascript/berichtenbox.js moza/berichtenbox.html
git commit -m "➕ Auto-polling nieuw bericht (60s, overridebaar via ?poll=)"
```

---

## Task 13: Asynchroon bijlage-ophalen op detail-pagina

**Files:**
- Modify: `assets/javascript/berichtenbox.js`

**Doel:** Op de detail-pagina staat de tekst "Bijlagen ophalen bij {afzender}…". Na ~1500ms verdwijnt die tekst en verschijnt een lijstje met 1-3 gesimuleerde bijlagen (klikbaar maar niet-functioneel).

- [ ] **Stap 1: Voeg bijlage-simulatie toe**

Voeg toe vóór de init-blok:

```js
	function laadBijlagen() {
		const bijlSec = document.querySelector('[data-berichtenbox-bijlagen]');
		if (!bijlSec) return;
		const laden = bijlSec.querySelector('[data-berichtenbox-bijlagen-laden]');
		const lijst = bijlSec.querySelector('[data-berichtenbox-bijlagen-lijst]');
		if (!laden || !lijst) return;

		setTimeout(() => {
			const namen = [
				'Beschikking.pdf',
				'Bijlage-specificatie.pdf',
				'Toelichting.pdf',
				'Overzicht.pdf',
			];
			const aantal = 1 + Math.floor(Math.random() * 3);
			const gekozen = namen.slice(0, aantal);
			lijst.innerHTML = gekozen.map((n) =>
				`<li><a href="#" onclick="return false;">${n}</a></li>`
			).join('');
			laden.hidden = true;
			lijst.hidden = false;
		}, 1500);
	}
```

- [ ] **Stap 2: Roep aan in `bindDetailPaginaActies`**

Aan het eind van `bindDetailPaginaActies`, na de event-listeners:

```js
		laadBijlagen();
```

- [ ] **Stap 3: Verifieer in browser**

Open een bericht met een bijlage (icoon 📎 in de lijst).
Expected: "Bijlagen ophalen bij {afzender}…" verschijnt, na ±1,5s: lijstje met 1-3 PDF-namen. Klikken doet niks.

- [ ] **Stap 4: Commit**

```bash
git add assets/javascript/berichtenbox.js
git commit -m "➕ Asynchroon bijlage-ophalen op detail-pagina"
```

---

## Task 14: Demo-reset-link onderaan en toegankelijkheids-check

**Files:**
- Create: `_includes/berichtenbox-footer-link.njk`
- Modify: `assets/javascript/berichtenbox.js`

**Doel:** Onderaan elke Berichtenbox-pagina een kleine link "Demo opnieuw starten" die de `berichtenbox`-localStorage-key wist en herlaadt. Plus: borg dat alle interactieve elementen bereikbaar zijn via toetsenbord en dat de voortgang/nieuw-bericht-announcements correct zijn.

- [ ] **Stap 1: Maak `_includes/berichtenbox-footer-link.njk`**

```njk
<p class="berichtenbox-demo-reset">
	<a href="#" data-berichtenbox-reset>Demo opnieuw starten</a>
</p>
```

- [ ] **Stap 2: Bind reset-handler**

Voeg toe vóór de init in `berichtenbox.js`:

```js
	document.querySelectorAll('[data-berichtenbox-reset]').forEach((link) => {
		link.addEventListener('click', (e) => {
			e.preventDefault();
			localStorage.removeItem(LS_KEY);
			location.href = '/moza/berichtenbox/';
		});
	});
```

- [ ] **Stap 3: Toegankelijkheids-check**

Loop de onderstaande checklist visueel na in browser + Accessibility-tab van DevTools:

- [ ] Voortgangsindicator heeft `role="status"` en `aria-live="polite"` (gezet in Task 4).
- [ ] Live-region voor nieuwe berichten is aanwezig (Task 12).
- [ ] Ongelezen-berichten worden ook voor screenreaders als "Ongelezen" aangekondigd (via `visually-hidden` span — al in `rijHTML` en in `berichtenbox-row.njk`).
- [ ] Alle knoppen op detail-pagina zijn met Tab bereikbaar en activeren met Enter/Space.
- [ ] Zoekveld heeft een `<label>` (via `.visually-hidden`).
- [ ] Filterknop (`<details>`/`<summary>`) werkt met toetsenbord.
- [ ] `aria-current="page"` zit op de juiste zijbalk-link.

- [ ] **Stap 4: Verifieer in browser**

1. Open willekeurige Berichtenbox-pagina. Onderaan verschijnt de link "Demo opnieuw starten".
2. Klik erop: localStorage is gewist, pagina herlaadt en toont de voortgangsanimatie opnieuw; archief/prullenbak zijn leeg; mappen staan weer op de voorgevulde twee.
3. Navigeer met Tab door inbox: alle links bereikbaar.
4. Open een bericht en gebruik Tab voor acties.

- [ ] **Stap 5: Commit**

```bash
git add _includes/berichtenbox-footer-link.njk assets/javascript/berichtenbox.js
git commit -m "➕ Demo-reset-link en toegankelijkheids-afronding"
```

---

## Task 15: Schrijfwijzer- en stijl-doorloop

**Files:**
- Review: alle nieuwe/aangepaste templates en JS

**Doel:** Borg dat alle getoonde tekst aansluit bij de MOZa-schrijfwijzer: "u/uw" aanspreking, genderneutraal, B1-niveau, correcte datums/aanhalingstekens. Check ook dat CSS logical properties gebruikt zijn en er geen hardcoded kleuren/waardes staan.

- [ ] **Stap 1: Doorloop tekstuele fragmenten**

Open en scan:

- `moza/berichtenbox.html` — "X berichten · Y ongelezen · opgehaald uit N bronnen" → correct
- `moza/berichtenbox/archief.html` — "U heeft nog geen berichten gearchiveerd." → correct (u-aanspreking)
- `moza/berichtenbox/prullenbak.html` — "Uw prullenbak is leeg." → correct
- `moza/berichtenbox/bericht.njk` — actieknoppen: "Archiveren", "Verplaatsen naar map…", "Markeer als ongelezen", "Verwijderen" → correct (werkwoord, kort)
- `berichtenbox.js` — tekstfragmenten voor live-region en leeg-paneel-tekst → check u-aanspreking
- `berichten-leeg`-tekst: "Er zijn geen berichten die overeenkomen met uw zoekopdracht." → correct

- [ ] **Stap 2: CSS-audit**

Doorloop de CSS die je hebt toegevoegd in `style/style.css`:

- Alle spacings gebruiken `margin-block-*`, `margin-inline-*`, `padding-block-*`, `padding-inline-*` (geen `margin-top` etc.)
- Alle dimensies gebruiken `inline-size`, `block-size` (geen `width`/`height`)
- Custom properties verwijzen naar `--toepassing-*` (de fallback-waarden zijn voor ontwikkeling; controleer welke tokens bestaan en haal fallbacks waar mogelijk weg)

Controleer `style/_toepassing.css` (bestaande tokens) en vervang fallback-waarden door bestaande tokens waar mogelijk.

- [ ] **Stap 3: Commit wijzigingen**

```bash
git add style/style.css moza/berichtenbox*.html moza/berichtenbox/*.html moza/berichtenbox/*.njk assets/javascript/berichtenbox.js
git commit -m "✏️ Schrijfwijzer-doorloop en stijl-audit Berichtenbox"
```

---

## Afronding

Wanneer Tasks 1-15 voltooid zijn:

- Open `http://localhost:8080/moza/berichtenbox/` in een schone browser (localStorage gewist).
- Loop alle scenario's uit de spec visueel door: eerste-bezoek-animatie, mappen verschijnen, zoeken/filteren/map-filter, archiveren/verwijderen/verplaatsen/markeer-ongelezen, auto-polling na 60s, bijlage-laden op detail-pagina, demo-reset.
- Controleer dat bestaande MOZa-pagina's (Home, Actualiteiten, Bedrijfsgegevens) niet beïnvloed zijn door de CSS-wijzigingen of het extra script.
- Controleer dat de feature-flag `Berichtenbox` in het flags-paneel nog werkt: bij uitzetten verdwijnt de Berichtenbox uit MOZa's hoofd-zijbalk (consistent met de bestaande `moza.json`-config).

Gebruik vervolgens het flow: ga naar main via een PR, of verwerk door naar productie zoals gebruikelijk in dit project.
