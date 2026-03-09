# MOx design systeem

## MOx omgeving installeren

1. Clone deze repository lokaal
2. Installeer dependancies met `npm i`

## Eleventy installeren

[Eleventy](https://www.11ty.dev/) wordt gebruikt om herhalende componenten zoals headers en footers als includes te beheren. Installeer Eleventy in de root van het project:

``` bash
npm install @11ty/eleventy
```

### Pagina's bouwen

Om de HTML pagina's te bouwen voer je dit commando uit vanuit de root van het project:

``` bash
npx @11ty/eleventy
```

De gebouwde pagina's worden in de `_site` map geplaatst.

### Lokaal bekijken

Start een lokale server met live reload:

``` bash
npx @11ty/eleventy --serve
```

De site is vervolgens te bekijken op `http://localhost:8080`.

### Includes

Herhalende componenten staan in de `_includes` map:

| Bestand | Beschrijving |
| ------- | ------------ |
| `base.njk` | Basis layout met `<html>`, `<head>` en `<body>` |
| `header-rijksoverheid.njk` | Standaard header met logo en optionele navigatie |
| `header-overheid.njk` | MijnOverheid Zakelijk header |
| `footer-overheid.njk` | MijnOverheid Zakelijk footer |

Elke pagina selecteert zijn layout en opties via front matter bovenaan het bestand:

``` yaml
---
layout: base.njk
title: "Pagina titel"
headerType: overheid
footerType: overheid
---
```

## NPM scripts

Installeer eerst de dependencies in de root van het project:

``` bash
npm install
```

| Script | Commando | Beschrijving |
| ------ | -------- | ------------ |
| `npm run dev` | Eleventy serve + token watcher | Beide parallel, met live reload |
| `npm run build` | Tokens + Eleventy | Volledige productie-build |
| `npm run tokens` | Alleen Style Dictionary | Handmatig tokens bouwen |

## Design tokens vertalen naar CSS variabelen

Om design tokens handmatig naar CSS variabelen om te zetten:

``` bash
npm run tokens
```

Dit resulteert in wijzigingen in de CSS variabelen bestanden. Deze worden automatisch geïmporteerd in de globale `style.css` style sheet.

Bij het gebruik van `npm run dev` worden design tokens automatisch opnieuw gebouwd wanneer `tokens/tokens.json` wijzigt.

## Structuur

``` text
📂 assets
    📁 favicon          favicons voor diverse platformen
    📁 fonts            Rijksoverheid lettertype webfonts
    📁 images           afbeeldingen
📂 componenten          HTML componenten
📂 style
    📄 _reset.css       cross-browser stijl normalisatie, opgenomen in style.css
    📄 _variables.css   CSS variabelen vertaald van design tokens, opgenomen in style.css
    📄 style.css        algemene CSS stijl gelinkt vanuit HTML
📁 style-dictionary
    📄 config.json      configuratiebestand voor Style Dictionary om design tokens naar CSS variabelen te vertalen
📁 tokens
    📄 tokens.json      design tokens die als basis dienen voor CSS variabelen
📄 index.html           boilerplate pagina
📄 README.md            dit bestand met nadere uitleg

```

## CSS conventies

### Logical properties

In de stylesheets worden [CSS logical properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values) gebruikt in plaats van fysieke properties. Logical properties passen zich automatisch aan op basis van de schrijfrichting (`direction`) en schrijfmodus (`writing-mode`), wat de CSS toekomstbestendig en beter geschikt maakt voor meertalige ondersteuning.

| Fysiek | Logisch |
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

## Design tokens in Figma

Om met de design tokens in Figma te werken dient gebruik gemaakt te worden van [de Tokens Studio plugin](https://www.figma.com/community/plugin/843461159747178978/tokens-studio-for-figma). Wanneer deze geïnstalleerd is kan je [middels deze uitleg de tokens in Figma importeren en synchroniseren](https://docs.tokens.studio/token-storage/remote/sync-git-github) (en vervolgens optioneel omzetten in Figma variabelen en/of stijlen).

In Tokens Studio verwijs je vervolgens naar deze repository en folder/bestand `tokens/tokens.json`.

Hierna is een twee-weg bewerking mogelijk middels Git; tokens zijn zowel in JSON zelf (IDE of tekstverwerker) als in Figma aan te maken, wijzigen en verwijderen.

## Commit berichten

`Initial commit`
Initiële commit, een eerste versie die in de bestandsgeschiedenis geplaatst wordt.

`➕ Added`
Toevoeging(en) aan een bestand.

`✏️ Modified`
Wijziging(en) aan een bestand.

`❌ Deleted`
Verwijdering van (iets in) een bestand.

`🧼 Hygiene`
Kleine aanpassing, fix.

`🐛 Bugfix`
Herstel van een bug.

`💾 Backup`
Back-up van een bestand voordat grote wijzigingen plaatsvinden.

`🔁 Renamed`
Hernoeming van (iets in) een bestand.

`↩️ Revert commit`
Wijziging(en) in een vorige commit die ongedaan gemaakt worden.

`🔀 IDE ↔︎ Figma`
Twee-wegverkeer tussen IDE en Figma, met name om design tokens in beide omgevingen te kunnen aanpassen en testen (Style Dictionary → CSS variabelen en Figma Tokens Studio)

## MijnOverheid Zakelijk prototype

[![Deploy Eleventy to GitHub Pages](https://github.com/rogier-barendregt/MOx/actions/workflows/eleventy.yml/badge.svg)](https://github.com/rogier-barendregt/MOx/actions/workflows/eleventy.yml)
