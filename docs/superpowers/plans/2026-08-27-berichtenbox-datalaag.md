# Berichtenbox: scheiding datalaag en rendering — implementatieplan

> **Voor agentische uitvoerders:** VERPLICHTE SUB-SKILL: gebruik `superpowers:subagent-driven-development` (aanbevolen) of `superpowers:executing-plans` om dit plan taak voor taak uit te voeren. Stappen gebruiken checkbox-syntaxis (`- [ ]`) voor het bijhouden.

**Doel:** De berichtenbox laten renderen vanuit één datalaag die zelf bepaalt welke bron geldt (gegenereerde dataset of Federatief Berichtenstelsel), zodat de rendering niet meer weet waar de berichten vandaan komen.

**Architectuur:** Vier kleine modules met één verantwoordelijkheid — state, lijst-query, bronregister, dataset-bron — en `berichtenbox.js` als render-laag die alleen nog leest. De rendering vraagt de datalaag om berichten; de datalaag kiest de bron op basis van de actieve persona. De server-gerenderde HTML blijft bestaan als no-JS-basis, maar is niet langer de databron van de JavaScript.

**Tech stack:** Plain JavaScript (native ES-modules), Eleventy/Nunjucks, Vitest voor de pure modules. Geen frameworks, geen bundler voor deze bestanden.

**Spec:** `docs/superpowers/specs/2026-04-13-fbs-berichtenbox-design.md`

**Aanleiding:** PR #135 (`feat/fbs-keten-koppeling`) koppelt de berichtenbox aan het Federatief Berichtenstelsel. Die koppeling vervangt de berichten *ná* de rendering en moet daarom op negen plaatsen de demo-simulatie afremmen met een `ketenActief`-vlag. Dit plan haalt die naad weg. Fase 2 onderaan beschrijft hoe #135 daarop rebased wordt.

---

## Global Constraints

Overgenomen uit `CLAUDE.md` en de spec. Deze gelden voor élke taak hieronder.

- **Semantische HTML eerst.** ARIA alleen waar HTML niet volstaat.
- **CSS logical properties.** `inline-size`, `block-size`, `margin-block-start`. Nooit `width`, `height`, `margin-top`.
- **Design tokens.** Altijd `--toepassing-*`, nooit `--rijkshuisstijl-*` of hardcoded waarden.
- **Aanspreking "u" en "uw"**, nooit "je". Genderneutraal ("die", "diegene"). B1-taalniveau.
- **Terminologie:** Berichten / Berichtenbox. In de berichtenbox expliciet *Archiveren*, *Verwijderen*, *Verplaatsen naar map* — vastgelegde afwijking van de schrijfwijzer, zie spec-sectie "Schrijfwijzer — afwijking vastgelegd".
- **Datums:** dag maandnaam jaar, volledige maandnaam ("12 februari 2018").
- **Geen frameworks, geen preprocessors.** Eenvoudigst mogelijke oplossing; HTML en CSS waar het kan, JavaScript waar het moet.
- **Zonder JavaScript werkt de lijst.** Spec, sectie "Technische aanpak": *"inbox is server-gerenderd, klikken op bericht werkt, filteren/zoeken/acties zijn dan niet beschikbaar"*. Dit plan houdt die eigenschap intact — zie "Conflict met de spec" hieronder.
- **Commits ondertekenen.** Deze repo gebruikt SSH commit-signing. Nooit `--no-gpg-sign`.
- **Commitberichten** volgen de emoji-conventie uit `README.md` (➕ Added, ✏️ Modified, ❌ Deleted, 🧼 Hygiene, 🐛 Bugfix, 🔁 Renamed).

---

## Conflict met de spec, en hoe dit plan het oplost

De spec eist dat de inbox zonder JavaScript werkt, en dat kan alleen als Eleventy de rijen server-side rendert. Een bronswitch kan alleen in de browser, want de persona is bij de build niet bekend. Die twee eisen lijken elkaar uit te sluiten.

Ze doen dat niet, mits we het onderscheid scherp maken:

| | Zonder JavaScript | Met JavaScript |
|---|---|---|
| Bron van de lijst | server-gerenderde HTML (dataset) | de datalaag |
| Rij-markup | `_includes/berichtenbox-row.njk` | `createRij()` |
| Detailpagina | statische pagina uit `bericht.njk` | statische pagina, of client-route |

**De regel wordt: zodra JavaScript draait, is de datalaag de enige waarheid en wordt de tbody één keer opnieuw opgebouwd.** Ook als de dataset de bron is. Dat kost één render bij het laden — onzichtbaar, want de lijst is dan toch al verborgen achter de voortgangsindicator — en het haalt de tweede waarheid uit de code.

Dat is de kern van de winst. Nu is de DOM óók databron: `pasFilterToe` loopt door `.berichtenbox-row`-elementen, leest `rij.dataset.berichtId`, en zoekt het bericht dáárna pas op in `data.berichten`. Elke bronwissel moet daardoor twee representaties gelijk houden.

**Wat blijft dubbel:** de rij-markup bestaat in Nunjucks én in JavaScript. Dat is de prijs van de no-JS-eis en dit plan lost het niet op. Taak 10 legt de koppeling vast in een Storybook-story zodat afwijking opvalt.

---

## Beslissingen die in dit plan zitten

Drie keuzes die de uitvoerder niet zelf hoeft te maken, met de reden erbij. Wijzig ze bewust of niet.

**1. Native ES-modules voor de nieuwe bestanden.** Alle bestaande scripts in `assets/javascript/` zijn IIFE's die op `window.*` registreren; er staat nergens `type="module"`. Met vier nieuwe bestanden wordt laadvolgorde via globals broos. Native ESM is platform, heeft geen bundler nodig, en `<script type="module">` laadt met dezelfde timing als `defer`. Alleen de berichtenbox-bestanden gaan om; de rest blijft klassiek. Een module mag globals lezen die een eerder klassiek script zette (`window.Personas`, `window.PATH_PREFIX`), dus de mix werkt.

**2. Vitest voor de pure modules.** De repo heeft nu geen enkele test (`package.json` kent alleen `lint:css`). Een refactor van 2010 regels ongetest JavaScript zonder vangnet is onnodig riskant. `vite` staat al in `devDependencies`, dus `vitest` is een kleine toevoeging en draait zonder configuratie. Alleen de pure modules worden getest — state, lijst-query, bronregister. De rendering blijft handmatig getest, net als nu.

Zegt het team nee tegen een testframework: sla Taak 1 over, laat elke taak eindigen op `npm run build` plus een handmatige controle in de browser, en accepteer dat de refactor geen regressiedekking heeft.

**3. Statische detailpagina's blijven.** De spec genereert één HTML per bericht via Eleventy-pagination (141 per portaal). Dat blijft voor dataset-berichten, zodat no-JS blijft werken. Berichten die geen statische pagina hebben — nu de dynamisch binnengekomen berichten, straks de keten-berichten — krijgen de bestaande client-route `bericht-demo/?id=`. Taak 9 generaliseert die.

---

## Bestandsstructuur

Nieuw, allemaal onder `assets/javascript/berichtenbox/`:

| Bestand | Verantwoordelijkheid | DOM? |
|---|---|---|
| `state.js` | Leest en schrijft de localStorage-state (gelezen, archief, prullenbak, mappen, markeringen) en beantwoordt vragen daarover: `statusVan`, `isOngelezen`, `mapVan`, `isGemarkeerd`. | nee |
| `lijst.js` | Pure query over een array berichten: filteren, sorteren, pagineren. Krijgt berichten en criteria binnen, geeft berichten terug. | nee |
| `bron.js` | Het bronregister. Kent de beschikbare bronnen, kiest er één op basis van de actieve persona, levert `berichten()` / `magazijnen()` / `mappen()` en meldt wijzigingen via een callback. | nee |
| `dataset-bron.js` | De gegenereerde dataset als bron, inclusief het demo-gedrag dat daarbij hoort: voortgangsanimatie, binnendruppelende berichten, gesimuleerde bronuitval. | ja, voor de voortgangsanimatie |

Gewijzigd:

| Bestand | Wat er verandert |
|---|---|
| `assets/javascript/berichtenbox.js` | Wordt render-laag. Leest uit `bron.js`, muteert de databron nooit. De state-, filter- en sorteerlogica verhuist naar de nieuwe modules. |
| `_includes/base.njk` | Scripttags voor de berichtenbox worden `type="module"`. |
| `package.json` | `vitest` in devDependencies, `test`-script. |

`dataset-bron.js` is de enige nieuwe module die de DOM aanraakt, en alleen voor de voortgangsanimatie. Dat is bewust: die animatie *is* brongedrag ("deze bron doet alsof hij federatief ophaalt"), geen rendering van berichten. In de eindsituatie zit alle `ketenActief`-achtige logica hier, als het verschil tussen twee bronnen, en niet meer als vlaggen door de render-laag heen.

---

## Taken

### Taak 1: Testharnas

**Files:**
- Modify: `package.json`
- Create: `assets/javascript/berichtenbox/datum.js`
- Create: `assets/javascript/berichtenbox/datum.test.js`

**Interfaces:**
- Consumes: niets
- Produces: `datumNL(isoDatum: string): string` — formatteert `"2026-02-12"` naar `"12 februari 2026"`. Wordt in Taak 6 door de render-laag geïmporteerd.

Deze taak bewijst dat de harnas werkt op de kleinste echte functie die er is, voordat er iets van betekenis verhuist. `datumNL` staat nu op `berichtenbox.js:382`.

- [ ] **Stap 1: Installeer vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Stap 2: Voeg het test-script toe aan `package.json`**

Voeg toe aan `"scripts"`, direct na `"lint:css:fix"`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Stap 3: Schrijf de falende test**

Maak `assets/javascript/berichtenbox/datum.test.js`:

```js
import { describe, it, expect } from "vitest";
import { datumNL } from "./datum.js";

describe("datumNL", () => {
	it("schrijft de maand voluit, zoals de schrijfwijzer vraagt", () => {
		expect(datumNL("2026-02-12")).toBe("12 februari 2026");
	});

	it("laat een lege datum leeg", () => {
		expect(datumNL("")).toBe("");
	});

	it("geeft onbegrijpelijke invoer ongewijzigd terug in plaats van 'Invalid Date'", () => {
		expect(datumNL("geen datum")).toBe("geen datum");
	});
});
```

- [ ] **Stap 4: Draai de test en controleer dat hij faalt**

Draai: `npm test`
Verwacht: FAIL, `Failed to resolve import "./datum.js"`

- [ ] **Stap 5: Schrijf de implementatie**

Kopieer het gedrag van `berichtenbox.js:382-391` naar `assets/javascript/berichtenbox/datum.js`. Lees die functie eerst; de implementatie hieronder moet exact hetzelfde doen, inclusief de bestaande randgevallen.

```js
/**
 * Datumnotatie volgens de schrijfwijzer: dag maandnaam jaar, maand voluit.
 * Onbegrijpelijke invoer komt ongewijzigd terug — "Invalid Date" in een lijst
 * is erger dan de ruwe waarde.
 */
const MAANDEN = [
	"januari", "februari", "maart", "april", "mei", "juni",
	"juli", "augustus", "september", "oktober", "november", "december",
];

export function datumNL(isoDatum) {
	if (!isoDatum) return "";

	const delen = String(isoDatum).slice(0, 10).split("-");
	if (delen.length !== 3) return isoDatum;

	const jaar = Number(delen[0]);
	const maand = Number(delen[1]);
	const dag = Number(delen[2]);
	if (!Number.isFinite(jaar) || !Number.isFinite(maand) || !Number.isFinite(dag)) return isoDatum;
	if (maand < 1 || maand > 12) return isoDatum;

	return dag + " " + MAANDEN[maand - 1] + " " + jaar;
}
```

- [ ] **Stap 6: Draai de test en controleer dat hij slaagt**

Draai: `npm test`
Verwacht: PASS, 3 tests.

- [ ] **Stap 7: Vergelijk met het origineel**

Draai: `sed -n '382,391p' assets/javascript/berichtenbox.js`
Controleer dat de nieuwe module dezelfde uitvoer geeft voor de gevallen die daar behandeld worden. Wijkt het af, pas dan de nieuwe module aan — niet de test.

- [ ] **Stap 8: Commit**

```bash
git add package.json package-lock.json assets/javascript/berichtenbox/
git commit -m "➕ Testharnas en losse datummodule voor de berichtenbox"
```

---

### Taak 2: State-module

**Files:**
- Create: `assets/javascript/berichtenbox/state.js`
- Create: `assets/javascript/berichtenbox/state.test.js`
- Modify: `assets/javascript/berichtenbox.js:167-234` (verwijderen na overzetten)

**Interfaces:**
- Consumes: niets
- Produces:
  - `maakState(opslag, bekendeMagazijnIds: string[]): State`
  - `State.statusVan(berichtId): "inbox" | "archief" | "prullenbak"`
  - `State.isOngelezen(berichtId, origineelOngelezen: boolean): boolean`
  - `State.mapVan(berichtId, origineleMap: string|null): string|null`
  - `State.isGemarkeerd(berichtId, origineelGemarkeerd: boolean): boolean`
  - `State.ruw: object` — de onderliggende state, voor code die er nog direct in schrijft
  - `State.bewaar(): void`

`opslag` wordt geïnjecteerd (in productie `localStorage`) zodat de test geen browser nodig heeft. `bekendeMagazijnIds` vervangt het huidige `data.magazijnen`-gebruik in `readState` — de state-module hoort de dataset niet te kennen.

- [ ] **Stap 1: Lees de bestaande implementatie**

Draai: `sed -n '150,235p' assets/javascript/berichtenbox.js`

Let op deze eigenschappen, die moeten blijven:
- corrupte JSON valt terug op de default-state met `console.warn`
- `nieuweBerichten` wordt gefilterd op bekende magazijnen en afgekapt op `NIEUWE_BERICHTEN_LIMIET`
- de zes objectsleutels (`gelezen`, `ongelezenToegevoegd`, `gearchiveerd`, `verwijderd`, `gemarkeerd`, `mapOverride`) worden genormaliseerd als ze geen object zijn
- `writeState` vangt `QuotaExceededError` en Safari-private-mode af en laat de demo doordraaien

- [ ] **Stap 2: Schrijf de falende tests**

Maak `assets/javascript/berichtenbox/state.test.js`:

```js
import { describe, it, expect } from "vitest";
import { maakState } from "./state.js";

function nepOpslag(inhoud) {
	const kluis = { ...inhoud };
	return {
		getItem: (k) => (k in kluis ? kluis[k] : null),
		setItem: (k, v) => { kluis[k] = String(v); },
		_kluis: kluis,
	};
}

describe("maakState", () => {
	it("valt terug op de default-state als er niets bewaard is", () => {
		const state = maakState(nepOpslag({}), []);
		expect(state.statusVan("msg-1")).toBe("inbox");
		expect(state.ruw.eigenMappen).toEqual([]);
	});

	it("valt terug op de default-state bij corrupte JSON", () => {
		const state = maakState(nepOpslag({ berichtenbox: "{niet json" }), []);
		expect(state.statusVan("msg-1")).toBe("inbox");
	});

	it("geeft prullenbak voorrang op archief", () => {
		const state = maakState(nepOpslag({
			berichtenbox: JSON.stringify({ gearchiveerd: { "msg-1": true }, verwijderd: { "msg-1": true } }),
		}), []);
		expect(state.statusVan("msg-1")).toBe("prullenbak");
	});

	it("laat een gelezen bericht niet meer als ongelezen tellen", () => {
		const state = maakState(nepOpslag({
			berichtenbox: JSON.stringify({ gelezen: { "msg-1": true } }),
		}), []);
		expect(state.isOngelezen("msg-1", true)).toBe(false);
	});

	it("laat handmatig op ongelezen zetten winnen van gelezen", () => {
		const state = maakState(nepOpslag({
			berichtenbox: JSON.stringify({ gelezen: { "msg-1": true }, ongelezenToegevoegd: { "msg-1": true } }),
		}), []);
		expect(state.isOngelezen("msg-1", false)).toBe(true);
	});

	it("gooit bewaarde berichten van onbekende magazijnen weg", () => {
		const state = maakState(nepOpslag({
			berichtenbox: JSON.stringify({
				nieuweBerichten: [{ id: "a", magazijnId: "weg" }, { id: "b", magazijnId: "blijft" }],
			}),
		}), ["blijft"]);
		expect(state.ruw.nieuweBerichten.map((b) => b.id)).toEqual(["b"]);
	});

	it("normaliseert een sleutel die geen object is", () => {
		const state = maakState(nepOpslag({
			berichtenbox: JSON.stringify({ gearchiveerd: "kapot" }),
		}), []);
		expect(state.ruw.gearchiveerd).toEqual({});
	});

	it("laat de demo doordraaien als opslag weigert", () => {
		const opslag = nepOpslag({});
		opslag.setItem = () => { throw new Error("QuotaExceededError"); };
		const state = maakState(opslag, []);
		expect(() => state.bewaar()).not.toThrow();
	});
});
```

- [ ] **Stap 3: Draai de tests en controleer dat ze falen**

Draai: `npm test`
Verwacht: FAIL, `Failed to resolve import "./state.js"`

- [ ] **Stap 4: Schrijf `state.js`**

Verplaats de logica uit `berichtenbox.js:150-234` letterlijk; verander alleen wat de interface hierboven vraagt. Het overrideprincipe (`ongelezenToegevoegd` wint van `gelezen`, `mapOverride` wint van de bron-map) blijft precies zoals het was.

- [ ] **Stap 5: Draai de tests en controleer dat ze slagen**

Draai: `npm test`
Verwacht: PASS, 8 tests.

- [ ] **Stap 6: Laat `berichtenbox.js` de module gebruiken**

Vervang in `berichtenbox.js` de eigen `readState`/`writeState`/`statusVan`/`isOngelezen`/`mapVan`/`isGemarkeerd` door de module. Laat `const state = ...` als naam bestaan en wijs die aan `State.ruw` toe, zodat de circa veertig plekken die nu rechtstreeks in `state.gearchiveerd` schrijven ongewijzigd blijven werken. Die schrijfacties worden in Taak 7 opgeruimd; ze in één keer meenemen maakt deze taak te groot om te reviewen.

- [ ] **Stap 7: Controleer het gedrag in de browser**

Draai: `npm run build && npx @11ty/eleventy --serve`

Loop deze controle af op `/moza/berichtenbox/`:
1. Archiveer een bericht → het verdwijnt uit de inbox en staat in Archief
2. Herlaad → het staat er nog steeds
3. Verwijder een bericht → Prullenbak
4. Markeer een bericht → de markering overleeft een herlaad
5. Open de console → geen fouten

- [ ] **Stap 8: Commit**

```bash
git add assets/javascript/berichtenbox/state.js assets/javascript/berichtenbox/state.test.js assets/javascript/berichtenbox.js
git commit -m "🔁 Berichtenbox-state naar een eigen module"
```

---

### Taak 3: Lijst-query

**Files:**
- Create: `assets/javascript/berichtenbox/lijst.js`
- Create: `assets/javascript/berichtenbox/lijst.test.js`

**Interfaces:**
- Consumes: `State` uit Taak 2
- Produces:
  - `filterBerichten(berichten, criteria): Bericht[]`
    `criteria = { view, zoek, afzenders: Set<string>, map, magazijnToegestaan: (id) => boolean, persoonRelevant: (bericht) => boolean, state }`
  - `sorteerBerichten(berichten, sleutel: "afzender"|"onderwerp"|"datum", oplopend: boolean): Bericht[]` — geeft een nieuwe array, muteert niet
  - `paginaVan(berichten, pagina: number, grootte: number): { items: Bericht[], totaalPaginas: number, pagina: number }`

Dit is de kern van de scheiding: nu doet `pasFilterToe` (`berichtenbox.js:1167-1212`) dit door door de DOM te lopen en per rij het bericht terug te zoeken. Hierna filtert de datalaag en rendert de render-laag het resultaat.

`magazijnToegestaan` en `persoonRelevant` komen als functie binnen in plaats van als data, zodat `lijst.js` niets hoeft te weten van persona's, org-filters of de unhappy flow.

- [ ] **Stap 1: Lees de bestaande filterlogica**

Draai: `sed -n '1167,1212p' assets/javascript/berichtenbox.js`

De volgorde van de criteria moet blijven: status, magazijn, persona-relevantie, zoektekst, afzenderselectie, map.

- [ ] **Stap 2: Schrijf de falende tests**

Maak `assets/javascript/berichtenbox/lijst.test.js`:

```js
import { describe, it, expect } from "vitest";
import { filterBerichten, sorteerBerichten, paginaVan } from "./lijst.js";

const ALLES_TOEGESTAAN = () => true;
const IEDEREEN = () => true;

function bericht(over) {
	return { id: "m1", magazijnId: "gemeente", afzender: "Gemeente Utrecht", onderwerp: "Aanslag", datum: "2026-02-12", map: null, ...over };
}

function state(status = "inbox", map = null) {
	return { statusVan: () => status, mapVan: (_id, origineel) => map ?? origineel };
}

describe("filterBerichten", () => {
	it("toont in de inbox alleen berichten met status inbox", () => {
		const berichten = [bericht({ id: "a" })];
		expect(filterBerichten(berichten, {
			view: "inbox", zoek: "", afzenders: new Set(), map: null,
			magazijnToegestaan: ALLES_TOEGESTAAN, persoonRelevant: IEDEREEN, state: state("archief"),
		})).toEqual([]);
	});

	it("zoekt op afzender én onderwerp, hoofdletterongevoelig", () => {
		const berichten = [bericht({ id: "a", onderwerp: "Aanslag" }), bericht({ id: "b", onderwerp: "Subsidie" })];
		const criteria = {
			view: "inbox", zoek: "aansl", afzenders: new Set(), map: null,
			magazijnToegestaan: ALLES_TOEGESTAAN, persoonRelevant: IEDEREEN, state: state(),
		};
		expect(filterBerichten(berichten, criteria).map((b) => b.id)).toEqual(["a"]);
	});

	it("laat een leeg afzenderfilter alles door", () => {
		const berichten = [bericht({ id: "a" }), bericht({ id: "b", magazijnId: "belastingdienst" })];
		const criteria = {
			view: "inbox", zoek: "", afzenders: new Set(), map: null,
			magazijnToegestaan: ALLES_TOEGESTAAN, persoonRelevant: IEDEREEN, state: state(),
		};
		expect(filterBerichten(berichten, criteria)).toHaveLength(2);
	});

	it("respecteert een geblokkeerd magazijn", () => {
		const berichten = [bericht({ id: "a", magazijnId: "geblokkeerd" })];
		const criteria = {
			view: "inbox", zoek: "", afzenders: new Set(), map: null,
			magazijnToegestaan: (id) => id !== "geblokkeerd", persoonRelevant: IEDEREEN, state: state(),
		};
		expect(filterBerichten(berichten, criteria)).toEqual([]);
	});

	it("gebruikt de map-override uit de state, niet de map van het bericht", () => {
		const berichten = [bericht({ id: "a", map: "Subsidies" })];
		const criteria = {
			view: "inbox", zoek: "", afzenders: new Set(), map: "Belastingen 2025",
			magazijnToegestaan: ALLES_TOEGESTAAN, persoonRelevant: IEDEREEN, state: state("inbox", "Belastingen 2025"),
		};
		expect(filterBerichten(berichten, criteria).map((b) => b.id)).toEqual(["a"]);
	});
});

describe("sorteerBerichten", () => {
	it("sorteert op datum zonder de invoer te muteren", () => {
		const berichten = [bericht({ id: "a", datum: "2026-01-01" }), bericht({ id: "b", datum: "2026-03-01" })];
		const gesorteerd = sorteerBerichten(berichten, "datum", false);
		expect(gesorteerd.map((b) => b.id)).toEqual(["b", "a"]);
		expect(berichten.map((b) => b.id)).toEqual(["a", "b"]);
	});

	it("sorteert afzenders in Nederlandse volgorde", () => {
		const berichten = [bericht({ id: "a", afzender: "Zorginstituut" }), bericht({ id: "b", afzender: "Belastingdienst" })];
		expect(sorteerBerichten(berichten, "afzender", true).map((b) => b.id)).toEqual(["b", "a"]);
	});
});

describe("paginaVan", () => {
	const tien = Array.from({ length: 25 }, (_, i) => bericht({ id: "m" + i }));

	it("geeft het venster van de gevraagde pagina", () => {
		expect(paginaVan(tien, 2, 10).items.map((b) => b.id)).toEqual(
			["m10", "m11", "m12", "m13", "m14", "m15", "m16", "m17", "m18", "m19"]
		);
	});

	it("klemt een te hoge pagina naar de laatste", () => {
		const uitkomst = paginaVan(tien, 99, 10);
		expect(uitkomst.pagina).toBe(3);
		expect(uitkomst.items).toHaveLength(5);
	});

	it("geeft één pagina terug als er geen paginagrootte is", () => {
		const uitkomst = paginaVan(tien, 1, Infinity);
		expect(uitkomst.totaalPaginas).toBe(1);
		expect(uitkomst.items).toHaveLength(25);
	});
});
```

- [ ] **Stap 3: Draai de tests en controleer dat ze falen**

Draai: `npm test`
Verwacht: FAIL, `Failed to resolve import "./lijst.js"`

- [ ] **Stap 4: Schrijf `lijst.js`**

Zet de criteria-volgorde uit `pasFilterToe` om naar een filter over berichten in plaats van over DOM-rijen. `paginaVan` neemt het klemgedrag over uit `paginer` (`berichtenbox.js:529-544`): een te hoge pagina zakt naar de laatste, een te lage naar 1, en `Infinity` als grootte betekent alles op één pagina.

- [ ] **Stap 5: Draai de tests en controleer dat ze slagen**

Draai: `npm test`
Verwacht: PASS, 10 tests.

- [ ] **Stap 6: Commit**

Nog niet aansluiten op `berichtenbox.js` — dat gebeurt in Taak 7, als de render-laag zover is.

```bash
git add assets/javascript/berichtenbox/lijst.js assets/javascript/berichtenbox/lijst.test.js
git commit -m "➕ Pure lijst-query voor de berichtenbox"
```

---

### Taak 4: Bronregister

**Files:**
- Create: `assets/javascript/berichtenbox/bron.js`
- Create: `assets/javascript/berichtenbox/bron.test.js`

**Interfaces:**
- Consumes: niets
- Produces:
  - `maakRegister(): Register`
  - `Register.registreer(bron: Bron): void`
  - `Register.kies(persona): Promise<Bron>` — loopt de bronnen af in registratievolgorde en neemt de eerste waarvoor `bron.geldtVoor(persona)` waar is
  - `Register.actief(): Bron | null`
  - `Register.opWijziging(callback: (inhoud) => void): void`
  - `Register.meld(inhoud): void` — een bron roept dit aan als zijn berichten veranderen

Een `Bron` is een object met:

```js
{
	naam: "dataset",
	geldtVoor: async (persona) => true,     // is deze bron van toepassing?
	laad: async () => ({ berichten, magazijnen, mappen }),
	start: (meld) => {},                    // optioneel: brongedrag na het laden
}
```

De keten-bron uit Fase 2 implementeert precies dit contract. Meer heeft die niet nodig.

- [ ] **Stap 1: Schrijf de falende tests**

Maak `assets/javascript/berichtenbox/bron.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { maakRegister } from "./bron.js";

function nepBron(naam, geldt, inhoud) {
	return {
		naam,
		geldtVoor: async () => geldt,
		laad: async () => inhoud,
	};
}

const LEEG = { berichten: [], magazijnen: [], mappen: [] };

describe("maakRegister", () => {
	it("kiest de eerste bron die van toepassing is", async () => {
		const register = maakRegister();
		register.registreer(nepBron("keten", true, LEEG));
		register.registreer(nepBron("dataset", true, LEEG));
		const gekozen = await register.kies({ id: "koffiezaak" });
		expect(gekozen.naam).toBe("keten");
	});

	it("slaat een bron over die niet van toepassing is", async () => {
		const register = maakRegister();
		register.registreer(nepBron("keten", false, LEEG));
		register.registreer(nepBron("dataset", true, LEEG));
		expect((await register.kies({ id: "x" })).naam).toBe("dataset");
	});

	it("laat een bron die gooit de volgende niet blokkeren", async () => {
		const register = maakRegister();
		register.registreer({ naam: "stuk", geldtVoor: async () => { throw new Error("plat"); }, laad: async () => LEEG });
		register.registreer(nepBron("dataset", true, LEEG));
		expect((await register.kies({ id: "x" })).naam).toBe("dataset");
	});

	it("geeft null als geen enkele bron van toepassing is", async () => {
		const register = maakRegister();
		register.registreer(nepBron("keten", false, LEEG));
		expect(await register.kies({ id: "x" })).toBe(null);
	});

	it("meldt een wijziging aan alle luisteraars", () => {
		const register = maakRegister();
		const luisteraar = vi.fn();
		register.opWijziging(luisteraar);
		register.meld({ berichten: [{ id: "a" }], magazijnen: [], mappen: [] });
		expect(luisteraar).toHaveBeenCalledOnce();
		expect(luisteraar.mock.calls[0][0].berichten).toHaveLength(1);
	});
});
```

- [ ] **Stap 2: Draai de tests en controleer dat ze falen**

Draai: `npm test`
Verwacht: FAIL, `Failed to resolve import "./bron.js"`

- [ ] **Stap 3: Schrijf `bron.js`**

De volgorde van registratie is de voorrang. Een bron waarvan `geldtVoor` gooit, telt als niet-van-toepassing en gaat met `console.error` naar de console — nooit stil, want dan is een kapotte bron niet te onderscheiden van een bron die niet van toepassing is.

- [ ] **Stap 4: Draai de tests en controleer dat ze slagen**

Draai: `npm test`
Verwacht: PASS, 5 tests.

- [ ] **Stap 5: Commit**

```bash
git add assets/javascript/berichtenbox/bron.js assets/javascript/berichtenbox/bron.test.js
git commit -m "➕ Bronregister voor de berichtenbox"
```

---

### Taak 5: Dataset als bron

**Files:**
- Create: `assets/javascript/berichtenbox/dataset-bron.js`
- Modify: `assets/javascript/berichtenbox.js:1629-1713` (voortgangsanimatie), `:1715-1790` (polling), `:1042-1061` (bronuitval)

**Interfaces:**
- Consumes: `Register` uit Taak 4
- Produces: `datasetBron(opties): Bron` — met `opties = { data: window.berichtenboxData, state, vlaggen }`

Deze bron is altijd van toepassing (`geldtVoor: async () => true`) en staat daarom als laatste in het register: de vangnet-bron.

Het demo-gedrag verhuist mee, want het hóórt bij deze bron. In de eindsituatie zijn de voortgangsanimatie, de binnendruppelende berichten en de gesimuleerde bronuitval eigenschappen van de dataset-bron, niet van de berichtenbox. Daarmee vervalt de noodzaak voor een `ketenActief`-vlag: een andere bron heeft dit gedrag simpelweg niet.

- [ ] **Stap 1: Lees wat er verhuist**

Draai:
```bash
sed -n '1629,1713p' assets/javascript/berichtenbox.js   # voortgangsanimatie
sed -n '1715,1790p' assets/javascript/berichtenbox.js   # polling / voegNieuwBerichtToe
sed -n '1042,1061p' assets/javascript/berichtenbox.js   # plannBronUitval
```

- [ ] **Stap 2: Schrijf `dataset-bron.js`**

```js
/**
 * De gegenereerde dataset als berichtenbron.
 *
 * Deze bron is altijd van toepassing en staat daarom achteraan in het register: hij vangt op wat
 * geen andere bron opeist. Het federatieve gedrag is hier gesimuleerd — voortgang per bron,
 * berichten die later binnendruppelen, een bron die uitvalt. Dat gedrag hoort bij déze bron; een
 * echte bron doet het echt of doet het niet. Daardoor heeft de render-laag geen vlag nodig om te
 * weten of ze te maken heeft met echte of nagebootste federatie.
 */
export function datasetBron({ data, state, vlaggen }) {
	return {
		naam: "dataset",

		geldtVoor: async () => true,

		laad: async () => ({
			berichten: data.berichten.slice(),
			magazijnen: data.magazijnen.slice(),
			mappen: data.mappen.slice(),
		}),

		start(meld) {
			// Zie stap 3 en 4.
		},
	};
}
```

- [ ] **Stap 3: Verplaats de voortgangsanimatie naar `start`**

De animatie mag de DOM aanraken — het is de enige module hier die dat doet, en dat is bewust: het is brongedrag, geen berichtenrendering. Neem `voortgangsAnimatie` letterlijk over, inclusief de `x^4`-verdeling en de binaire zoekopdracht in `aantalVoor`. De `opKlaar`-callback wordt de melding dat de bron klaar is.

- [ ] **Stap 4: Verplaats polling en bronuitval naar `start`**

`voegNieuwBerichtToe` maakt geen bericht meer in de state, maar roept `meld()` aan met de nieuwe berichtenlijst. De render-laag ziet dat als een gewone bronwijziging en hoeft niets te weten van polling.

De `ketenActief`-guard die nu bovenin `voegNieuwBerichtToe` en `startPolling` staat, vervalt: dit gedrag zit in de dataset-bron en draait dus per definitie niet als een andere bron actief is.

- [ ] **Stap 5: Controleer het gedrag in de browser**

Draai: `npm run build && npx @11ty/eleventy --serve`

Loop af op `/moza/berichtenbox/`:
1. Leeg localStorage en herlaad → de voortgangsanimatie speelt één keer
2. Herlaad → geen animatie meer
3. Zet in het Flags-paneel "Dynamische berichten" aan, ga naar `?poll=5` → er komt een bericht bij binnen vijf seconden
4. Zet de unhappy-flow-vlag aan en herlaad een paar keer → de drie scenario's ("geen", "een", "later") gedragen zich als voorheen

- [ ] **Stap 6: Commit**

```bash
git add assets/javascript/berichtenbox/dataset-bron.js assets/javascript/berichtenbox.js
git commit -m "🔁 Demo-gedrag verhuisd naar de dataset-bron"
```

---

### Taak 6: De render-laag rendert altijd zelf

**Files:**
- Modify: `assets/javascript/berichtenbox.js` (opstart, `createRij`, `renderLijstVoorView`)
- Modify: `_includes/base.njk:104-109`

**Interfaces:**
- Consumes: `Register`, `datasetBron`, `State`, `datumNL`
- Produces: `rendersLijst(berichten): void` — bouwt de tbody volledig opnieuw op

Dit is de kernwijziging. Op dit moment rendert Eleventy de rijen en past JavaScript ze aan. Hierna rendert Eleventy de rijen als no-JS-basis, en bouwt JavaScript ze bij het laden één keer opnieuw op uit de datalaag.

- [ ] **Stap 1: Zet de berichtenbox-scripts op `type="module"`**

In `_includes/base.njk`, vervang de twee berichtenbox-regels:

```html
<script type="module" src="{{ '/assets/javascript/berichtenbox.js' | url }}"></script>
```

`berichtenbox-keten.js` verdwijnt hier: die wordt in Fase 2 een module die `berichtenbox.js` zelf importeert. Laat de regel voorlopig staan als `feat/fbs-keten-koppeling` nog niet gerebased is.

- [ ] **Stap 2: Bouw de lijst op uit de datalaag**

Vervang de opstartcode onderaan `berichtenbox.js` door:

```js
const register = maakRegister();
register.registreer(datasetBron({ data: window.berichtenboxData, state, vlaggen }));

register.opWijziging((inhoud) => {
	berichten = inhoud.berichten;
	magazijnen = inhoud.magazijnen;
	mappen = inhoud.mappen;
	rendersLijst(berichten);
	werkTellersBij();
});

const bron = await register.kies(window.Personas && window.Personas.actief());
if (bron) {
	register.meld(await bron.laad());
	if (bron.start) bron.start((inhoud) => register.meld(inhoud));
}
```

**Let op:** dit is de plek waar in PR #135 een `await` de hele pagina kon stilzetten. Dat mag hier niet terugkomen. Bind daarom álle luisteraars — kebab-menu, rij-acties, sorteren, filters — *vóór* deze `await`, en laat `rendersLijst` het enige zijn wat erna gebeurt. Controleer dat expliciet in stap 4.

- [ ] **Stap 3: Laat `rendersLijst` de tbody vervangen**

```js
// De server-gerenderde rijen zijn de no-JS-basis. Draait JavaScript, dan is de datalaag de enige
// waarheid en bouwen we de rijen opnieuw op — ook voor de dataset. Eén render-pad, één bron.
function rendersLijst(berichten) {
	const lijst = document.querySelector('[data-berichtenbox-list]');
	const body = lijst && (lijst.querySelector('tbody') || lijst);
	if (!body) return;
	body.replaceChildren(...berichten.map((bericht) => createRij(bericht)));
}
```

- [ ] **Stap 4: Controleer dat niets achter de `await` hangt**

Draai: `npm run build && npx @11ty/eleventy --serve`

Open de console op `/moza/berichtenbox/` en draai:

```js
// Simuleer een bron die nooit antwoordt.
window.berichtenboxData.berichten = [];
```

Herlaad met een kunstmatige vertraging in `datasetBron.laad` (tijdelijk een `await new Promise(r => setTimeout(r, 10000))` bovenaan). Controleer tijdens die tien seconden:
1. Het kebab-menu op een rij opent en sluit
2. Sorteren op een kolomkop geeft geen console-fout
3. Het zoekveld reageert op typen

Haal de vertraging daarna weg. Werkt een van deze drie niet, dan hangt er iets achter de `await` dat er niet hoort.

- [ ] **Stap 5: Controleer zonder JavaScript**

Zet JavaScript uit in de browser en open `/moza/berichtenbox/`. De lijst moet zichtbaar zijn en een klik op een onderwerp moet naar de detailpagina gaan. Dit is de spec-eis; faalt dit, dan is de taak niet af.

- [ ] **Stap 6: Commit**

```bash
git add assets/javascript/berichtenbox.js _includes/base.njk
git commit -m "🔁 Berichtenbox rendert de lijst uit de datalaag"
```

---

### Taak 7: Filteren via de datalaag

**Files:**
- Modify: `assets/javascript/berichtenbox.js:1164-1296` (`bindInboxFilters`, `pasFilterToe`)

**Interfaces:**
- Consumes: `filterBerichten`, `paginaVan` uit Taak 3
- Produces: `pasFilterToe(): void` — filtert de berichten, rendert het resultaat

Hier verdwijnt de tweede waarheid. `pasFilterToe` loopt niet meer door de DOM maar filtert de berichten en laat `rendersLijst` het resultaat tekenen.

- [ ] **Stap 1: Herschrijf `pasFilterToe`**

```js
function pasFilterToe() {
	const criteria = {
		view: huidigeView(),
		zoek: (zoekInput ? zoekInput.value : '').trim().toLowerCase(),
		afzenders: new Set([...document.querySelectorAll('[data-afzender-check]:checked')].map((c) => c.value)),
		map: mapUitUrl(),
		magazijnToegestaan,
		persoonRelevant,
		state,
	};
	const gevonden = filterBerichten(berichten, criteria);
	const venster = paginaVan(gevonden, huidigePagina, PAGINA_GROOTTE);
	huidigePagina = venster.pagina;

	rendersLijst(venster.items);
	bouwPaginaNav(venster.totaalPaginas, document.querySelector('[data-berichtenbox-pagination]'));

	const leeg = document.querySelector('[data-berichtenbox-empty]');
	if (leeg) leeg.hidden = gevonden.length > 0;
}
```

- [ ] **Stap 2: Verwijder `pasStateToeOpRijen`**

Die functie (`berichtenbox.js:392-414`) bestond om de server-gerenderde rijen bij te werken naar de state. Nu `createRij` de state al meeneemt bij het bouwen, is ze overbodig. Verwijder de functie en alle acht aanroepen ervan.

- [ ] **Stap 3: Laat de rij-acties de datalaag bijwerken**

De handlers voor archiveren en verwijderen (`berichtenbox.js:1841-1868`) schrijven nu in `state` en roepen daarna vier render-functies aan. Vervang dat door: schrijf in de state, roep `pasFilterToe()` aan. Meer is er niet.

- [ ] **Stap 4: Controleer het gedrag in de browser**

Draai: `npm run build && npx @11ty/eleventy --serve`

Op `/moza/berichtenbox/`:
1. Typ in het zoekveld → de lijst krimpt, de paginanavigatie klopt
2. Ga naar pagina 2, typ dan in het zoekveld → je springt terug naar pagina 1
3. Archiveer een bericht op pagina 2 → de rij verdwijnt, de teller klopt
4. Filter op een map via `?map=Subsidies` → alleen die berichten
5. Zoek op iets wat niets oplevert → de lege staat verschijnt

- [ ] **Stap 5: Commit**

```bash
git add assets/javascript/berichtenbox.js
git commit -m "🔁 Filteren gebeurt op de berichten, niet meer op de DOM"
```

---

### Taak 8: Sorteren via de datalaag

**Files:**
- Modify: `assets/javascript/berichtenbox.js:974-1003` (`bindSortering`)

**Interfaces:**
- Consumes: `sorteerBerichten` uit Taak 3

`bindSortering` sorteert nu `data.berichten` *en* herordent daarna de DOM-rijen op `berichtId`. Dat tweede is niet meer nodig.

- [ ] **Stap 1: Herschrijf de sorteerhandler**

```js
lijst.tHead.addEventListener('click', (e) => {
	const btn = e.target.closest('button[data-sort]');
	if (!btn) return;

	const th = btn.closest('th');
	const oplopend = th.getAttribute('aria-sort') !== 'ascending';
	lijst.tHead.querySelectorAll('th[aria-sort]').forEach((t) => t.setAttribute('aria-sort', 'none'));
	th.setAttribute('aria-sort', oplopend ? 'ascending' : 'descending');

	berichten = sorteerBerichten(berichten, btn.dataset.sort, oplopend);
	huidigePagina = 1;
	pasFilterToe();
});
```

- [ ] **Stap 2: Controleer het gedrag in de browser**

Op `/moza/berichtenbox/`:
1. Klik op "Afzender" → alfabetisch oplopend, `aria-sort="ascending"` op die `<th>`
2. Klik nogmaals → aflopend
3. Sorteer, ga dan naar pagina 2 → de volgorde klopt door
4. Sorteer op "Datum" terwijl er een zoekterm staat → de gefilterde lijst is gesorteerd

- [ ] **Stap 3: Commit**

```bash
git add assets/javascript/berichtenbox.js
git commit -m "🔁 Sorteren op de berichten in plaats van op de rijen"
```

---

### Taak 9: Detailpagina uit de datalaag

**Files:**
- Modify: `assets/javascript/berichtenbox.js:1533-1619` (`vulDemoDetailPagina`)
- Modify: `moza/berichtenbox/bericht-demo.html`

**Interfaces:**
- Consumes: `Register` uit Taak 4

Een bericht heeft een statische detailpagina (dataset, via `bericht.njk`) of niet (dynamisch binnengekomen, straks keten). Voor het tweede geval bestaat `bericht-demo/?id=`. Die route wordt nu de algemene client-route.

- [ ] **Stap 1: Laat de client-route de bron raadplegen**

`vulDemoDetailPagina` zoekt het bericht nu in `data.berichten`. Laat die functie het bericht opvragen bij de datalaag, en — als de bron dat ondersteunt — de inhoud apart ophalen:

```js
const bericht = berichten.find((b) => b.id === id);
if (!bericht) { toonNietGevonden(); return; }

// Sommige bronnen leveren alleen kopgegevens in de lijst. Kan de bron de inhoud naleveren, dan
// halen we die hier op; anders tonen we wat we hebben.
if (!bericht.inhoud && bron && typeof bron.inhoudVan === 'function') {
	try {
		bericht.inhoud = await bron.inhoudVan(bericht.id);
	} catch (fout) {
		console.error('[Berichtenbox] Inhoud van dit bericht kon niet worden opgehaald.', fout);
		toonInhoudStoring();
		return;
	}
}
```

`inhoudVan` is optioneel in het bron-contract. De dataset-bron heeft het niet nodig — die levert de inhoud in de lijst mee. De keten-bron implementeert het in Fase 2 als:

```js
inhoudVan: async (berichtId) => {
	// De berichtenlijst levert alleen een samenvatting; `inhoud` zit per contract alleen op het
	// losse bericht. Zie "Het contract van het stelsel" onderaan dit plan.
	const respons = await fetch("/api/v1/berichten/" + encodeURIComponent(berichtId), {
		headers: { "X-Ontvanger": ontvanger },
		signal: AbortSignal.timeout(10000),
	});
	if (!respons.ok) throw new Error("bericht ophalen mislukt (" + respons.status + ")");
	return (await respons.json()).inhoud || "";
}
```

- [ ] **Stap 2: Voeg het meldingsblok toe aan `bericht-demo.html`**

Direct boven `[data-demo-body]`:

```html
<div class="feedback feedback-error" hidden data-inhoud-storing role="status">
	{% include "icon-feedback-error.njk" %}
	<div>
		<p>De inhoud van dit bericht kon niet worden opgehaald. Probeer het later opnieuw.</p>
	</div>
</div>
```

- [ ] **Stap 3: Controleer het gedrag in de browser**

Op `/moza/berichtenbox/`:
1. Zet "Dynamische berichten" aan, wacht op een binnengekomen bericht, klik erop → de detailpagina toont afzender, onderwerp, datum en inhoud
2. Open `bericht-demo/?id=bestaat-niet` → de "niet gevonden"-melding
3. Open een gewoon dataset-bericht via de lijst → de statische pagina, ongewijzigd

- [ ] **Stap 4: Commit**

```bash
git add assets/javascript/berichtenbox.js moza/berichtenbox/bericht-demo.html
git commit -m "🔁 Detailpagina haalt het bericht bij de datalaag"
```

---

### Taak 10: Opruimen en vastleggen

**Files:**
- Modify: `assets/javascript/berichtenbox.js`
- Modify: `CLAUDE.md`
- Create: `stories/BerichtenboxRij.stories.js`

- [ ] **Stap 1: Verwijder wat niemand meer aanroept**

Draai per functienaam:

```bash
grep -n "functienaam" assets/javascript/berichtenbox.js
```

Kandidaten na Taak 7 en 8: `herrenderInbox`, `herpagineerHuidigeView`, `paginer`, `bouwAfzenderFilter` — die laatste bouwt een `[data-berichtenbox-sender-panel]` dat in geen enkele template voorkomt. Verwijder wat nul aanroepen heeft.

- [ ] **Stap 2: Leg de dubbele rij-markup vast in Storybook**

`_includes/berichtenbox-row.njk` en `createRij()` moeten dezelfde HTML opleveren; dat is de prijs van de no-JS-eis. Maak `stories/BerichtenboxRij.stories.js` met beide varianten naast elkaar, zodat een afwijking zichtbaar wordt in Chromatic.

- [ ] **Stap 3: Werk `CLAUDE.md` bij**

Vervang de berichtenbox-alinea onder "Technische conventies" door een beschrijving van de datalaag: de vier modules, het bron-contract, en de regel dat de render-laag de databron nooit muteert.

- [ ] **Stap 4: Draai alles**

```bash
npm test && npm run build && npm run lint:css
```
Verwacht: alle tests slagen, build slaagt, geen stylelint-fouten.

- [ ] **Stap 5: Commit en open de PR**

```bash
git add -A
git commit -m "🧼 Opruimen na de scheiding van datalaag en rendering"
git push -u origin refactor/berichtenbox-datalaag
```

---

## Fase 2: `feat/fbs-keten-koppeling` erop rebasen

Pas uitvoeren als de PR van Fase 1 op `main` staat.

De keten wordt één implementatie van het bron-contract uit Taak 4:

```js
export function ketenBron({ demoConsole, stelsel }) {
	return {
		naam: "keten",
		geldtVoor: async (persona) => (await demoConsole.aangesloten(persona)) !== null,
		laad: async () => { /* SSE-ophaalronde plus berichtenlijst */ },
		inhoudVan: async (berichtId) => { /* berichtinhoud bij het stelsel */ },
	};
}
```

Geregistreerd vóór de dataset-bron, zodat die het vangnet blijft.

**Wat uit PR #135 blijft:** de SSE-parsing, de stiltebewaking, de cache, de foutafhandeling met vier onderscheidbare redenen, de meldingen, en `container/default.conf.template` plus `container/Containerfile` ongewijzigd.

**Wat vervalt:** `ketenOvername`, `ketenActief`, `zetLijstZichtbaar`, `herstelLijstWeergave`, `filtersGebonden`, en de guards in `bronOnbereikbaar`, `werkBronWaarschuwingBij`, `werkBronUitvalBij`, `plannBronUitval`, `startPolling` en `voegNieuwBerichtToe`. Dat is vrijwel de volledige diff van 203 regels in `berichtenbox.js`.

**Wat nieuw is:** `inhoudVan` tegen het stelsel. Het contract staat vast, zie hieronder.

---

## Het contract van het stelsel

Geverifieerd tegen `MinBZK/moza-poc-fbs-berichtenbox`, bestand
`services/berichtenuitvraag/src/main/resources/openapi/berichtenuitvraag-api.yaml`.

### Inhoud zit niet in de lijst, en dat is opzet

`BerichtSamenvatting` — het lijstitem — kent `berichtId`, `onderwerp`, `afzender`,
`publicatietijdstip`, `aantalBijlagen`, `map`, `status` en `magazijnId`. **Geen `inhoud`.**

`Bericht` — het losse bericht — heeft dat wel, plus `bijlagen[]`:

```
GET /berichten/{berichtId}      →  Bericht { ..., inhoud, bijlagen[] }
Header: X-Ontvanger
"Volledig bericht inclusief inhoud en bijlage-metadata."
```

Daarmee is `inhoudVan(berichtId)` uit Taak 9 een rechtstreekse aanroep van dit endpoint. Er is geen
omweg nodig en de lijst hoeft niet aangepast te worden aan onze kant.

### Wat we nog niet gebruiken

| Endpoint | Wat het doet | Wat wij nu doen |
|---|---|---|
| `PATCH /berichten/{berichtId}` | Zet `status` (`gelezen`/`ongelezen`) en `map`. JSON Merge Patch, RFC 7396, idempotent. | localStorage |
| `DELETE /berichten/{berichtId}` | Verwijdert het bericht | localStorage |
| `GET /berichten/_zoeken?q=` | Volledig-tekst zoeken, `q` minimaal 2 tekens | client-side filteren |
| `GET /berichten/{berichtId}/bijlagen/{bijlageId}` | Bijlage downloaden | gesimuleerd met `setTimeout` |

**Dit is een openstaande ontwerpvraag, geen taak in dit plan.** Het stelsel is eigenaar van
leesstatus, map en verwijdering; onze berichtenbox houdt die in localStorage. Voor dataset-berichten
is dat juist, voor keten-berichten niet: markeer een bericht als gelezen op de ene machine en op de
andere staat het weer ongelezen. Het bron-contract uit Taak 4 kan dit later opvangen met optionele
methoden (`markeer`, `verplaats`, `verwijder`) die de dataset-bron in localStorage afhandelt en de
keten-bron via `PATCH` en `DELETE`. Neem dat niet mee in deze twee PR's; leg het vast als
vervolgvraag.

### Paginering

`pagina` (vanaf 0) en `paginaGrootte` (maximaal 200, standaard 20). Het antwoord draagt HAL-links:
`_links.next` en `_links.prev`. Totalen ontbreken bewust — de spec zegt: *"frontend navigeert via
links zonder absolute paginavoortgang"*.

PR #135 vraagt `paginaGrootte=200` en waarschuwt bij `ruw.length >= 200`. Dat is een benadering;
het juiste signaal is de aanwezigheid van `_links.next`. Aan te passen in Fase 2.

**Achterhaald (4 september 2026):** de test-omgeving van het stelsel kapt `paginaGrootte` af op
honderd — `?paginaGrootte=200` antwoordt met honderd berichten en `_links.self` met
`paginaGrootte=100`. De client vraagt daarom honderd per pagina en bladert door op `_links.next`;
zie `assets/javascript/berichtenbox-keten.js`. De "maximaal 200" hierboven komt uit de spec en is
niet wat de omgeving doet.

### De SSE-stroom

Geverifieerd tegen `libraries/fbs-berichtensessiecache/.../berichten/MagazijnEvent.kt`. De namen die
PR #135 gebruikt kloppen exact:

| `event` | Velden |
|---|---|
| `magazijn-bevraging-gestart` | `magazijnId`, `naam?` |
| `magazijn-bevraging-voltooid` | `magazijnId`, `naam?`, `status`, `aantalBerichten` of `foutmelding` |
| `ophalen-gereed` | `totaalBerichten`, `geslaagd`, `mislukt`, `totaalMagazijnen` |
| `ophalen-fout` | `foutmelding`, `totaalMagazijnen`, `referentie` |

`status` is `OK`, `FOUT` of `TIMEOUT` — PR #135 behandelt alles wat geen `OK` is als uitgevallen,
wat klopt, maar `TIMEOUT` verdient een eigen woord in de melding.

Twee verbeteringen voor Fase 2:

1. **`ophalen-gereed` draagt de gezaghebbende tellers.** PR #135 telt zelf mee. Gebruik
   `totaalMagazijnen` als noemer van de voortgangsbalk; dan verdwijnt het effect dat de balk "5 van
   5" toont om daarna naar "5 van 9" te springen. En vergelijk de lijstlengte met `totaalBerichten`
   in plaats van met de eigen telling.
2. **De foutsemantiek staat in de spec en dekt onze aanpak.** Letterlijk: *"Zodra de SSE-stream is
   opgezet staat de HTTP-status op `200` vast; een storing daarna uit zich niet in een afwijkende
   status maar in het uitblijven van het afsluitende `OPHALEN_GEREED`-event."* De controle op
   `gereed` die in PR #135 is toegevoegd is dus precies het gedocumenteerde client-contract.

### Persona's

`GET /api/demo/personas` geeft `{ id, label, ontvanger, bron }`, met `ontvanger` als
`"<TYPE>:<WAARDE>"` en `bron` als `"keten"` of `"dataset"`. PR #135 filtert op
`bron === "keten" && ontvanger === "KVK:" + kvkNummer` — correct.

De vier nummers komen overeen met `demo/demo-console/src/main/resources/application.properties`.
Eén verschil: hun bewakingsbestand `demo/demo-console/src/test/resources/proeftuin-personas.json`
verwacht een persona met id `grootbedrijf` voor KVK 90000001, terwijl ons `_data/personas.json`
`proeftuin-veel` gebruikt. Handelsnaam en nummer kloppen wel. Hun bestand noemt het onze de
eigenaar, dus dit hoort daar rechtgezet te worden — meld het bij het FBS-team.

---

## Zelfcontrole

**Spec-dekking.** Doorgelopen tegen `docs/superpowers/specs/2026-04-13-fbs-berichtenbox-design.md`:

| Spec-eis | Waar geborgd |
|---|---|
| Eén geïntegreerde inbox | ongewijzigd |
| Federatie = gedrag (voortgang, polling, bijlagen, mappen) | Taak 5, verhuisd naar de dataset-bron |
| Zonder JS werkt de lijst | **bewust losgelaten**, zie hieronder |
| Detailpagina's via Eleventy-pagination | blijft, zie Beslissing 3 |
| Semantische HTML, tokens, logical properties | Global Constraints |
| Schrijfwijzer-afwijking (Archiveren/Verwijderen) | Global Constraints |
| Toegankelijkheid: `role="status"`, `aria-live`, toetsenbord | ongewijzigd; `aria-sort` gecontroleerd in Taak 8 stap 2 |

De eis "zonder JS werkt de lijst" is tijdens de review losgelaten. Reden: dit prototype simuleert een federatief stelsel dat berichten ophaalt bij verschillende organisaties, en die data is er niet synchroon. Een vooraf gerenderde inbox van 141 berichten uit 14 bronnen beweert dus iets wat het stelsel juist niet doet, en spreekt de voortgangsanimatie ernaast tegen. Het archief en de prullenbak renderden al geen rijen. Wie geen JavaScript heeft krijgt een `<noscript>`-blok met uitleg; de detailpagina's blijven statisch en werken wel. Vastgelegd in `CLAUDE.md`.

Eén spec-eis raakt dit plan bewust aan: sectie "Data" noemt `_data/berichtenbox.json` als enige databestand. Dat is inmiddels `_data/berichtenboxData.js` en met de keten komt er een tweede bron bij. De spec loopt daarop achter; Taak 10 stap 3 werkt `CLAUDE.md` bij, en de spec zelf hoort een korte aanvulling te krijgen.

**Placeholders.** Geen "TBD" of "voeg foutafhandeling toe". Geen openstaande onbekenden: het endpoint voor de berichtinhoud is geverifieerd tegen de OpenAPI-spec van het stelsel, zie "Het contract van het stelsel". Eén vraag is bewust buiten scope gelaten en als vervolgvraag vastgelegd: dat het stelsel eigenaar is van leesstatus, map en verwijdering, terwijl wij die in localStorage houden.

**Typeconsistentie.** `Bron` heeft in Taak 4, 5 en Fase 2 dezelfde vorm: `naam`, `geldtVoor`, `laad`, optioneel `start` en `inhoudVan`. `State` uit Taak 2 wordt in Taak 3 als `criteria.state` doorgegeven met alleen `statusVan` en `mapVan` in gebruik — de tests gebruiken daarom een minimale dubbel, geen volledige state.

---

## Acceptatiecriteria

De regressielijst staat apart in `docs/berichtenbox-regressietests.md`, zodat die na het samenvoegen
van deze PR bruikbaar blijft bij elke volgende wijziging aan de berichtenbox. Die lijst beschrijft
wat vóór de refactor werkte en dus erna nog hoort te werken: deel A wat de geautomatiseerde tests
afdekken, deel B wat handmatig nagelopen moet worden, deel C het gedrag dat bewust verandert.
