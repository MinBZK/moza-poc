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
5. **Eenvoudigst mogelijke oplossing**; HTML en CSS waar het kan, JavaScript waar het moet. Platform boven framework.
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
- Persona's (testaccounts): `_data/personas.json` + `assets/javascript/personas.js`. Wisselbaar via Flags-paneel of `?persona=`-URL-param. localStorage-key: `persona`. Debug-API: `window.Personas`
- Digitale Assistent, sessie-identiteit: de chat stuurt `X-Test-User` mee; de backend leidt daaruit het KvK-nummer af. Het token per persona komt uit de build-env `MOZA_TEST_USERS` (`{"koffiezaak": "<token>"}`, via `_data/testUsers.js` → `window.MOZA_TEST_USERS`) of uit het Flags-paneel (`setting:test-user-token`, wint). Op deployments loopt dat via het gelijknamige repo-secret → `build-args` in de workflows → `ARG MOZA_TEST_USERS` in de Containerfile; het token is daar leesbaar in de paginabron, dus het is een demo-credential, geen echte beveiliging. **Nooit tokens in de repo** — deze repo is publiek. Persona's met een backend-profiel: `koffiezaak` (85234567), `bloemenkweker` (62345681), `haarstylist` (56789012); de rest hoort "log eerst in" te krijgen. Lokaal: `MOZA_TEST_USERS='{"koffiezaak": "<token>", …}' npm run dev` met aan de backend `TEST_USERS=<token>:85234567,…`; zonder overeenkomende tokens antwoordt elke vraag "log eerst in"

## Git

- **Commits altijd ondertekenen.** Deze repo gebruikt SSH commit-signing (`commit.gpgsign=true`, `gpg.format=ssh`) zodat commits in GitHub als "Verified" verschijnen. Commit nooit met `--no-gpg-sign` of `-c commit.gpgsign=false`. Lukt ondertekenen niet (bijvoorbeeld geen key-agent beschikbaar), maak de commit dan niet zelf — meld het en laat de gebruiker committen vanuit een omgeving waar de signing-key wél beschikbaar is.
- Commitberichten volgen de emoji-conventie uit `README.md` (➕ Added, ✏️ Modified, ❌ Deleted, 🧼 Hygiene, 🐛 Bugfix, 🔁 Renamed).

## Volledig referentie

- Ontwerp-principes: `ontwerp-principes.md`
- Schrijfwijzer: `stories/Schrijfwijzer.mdx`
- Storybook documentatie: `stories/OverDitPrototype.mdx`
- Ontwerppatronen: `stories/InteracterenOpInhoud.mdx`, `stories/ContextWisselen.mdx`
