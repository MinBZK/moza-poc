# MOZa proof of concept prototype

Zie [Ontwerpprincipes](ontwerp-principes.md) voor de ontwerpprincipes, technische keuzes en relevante onderzoeken die ten grondslag liggen aan dit prototype.

## Omgeving installeren

Clone deze repository lokaal.

### Vereisten

- [Node.js](https://nodejs.org/en/download)
- [npm](https://www.npmjs.com/)

---

## Statische site-generator installeren

[Eleventy](https://www.11ty.dev/) wordt gebruikt om herhalende componenten zoals headers en footers als includes te beheren. Installeer Eleventy in de root van het project:

``` bash
npm install @11ty/eleventy
```

### Pagina's bouwen

Om de HTML pagina's te bouwen voer je dit commando uit vanuit de root van het project:

``` bash
npx @11ty/eleventy
```

De gebouwde pagina's worden in de map `_site` geplaatst.

### Lokaal bekijken

Start een lokale server met live reload:

``` bash
npx @11ty/eleventy --serve
```

De site is vervolgens te bekijken op [`localhost:8080`](http://localhost:8080).

### Includes

Herhalende componenten staan in de `_includes` map:

| Bestand | Beschrijving |
| ------- | ------------ |
| `base.njk` | Basis layout |
| `header-rijksoverheid.njk` | Rijksoverheid header met logo en navigatie |
| `header-overheid.njk` | Overheid header header met logo |
| `footer-overheid.njk` | Overheid footer |
| `side-nav-overheid.njk` | Overheid hoofdnavigatie |
| `action-group.njk` | Actiegroep onder een topic (Bewaar, Deel, Niet relevant) |

Elke pagina selecteert diens layout en opties bovenaan het bestand:

``` yaml
---
layout: base.njk
title: "Pagina titel"
headerType: overheid
footerType: overheid
---
```

---

## Design tokens

Design tokens zijn ontwerp-waarden — zoals kleuren, typografie, maatvoering — opgeslagen in een platformonafhankelijk formaat (JSON). Ze vormen een gedeelde taal tussen ontwerp en ontwikkeling: in plaats van bijvoorbeeld losse hex-codes of pixelwaarden door te geven, verwijzen beide disciplines naar dezelfde bron. Hierdoor blijven ontwerp en code altijd synchroon en is een wijziging op één plek (bijvoorbeeld een merkkleur) direct overal doorgevoerd.

Het bestand `tokens/tokens.json` is de *single source of truth* voor alle ontwerp-waarden én toepassingen (kleur, typografie, spacing, etc.). Dit bestand is in twee richtingen te bewerken:

- **Figma** — via de [Tokens Studio](https://docs.tokens.studio/) plugin kunnen ontwerpers tokens ophalen, aanpassen en terugschrijven naar Git.
- **IDE** — ontwikkelaars kunnen het JSON-bestand ophalen, aanpassen en terugschrijven naar Git in een code-editor.

### Style Dictionary

Om de design tokens te vertalen naar CSS variabelen wordt [Style Dictionary](https://styledictionary.com/) gebruikt.

1. [Installeer Style Dictionary](https://styledictionary.com/getting-started/using_the_cli/#installation) in `/style-dictionary`, deze vertaald design tokens naar CSS variabelen
1. [Instaleer SD-Transforms](https://www.npmjs.com/package/@tokens-studio/sd-transforms#installation) in `/style-dictionary`, dit is een pakketje met extra transformatie-opties die nodig zijn om design tokens uit Figma [Tokens Studio](https://docs.tokens.studio/) te vertalen

De pipeline ziet er zo uit:

Figma met Tokens Studio óf IDE → tokens/tokens.json → Style Dictionary + SD-Transforms → CSS variabelen → Stylesheet (style.css)

Style Dictionary leest `tokens.json` en transformeert de tokens naar CSS custom properties. Omdat Tokens Studio een eigen tokenformaat hanteert dat afwijkt van het [standaard Design Token Community Group (DTCG) formaat](https://www.designtokens.org/tr/2025.10/format/), wordt [SD-Transforms](https://www.npmjs.com/package/@tokens-studio/sd-transforms) als aanvulling gebruikt. Dit zorgt onder andere voor het correct oplossen van tokenreferenties, het omrekenen van `px` naar `rem` waarden en het omzetten van namen naar ‘*kebab-case*’.

Het resultaat wordt opgesplitst in twee automatisch gegenereerde CSS-bestanden:

- **`_rijkshuisstijl.css`** — bevat de waarden uit de Rijkshuisstijl: het kleurenpalet, typografie-instellingen, maatvoering, etc. Dit zijn de beschikbare *opties*.
- **`_toepassing.css`** — bevat semantische variabelen die verwijzen naar de Rijkshuisstijl-waarden en daar een concrete betekenis aan geven, bijvoorbeeld `--color-text-default` of `--button-primary-background-color`. Dit zijn de *toepassingen* van de opties.

Gebruik in stylesheets en componenten altijd variabelen uit `_toepassing.css` en nooit rechtstreeks uit `_rijkshuisstijl.css`. De Rijkshuisstijl-variabelen zijn de bouwstenen; de toepassingsvariabelen bepalen *hoe* die bouwstenen worden ingezet. Door deze scheiding kan een Rijkshuisstijl-waarde wijzigen zonder dat stylesheets aangepast hoeven te worden — de toepassingslaag vangt de verandering op.

Beide bestanden worden automatisch gegenereerd en mogen niet handmatig bewerkt worden. Alle wijzigingen aan ontwerp-waarden horen thuis in `tokens/tokens.json`.

### Design tokens vertalen naar CSS variabelen

Gebruik dit commando om design tokens handmatig naar CSS variabelen om te zetten:

``` bash
npm run tokens
```

Dit resulteert in wijzigingen in de CSS variabelen bestanden. Deze worden automatisch geïmporteerd in de globale `style.css` style sheet.

Bij het gebruik van `npm run dev` worden design tokens automatisch opnieuw gebouwd wanneer `tokens/tokens.json` wijzigt.

---

## Digitale Assistent

De chat-UI van de Digitale Assistent zit in dit prototype (`moza/digitale-assistent.html` + `assets/javascript/digitale-assistent.js`). De **backend** — een FastAPI-host die twee LLM-backends (VLAM en Claude) combineert met overheidsbronnen via MCP of CLI — leeft in een eigen repo en draait standalone:

[![backend: moza-poc-digitale-assistent](https://img.shields.io/badge/backend-moza--poc--digitale--assistent-blue?logo=github)](https://github.com/MinBZK/moza-poc-digitale-assistent)

→ **<https://github.com/MinBZK/moza-poc-digitale-assistent>**

### Verbinden met de backend

De chat praat over HTTP met de backend. De backend-URL wordt via `window.MOZA_CHAT_API` gezet en is per omgeving instelbaar met de build-variabele `MOZA_CHAT_API` (Eleventy-data `_data/chatApi.js` → `_includes/base.njk`):

| `MOZA_CHAT_API` | Resultaat |
| --------------- | --------- |
| niet gezet | `http://localhost:8000` (lokale backend, dev) |
| `""` | relatief, zelfde origin (reverse proxy) |
| `https://…` | expliciete backend-URL (cross-origin; vereist `ALLOWED_ORIGINS` in de backend) |

In de container-build geef je dit mee als `--build-arg MOZA_CHAT_API=…` (default leeg = relatief).

Lokaal end-to-end draaien:

1. Start deze frontend met `npm run dev` — Eleventy `--serve` met live reload op [`localhost:8080`](http://localhost:8080).
2. Start de backend volgens de instructies in de [backend-repo](https://github.com/MinBZK/moza-poc-digitale-assistent) (FastAPI, poort `8000`).
3. Zorg dat de backend de frontend-origin toelaat: `ALLOWED_ORIGINS=http://localhost:8080`.

> Voor losse demo's van de CLI-tools (`kvk-cli`, `koop-cli`, …) gebruik je de backend-repo; die bevat de standalone bash-tools.

### API-sleutels

Gebruikers kunnen hun eigen VLAM- en Claude-sleutel invullen via het feature-flags-paneel rechtsonder in de site. Deze worden per request als `X-VLAM-API-Key` / `X-Claude-API-Key` header naar de backend meegestuurd. Dit werkt zolang de backend `ALLOW_API_KEY_OVERRIDE=true` heeft (PoC-default); lege velden vallen terug op de server-side keys uit de backend-`.env`.

### Containerisatie

De `container/Containerfile` bouwt de statische site (frontend-only): een Node-builder genereert de Eleventy-site en Storybook, en een nginx-image serveert die op poort 8080. Diezelfde nginx doet een **same-origin reverse proxy**: `/chat`, `/chat/stream`, `/health` en `/tools` gaan naar de backend op `BACKEND_ORIGIN` (runtime instelbaar via env, default `127.0.0.1:8000`). Zo is er geen CORS nodig — de browser praat alleen met deze origin en `window.MOZA_CHAT_API` blijft leeg (`""`). De Digitale-Assistent-backend draait apart (zie [Digitale Assistent](#digitale-assistent)); dezelfde image wordt gebruikt voor preview- en productiedeploys (ZAD).

``` bash
docker build -f container/Containerfile -t moza .
docker run --rm -p 8080:8080 -e BACKEND_ORIGIN=host.docker.internal:8000 moza
```

---

## Storybook

[Storybook](https://storybook.js.org/) is de omgeving om afzonderlijke componenten te bekijken, testen en documenteren.

### Lokaal opstarten

``` bash
npm run storybook
```

Storybook is vervolgens te bekijken op [`localhost:6006`](http://localhost:6006).

### Automatisch bouwen

Bij het gebruik van `npm run dev` wordt Storybook automatisch opnieuw gebouwd naar `_site/storybook` wanneer bestanden in `stories/` of `style/style.css` wijzigen. Dit gebeurt via [chokidar](https://www.npmjs.com/package/chokidar-cli) die het `build-storybook` script triggert bij elke wijziging.

### Stories

De stories staan in de `stories/` map. Elk bestand beschrijft één component en toont varianten, bijvoorbeeld:

| Bestand | Beschrijving |
| ------- | ------------ |
| `Knop.stories.js` | Knopvarianten (primair, secundair, negatief) |
| `Link.stories.js` | Linkvarianten |
| `Tekstinvoer.stories.js` | Tekstinvoervelden |
| `Selectie.stories.js` | Selectievakjes en keuzerondjes |
| `Feedback.stories.js` | Notificaties en foutmeldingen |
| `Navigatie.stories.js` | Navigatiecomponenten |
| `Typografie.stories.js` | Koppen en tekststijlen |
| `Tabel.stories.js` | Tabelopmaak |

---

### NPM scripts

Installeer dependencies in de root van het project:

``` bash
npm install
```

| Script | Commando | Beschrijving |
| ------ | -------- | ------------ |
| `npm run dev` | Eleventy serve + token watcher | Beide parallel via `concurrently`. Eleventy `--serve` met live reload op [`localhost:8080`](http://localhost:8080); de chat-backend draai je apart (zie [Digitale Assistent](#digitale-assistent)). |
| `npm run build` | Tokens + Eleventy | Volledige productie-build |
| `npm run tokens` | Alleen Style Dictionary | Handmatig tokens bouwen |
| `npm run storybook` | Storybook dev server | Componentenbibliotheek lokaal bekijken |
| `npm run build-storybook` | Storybook productie-build | Statische Storybook-site bouwen |

---

## Structuur

``` text
📂 _data                    Eleventy-data: persona's, subsidies, regelgeving, berichtenbox
📂 _includes                herhalende consistente elementen die in meerdere pagina's toegegepast worden
📂 _site                    statische site gegenereerd door Eleventy.js
📂 assets
    📁 favicon              favicons voor diverse platformen
    📁 fonts                Rijkslettertype webfonts
    📁 icons                iconen
    📁 images               afbeeldingen
    📁 javascript           interactielogica per pagina-type (personas, content-interactions, berichtenbox, etc.)
📂 container                Containerfile + nginx-config voor de statische site-deployment
📂 mobu                     prototype voor MijnOverheid Burger
📂 moza                     prototype voor MijnOverheid Zakelijk, gebaseerd op deze omgeving
📂 stories                  'stories' om componenten weer te geven in Storybook
📂 style
    📄 _reset.css           cross-browser stijl normalisatie
    📄 _rijkshuisstijl.css  opties uit de Rijkshuisstijl
    📄 _toepassing.css      semantische toepassing van de opties uit de Rijkshuisstijl
    📄 style.css            algemene CSS styling
📁 style-dictionary
    📄 config.json          configuratiebestand voor Style Dictionary
📁 tokens
    📄 tokens.json          design tokens JSON bestand
📄 .stylelintrc.json        Stylelint-config (logical properties, alfabetische volgorde, spacing-regels)
📄 index.html               homepagina van het MijnOverheid Zakelijk prototype
📄 package.json             build dependencies
📄 package-lock.json        locked dependency versions
📄 README.md                dit bestand

```

## CSS conventies

### CSS patronen

Deze omgeving maakt gebruik van moderne CSS-features:

- **CSS nesting** voor o.a. component-staten en varianten
- **CSS custom properties** (variabelen) voor alle ontwerp-waarden
- **`:focus-visible`** (niet `:focus`) voor toetsenbordfocus-indicatoren
- **`aria-disabled`** en **`aria-invalid`** [ARIA](https://www.w3.org/TR/wai-aria/) attributen voor staten (niet `:disabled`)

### Variabele naamgeving

Gegenereerde variabelen volgen ‘kebab-case’ met een semantische hiërarchie:

``` text
--prefix-categorie-optionelesubcategorie-attribuut--optionelestaat
```

Voorbeelden:

- `--rijkhuisstijl-color-lintblauw-50`
- `--toepassing-button-primary-background-color`

### Logical properties

In de stylesheets worden [CSS ‘logical’ properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values) gebruikt in plaats van ‘physical’ properties. Logical properties passen zich automatisch aan op basis van de schrijfrichting (`direction`) en schrijfmodus (`writing-mode`), wat de CSS toekomstbestendig en beter geschikt maakt voor meertalige ondersteuning.

Voorbeelden van physical properties en hun logical equivalenten:

| Physical | Logical |
| ------ | ------- |
| `width` | `inline-size` |
| `height` | `block-size` |
| `max-width` | `max-inline-size` |
| `min-height` | `min-block-size` |
| `margin-top` / `margin-bottom` | `margin-block-start` / `margin-block-end` |
| `margin-left` / `margin-right` | `margin-inline-start` / `margin-inline-end` |
| `padding-top` / `padding-bottom` | `padding-block-start` / `padding-block-end` |
| `padding-left` / `padding-right` | `padding-inline-start` / `padding-inline-end` |
| `border-top` / `border-bottom` | `border-block-start` / `border-block-end` |

---

## Git commit berichten

`Initial commit`
Initiële commit, een eerste versie die in de bestandsgeschiedenis geplaatst wordt.

`➕ Added`
Toevoeging(en) aan een bestand.

Voorbeeld: `➕ Link component`

`✏️ Modified`
Wijziging(en) aan een bestand.

Voorbeeld: `✏️ Kleur van :hover staat primaire knop`

`❌ Deleted`
Verwijdering van (iets in) een bestand.

Voorbeeld: `❌ contactpagina.html verwijderd`

`🧼 Hygiene`
Kleine aanpassing, fix.

Voorbeeld: `🧼 padding-inline-start → padding-inline`

`🐛 Bugfix`
Herstel van een bug.

Voorbeeld: `🐛 footer include werd niet getoond`

`💾 Backup`
Back-up van een bestand voordat grote wijzigingen plaatsvinden.

Voorbeeld: `💾 backup 2026-03-18 voorafgaand aan wijzigingen voor gebruikersonderzoeken`

`🔁 Renamed`
Hernoeming van (iets in) een bestand.

Voorbeeld: `🔁 contact-pagina.html hernoemd naar comntact.html`

`↩️ Revert commit`
Wijziging(en) in een vorige commit die ongedaan gemaakt worden.

Voorbeeld: `↩️ wijzigingen van vorige commit ongedaan gemaakt omdat deze performance issues veroorzaakte`

`🔀 IDE ↔︎ Figma`
Twee-wegverkeer tussen IDE en Figma, met name om design tokens in beide omgevingen te kunnen aanpassen en testen (Style Dictionary → CSS variabelen en Figma Tokens Studio)

Voorbeeld: `🔀 tokens voor knoppen aangepast in Figma`
