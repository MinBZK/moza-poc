# MOx design systeem

## MOx omgeving installeren

1. Clone deze repository lokaal
2. [Installeer Style Dictionary](https://styledictionary.com/getting-started/using_the_cli/#installation) in `/style-dictionary`, deze vertaald design tokens naar CSS variabelen
3. [Instaleer SD-Transforms](https://www.npmjs.com/package/@tokens-studio/sd-transforms#installation) in `/style-dictionary`, dit is een pakketje met extra transformatie-opties die nodig zijn om design tokens uit Figma [Tokens Studio](https://docs.tokens.studio/) te vertalen

## Design tokens vertalen naar CSS variabelen

Om design tokens naar CSS variabelen om te zetten voer je dit commando uit vanuit de `style-dictionary` folder:

``` bash
npm run build
```

Dit resulteert in wijzigingen in `_variables.css`. Dit variabelen bestand wordt automatisch geïmporteerd in de globale `style.css` style sheet.

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
