# main en de branch naast elkaar

Deze vergelijking draait de berichtenbox van `main` en die van de huidige branch op **dezelfde,
echt gebouwde pagina's uit `_site`**, en meldt elk verschil. Geen nagebouwde fixture: dit is de HTML
die Eleventy oplevert.

Bedoeld als bewijs onder `docs/berichtenbox-regressietests.md`. Elk verschil dat hieruit komt hoort
te verklaren te zijn. Verschillen zijn dus geen fouten van de vergelijking, maar de uitkomst ervan.

## Draaien

```sh
git worktree add ../moza-poc-main main
ln -s "$PWD/node_modules" ../moza-poc-main/node_modules
(cd ../moza-poc-main && npx @11ty/eleventy)   # main bouwen
npx @11ty/eleventy                            # de branch bouwen
npm run test:vergelijk
```

Staat de werkmap van main ergens anders, geef dan `VGL_MAIN=/pad/naar/main` mee. De verschillen
komen ook in een bestand terecht, standaard `$TMPDIR/berichtenbox-verschillen.txt`; met
`VGL_RAPPORT=…` zet u dat elders neer.

## Wat het wél en niet ziet

Dit draait in jsdom. Het ziet de opbouw van de HTML, de tekst, de klassen, de tellers en wat er in
localStorage terechtkomt. Het ziet **geen** opmaak, geen echte animatie en geen echte browser: er
was er geen te installeren in deze omgeving. De handmatige lijst in
`docs/berichtenbox-regressietests.md` blijft daarvoor nodig.

## Twee valkuilen die eronder zitten

De pagina's van beide versies draaien in dezelfde jsdom. Twee dingen lekten daardoor van de ene
versie naar de andere, en allebei leverden ze eerst een verschil op dat er niet was:

- **Gedelegeerde listeners op `document` en `window`** blijven leven als de volgende versie geladen
  wordt. `laad.js` neemt ze op en ruimt ze op.
- **De URL** blijft staan. Main zette `?pagina=2`, waarna de branch al op pagina 2 begon en het leek
  alsof de paginering uiteenliep. `laad.js` zet de URL terug voor elke lading.

Een derde is geen lek maar een echte val: **klik niet op de eerste knop in documentvolgorde**. Main
houdt alle rijen in de DOM en verbergt wat niet op de pagina staat, dus die knop hoort bij een rij
die de bezoeker niet ziet. Gebruik `klikInEersteRij`.
