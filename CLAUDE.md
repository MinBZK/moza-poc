# CLAUDE.md — MOZa projectrichtlijnen

Dit bestand wordt automatisch geladen bij elke Claude Code-sessie. Het bevat de kernregels uit de ontwerp-principes en schrijfwijzer zodat alle wijzigingen aan het prototype consistent zijn.

## Project

MijnOverheid Zakelijk (MOZa) is een HTML/CSS/JS prototype gebouwd met Eleventy en gedocumenteerd in Storybook. Geen frameworks, geen preprocessors. De code is het ontwerp.

- Prototype: `moza/` (zakelijk) en `mobu/` (burger)
- Storybook stories: `stories/`
- Styling: `style/style.css` (gebruik altijd toepassingstokens uit _toepassing.css, nooit opties rechtstreeks uit _rijkshuisstijl.css)
- Design tokens: `tokens/tokens.json` → Style Dictionary aangevuld met sd-transforms → CSS custom properties
- JavaScript: `assets/javascript/`
- Includes: `_includes/`
- Data (persona's, subsidies, regelgeving, berichtenbox): `_data/`
- Build output: `_site/` (niet handmatig bewerken)

## Ontwerp-principes (kernregels)

1. **Semantische HTML eerst**; gebruik de juiste elementen (`<button>`, `<nav>`, `<fieldset>`, `<h1>`–`<h6>`). ARIA alleen waar HTML niet volstaat. Gebruik `<dl>`/`<dt>`/`<dd>` voor sleutel-waardeparen (gegevensoverzichten), niet `<table>`.
2. **Toegankelijkheid altijd**; toetsenbordnavigatie, `:focus-visible`, `aria-current`, `aria-disabled` (niet `disabled`). Labels boven invoervelden, niet ernaast (WCAG 1.4.10 Reflow). Test met diverse invoer- (toetsenbord, spraak) en uitvoermethoden (screenreader, braille).
3. **CSS logical properties**; gebruik `inline-size`, `block-size`, `margin-block-start`, `padding-inline` etc. Nooit `width`, `height`, `margin-top`, `padding-left`.
4. **Design tokens**; gebruik altijd `--toepassing-*` variabelen, nooit `--rijkshuisstijl-*` of hardcoded waarden.
5. **Eenvoudigst mogelijke oplossing in de interface-laag**; HTML en CSS waar het kan, JavaScript waar het moet, platform boven framework. Dit geldt voor wat de gebruiker in de browser voor zich krijgt, niet voor de laag eromheen zoals build-scripts, datatransformaties, backend-koppelingen en testopstellingen.
6. **Spacing**; gebruik `> * + *` met margin voor content flow, `gap` met flex/grid voor component-layouts. Nooit beide tegelijk op dezelfde container.
7. **Feature flags**; gebruik `data-feature="Naam"` en `data-feature-type="pagina|functionaliteit"` om elementen togglebaar te maken. Features die standaard uit staan krijgen `data-feature-default="off"`.

## Schrijfwijzer (kernregels)

### Aanspreking en toon

- Spreek de gebruiker aan met **"u"** en **"uw"**, nooit "je" of "jij"
- Genderneutraal: gebruik "die" of "diegene" als verwijswoord, niet "hij", "zij" of "hij/zij"
- Formeel maar toegankelijk, B1-taalniveau
- Actief boven passief: "Bekijk uw gegevens" niet "Uw gegevens kunnen bekeken worden"

### Terminologie

- Bewaar (niet Opslaan, Favoriet)
- Niet relevant (niet Verbergen, Verwijderen)
- Deel (niet Verstuur, Doorsturen)
- Berichten / Berichtenbox (niet Post, E-mail, Inbox)
- Bedrijfsgegevens (niet Gegevens, Profiel)
- Lopende zaken (niet Taken, Dossiers)
- Actualiteiten (niet Nieuws, Updates, Feed)
- Opslaan (formulieren), Annuleren (formulieren afbreken)

### Notatie

- Datums: dag maandnaam jaar (12 februari 2018), volledige maandnaam
- Datum gevolgd door een beschrijving: scheid met een dubbele punt — "19 februari 2026: De Stationsweg is afgesloten."
- Scheiding in lopende tekst: standaard de komma. Bevat de zin al komma’s waardoor die onoverzichtelijk wordt, gebruik dan een puntkomma (voor volledige, nauw samenhangende zinnen of komma-rijke opsommingen). De gedachtestreep (—) alleen als uiterste middel, voor extra nadruk op een ingevoegd of slot-zinsdeel
- Typografische aanhalingstekens in lopende tekst: “dubbel” en ‘enkel’, ook in samentrekkingen (mkb’er, zzp’er, komma’s)
- Rechte quotes alleen in code en HTML-attributen
- Kopteksten als zelfstandige naamwoorden, geen punt aan het einde

### Microcopy

- Knopteksten kort en werkwoord-gericht: "Opslaan", "Annuleren", "Inloggen"
- Lege staten: benoem wat er nog niet is én geef een suggestie wat te doen
- Foutmeldingen: constructief en handelingsgericht, benoem wat nodig is

## Technische conventies

- Nunjucks includes voor herhalende patronen (`_includes/`)
- `action-group.njk` voor de actiegroep (Bewaar, Deel, Relevant/Niet relevant)
- De `.visually-hidden` span in action-group wordt automatisch gevuld door JS op basis van de heading
- Reserve-topics: `<li hidden class="reserve-topic">` schuiven door bij het verbergen van items
- Animaties bij verbergen/herstellen: `.remove-item` (fade naar beneden) en `.restore-item` (fade naar boven)
- Accountwisselaar staat achter feature flag `data-feature-default="off"`
- Pagina-layout: `body` is een flex column met `min-block-size: 100dvh`, `<main>` heeft `flex: 1` zodat `<footer>` altijd onderaan staat
- Lege dynamische containers: geef ze `class="dynamic-list"` zodat ze via `.dynamic-list:empty { display: none }` uit de layout vallen tot er items zijn
- Berichtenbox, datalaag en rendering gescheiden: `assets/javascript/berichtenbox/` bevat vijf modules zonder DOM-kennis — `datum.js` (datumnotatie), `state.js` (localStorage-state en de vragen daarover), `lijst.js` (filteren, sorteren, pagineren als pure functies), `bron.js` (bronregister) en `dataset-bron.js` (de gegenereerde dataset als bron, inclusief het nagebootste federatieve gedrag: de ophaalanimatie bij het eerste bezoek en de binnendruppelende berichten). `berichtenbox.js` is de render-laag: die leest uit de datalaag en muteert de bron nooit. Een bron is `{ naam, geldtVoor(persona), laad(), start?(meld), inhoudVan?(berichtId) }`; de volgorde van registreren is de voorrang en de dataset-bron staat achteraan als vangnet. Één weg naar het scherm: `toonBerichten()` filtert de berichten, neemt het paginavenster en bouwt die rijen. De inbox rendert geen rijen vooraf: de tbody begint leeg en wordt gevuld uit de datalaag, net als het archief en de prullenbak. Dat is een bewuste afwijking van principe 5 (HTML waar het kan): dit prototype simuleert een federatief stelsel dat berichten bij verschillende organisaties ophaalt, en die zijn er per definitie niet synchroon. Vooraf een volledige lijst renderen zou beweren dat ze dat wél waren — precies wat de voortgangsanimatie tegenspreekt. Wie geen JavaScript heeft krijgt een `<noscript>`-blok dat dat uitlegt; de detailpagina's zijn statisch en werken wel. `_includes/berichtenbox-row.njk` blijft in gebruik voor het voorproefje van vijf berichten op de homepage. De scripts zijn ES-modules (`type="module"` in `_includes/base.njk`), als enige in dit project. Let op: modulescripts draaien ná álle klassieke `defer`-scripts, niet op hun plek in de documentvolgorde. Meldingen aan de bezoeker lopen via één blok per pagina, `[data-berichtenbox-storing]`, dat op elke berichtenbox-pagina staat — ook op de detailpagina's. Het blok van de gesimuleerde bronuitval (`[data-geen-bronnen]`, `[data-bron-onbereikbaar]`) is daar níet voor: dat hoort bij de unhappy-flow-vlag en staat alleen op de inbox.
- Berichtenbox, Federatief Berichtenstelsel: `assets/javascript/berichtenbox-keten.js` is de transportlaag — het vraagt de demo-omgeving of de actieve persona aangesloten is (`/api/demo/personas`), draait de ophaalronde (`/api/v1/berichten/_ophalen`, SSE) en haalt de lijst op (`/api/v1/berichten`). Geen DOM, op één plek na: `paginaStartRonde` kijkt of dit de inbox is, want dat bepaalt óf er opgehaald wordt. `assets/javascript/berichtenbox/keten-bron.js` maakt daar een bron van en staat vóór de dataset-bron in het register; de render-laag weet niet welke bron levert. `geldtVoor` wacht de ronde af — eerder antwoorden zou de dataset-bron de aangesloten persona laten opeisen. Mislukt de ronde voor iemand die aantoonbaar aangesloten is, dan blijft de keten de bron en werpt `laad`: geen stille terugval, want verzonnen berichten tussen echte zijn niet te onderscheiden. Meldingen van de keten lopen langs `meldStoring` naar hetzelfde `[data-berichtenbox-storing]` als alle andere; een onvolledige lijst is `info`, een mislukte ronde is `storing`. Het broncontract heeft daarvoor twee optionele leden: `volgVoortgang(kijker)` — meldt `{ bevraagd, klaar, gevonden }` of `null` als er niets meer te melden valt — en `herhaalOphalen(klaar)`, waarmee de render-laag om een nieuwe ronde vraagt na een hersteld magazijn of een verruimd organisatiefilter. De dataset-bron implementeert allebei met de nagebootste ophaalronde; die verzint aankomsttijden per bron en eindigt op de aantallen die de bezoeker daarna écht ziet, dus krijgt hij `zichtbaarheid` (`statusVan`, `magazijnDoorOrgFilter`, `magazijnToegestaan`, `persoonRelevant`) en `magAnimeren` mee. In `.finally` start het brongedrag vóór `naEersteLading()`: andersom onthult die de lijst een tel voordat de ronde hem weer wegneemt. De voortgang van de ronde komt uit `volgVoortgang` op de bron; de render-laag abonneert zich vóór de bronkeuze, want `geldtVoor` wacht de ronde af en daarna valt er niets meer te tonen. De balk verschijnt pas als de ronde langer dan 300 ms duurt (`VOORTGANG_DREMPEL_MS`): lokaal duurt een ronde ongeveer een tiende seconde, en die even laten oplichten leest als een storing. Zolang de keten levert staat de nabootsing uit: geen gesimuleerde bronuitval, geen ophaalanimatie, geen binnendruppelende berichten (`simulatieMag()` in `berichtenbox.js`). Berichten uit de keten dragen `uitKeten: true` en linken naar `bericht-demo/?id=`, want gegenereerde detailpagina's bestaan alleen voor de dataset. Het script draait klassiek en `defer`, vóór de module, zodat de ronde zo vroeg mogelijk start. Berichten uit de keten komen **niet** in `localStorage`: wat eerder opgehaald is staat op de server, in een sessiecache per ontvanger (schuivende TTL van 12 uur). Elke berichtenbox-pagina draait daarom zijn eigen ronde — ook het archief, de prullenbak en een detailpagina. Dat kan niet anders: `GET /api/v1/berichten` geeft per bericht het OIN van de organisatie, en de naam komt alleen uit de ophaalronde zelf. Runtime-vars: `BACKEND_KETEN` (valt terug op `BACKEND_ORIGIN`), `BACKEND_DEMO` (valt terug op `BACKEND_KETEN`) en, achter een gedeelde ingress, `BACKEND_KETEN_HOST` / `BACKEND_DEMO_HOST`. De ontvanger gaat mee als header `X-Ontvanger` (`KVK:<nummer>`). Testpersona's: `proeftuin-een` (90000011), `proeftuin-twee` (90000012), `proeftuin-drie` (90000013), `proeftuin-veel` (90000001). Let op: dit is **geen authenticatie** — de header is in de browser aan te passen, dus het stelsel moet zijn eigen allowlist hanteren; zelfde afweging als bij `X-Test-User`

- Tests: `npm test` (Vitest) draait de tests in `tests/`. Bewust niet naast de bron, omdat `.eleventy.js` de hele `assets`-map ongefilterd naar `_site` kopieert. `tests/berichtenbox/dom.js` bouwt een minimale berichtenbox-pagina voor de jsdom-tests van de render-laag.
- Berichtenbox-state hoort bij één persona. `maakState(opslag, persona)` schrijft de actieve persona in de bewaarde staat en gooit een staat van iemand anders weg — tussen persona's bestaat geen verband, het zijn andere bedrijven met andere post. Dat geldt ook voor `eersteBezoekGehad`, dus elke persona krijgt de ophaalanimatie één keer. Een staat zonder persona komt uit een oudere versie en verdwijnt zodra er wél een persona is; draait er geen `personas.js`, dan blijft hij staan. Onleesbare opslag wordt nooit overschreven, ook niet om er een persona in te zetten. Het markeren vanaf de homepage (`leesGedeeldeState` in `berichtenbox.js`) hanteert dezelfde regel.
- Wisselen van persona wist de opgeslagen gegevens van de vorige. `personas.js` doet dat bij elke paginalading — dus ook bij `?persona=`, dat niets opschrijft en langs een hook op de wisselaar heen zou glippen — door de herkomst in `persona:gegevens-van` te vergelijken met de actieve persona. Gewist worden `berichtenbox`, `berichtenbox-keten` (opruimwerk: die sleutel wordt niet meer geschreven maar staat nog in oudere browsers), `hidden:`, `read:`, `favorite:`, `dismissed:`, `unread:count` en de sessionStorage-sleutel `berichtenbox-bron-uitval`. Vlaggen (`feature:`) en instellingen (`setting:`) blijven staan: dat is gereedschap van wie het prototype bekijkt, geen gegevens van een bedrijf. `personas.js` staat in `base.njk` daarom vóór `content-interactions.js` — anders leest die nog één keer wat er van iemand anders stond.
- Persona's (testaccounts): `_data/personas.json` + `assets/javascript/personas.js`. Wisselbaar via Flags-paneel of `?persona=`-URL-param. localStorage-key: `persona`. Debug-API: `window.Personas`
- Digitale Assistent, sessie-identiteit: de chat stuurt het `kvkNummer` van de actieve persona mee in de header `X-Test-User` (`getTestUser()` in `digitale-assistent.js`, als string zodat een voorloopnul niet wegvalt); het Flags-paneel kan het forceren via `setting:test-user-kvk`. De backend toetst het aan zijn allowlist `TEST_KVK_NUMMERS` en injecteert het server-side bij elke bronaanroep; `kvk_nummer` staat niet in de tool-schema's, dus het model kan de identiteit niet kiezen. Geen build-variabele, geen repo-secret, geen build-arg aan deze kant — alleen `TEST_KVK_NUMMERS=85234567,62345681,56789012` op de backend. Persona's met een backend-profiel: `koffiezaak` (85234567), `bloemenkweker` (62345681), `haarstylist` (56789012); de rest hoort "log eerst in" te krijgen, als gewoon `answer`-event en niet als foutmelding. Let op: dit is **geen authenticatie** — de header is in de browser aan te passen, wat voor een gesloten testgroep met fictieve data aanvaardbaar is (echte inlog is BETA-02)

## Git

- **Commits altijd ondertekenen.** Deze repo gebruikt SSH commit-signing (`commit.gpgsign=true`, `gpg.format=ssh`) zodat commits in GitHub als "Verified" verschijnen. Commit nooit met `--no-gpg-sign` of `-c commit.gpgsign=false`. Lukt ondertekenen niet (bijvoorbeeld geen key-agent beschikbaar), maak de commit dan niet zelf — meld het en laat de gebruiker committen vanuit een omgeving waar de signing-key wél beschikbaar is.
- Commitberichten volgen de emoji-conventie uit `README.md` (➕ Added, ✏️ Modified, ❌ Deleted, 🧼 Hygiene, 🐛 Bugfix, 🔁 Renamed).

## Volledig referentie

- Ontwerp-principes: `ontwerp-principes.md`
- Schrijfwijzer: `stories/Schrijfwijzer.mdx`
- Storybook documentatie: `stories/OverDitPrototype.mdx`
- Ontwerppatronen: `stories/InteracterenOpInhoud.mdx`, `stories/ContextWisselen.mdx`
