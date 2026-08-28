# Regressietests berichtenbox

Acceptatiecriteria voor de PR `refactor/berichtenbox-datalaag`. De refactor verandert de weg
waarlangs berichten op het scherm komen: de datalaag is nu de waarheid en de tabel wordt één keer
opnieuw opgebouwd, in plaats van dat de server-gerenderde rijen zelf de lijst zijn. Vrijwel elk
zichtbaar gedrag loopt daardoor over nieuwe code, ook waar de code er hetzelfde uitziet.

Deze lijst beschrijft wat er vóór de refactor werkte. Alles hieronder hoort erna nog te werken.

## Hoe u dit uitvoert

1. `npm test` — de geautomatiseerde tests (deel A). Alles hoort groen te zijn.
2. `npm run test:vergelijk` — main en deze branch naast elkaar op de gebouwde pagina's (deel A2).
   Vraagt om een tweede werkmap; zie `tests-vergelijking/README.md`. De scenario's die uiteenlopen
   staan in deel C, met de reden erbij.
3. `npm run dev` — het prototype op `http://localhost:8080`, voor deel B en C.
4. Twee portalen doorlopen, want ze delen de code maar niet de instellingen:
   `/moza/berichtenbox/` en `/mijn-belastingdienst/berichtenbox/`.
5. Vlaggen zet u aan in het Flags-paneel. Relevant zijn “Berichtenbox unhappy flow” (bewaard in een
   cookie, overleeft het wissen van localStorage), “Dynamische berichten”, “Zakelijk postvak”,
   “Delen” en “Accountwisselaar”.
6. Persona wisselt u via het Flags-paneel of via `?persona=`.
7. Begin elk blok met een schone opslag: klik “Reset” in de berichtenbox, of wis de localStorage-key
   `berichtenbox`.

## A. Wat de geautomatiseerde tests afdekken

154 tests in `tests/berichtenbox/`. Ze draaien in jsdom, dus ze zeggen iets over de logica en over de
opbouw van de HTML, en niets over opmaak, animatie of echte browsers.

| Gebied | Bestand | Wat vaststaat |
| --- | --- | --- |
| Datumnotatie | `datum.test.js` | Volledige maandnaam, geen tijdzoneverschuiving, onmogelijke datums geweigerd |
| State in localStorage | `state.test.js` | Gelezen, archief, prullenbak, mappen, markeringen; onleesbare state wordt niet overschreven; mislukt bewaren wordt gemeld |
| Filteren, sorteren, pagineren | `lijst.test.js` | Weergave, zoekterm, afzenderfilter, map, persona-relevantie, geblokkeerde magazijnen, paginavensters |
| Bronregister | `bron.test.js` | Voorrangsvolgorde, een omvallende bron blokkeert de rest niet, storingen blijven bekend |
| Dataset als bron | `dataset-bron.test.js` | Binnendruppelende berichten, de limiet, opruimen bij een uitgezette vlag, stilstand wordt gemeld |
| Renderen | `render.test.js` | Rijen uit de datalaag, tellers, paginanavigatie, zoeken, sorteren, storingsmeldingen, herstel |
| Archief en prullenbak | `views.test.js` | Eigen filters per weergave, kolomaantallen, meldingen per weergave |
| Detailpagina | `detail.test.js` | Archiveren, markeren, terugdraaien en navigeren bij mislukt bewaren |
| Markeren buiten de berichtenbox | `homepage.test.js` | Gedeelde state, geen overschrijving van onleesbare state |

## A2. De vergelijking met main

`npm run test:vergelijk` draait de berichtenbox van `main` en die van deze branch op **dezelfde,
echt gebouwde pagina's uit `_site`** en meldt elk verschil. 41 scenario's: de eerste weergave van
vijf pagina's, zeven bewaarde staten, elf keer zoeken, filteren en sorteren, zeven acties op een
bericht, de voortgangsanimatie, de paginering, de organisatie-schakelaar, de detailpagina en de vijf
demo-pagina's die de berichtenbox alleen als markup hebben.

Zie `tests-vergelijking/README.md` voor het opzetten. Dit draait in jsdom: het ziet de opbouw van de
HTML, de tekst, de klassen, de tellers en wat er in localStorage terechtkomt, en het ziet geen
opmaak, geen echte animatie en geen echte browser. Deel B blijft daarom nodig.

**Uitkomst:** 32 scenario's leveren een identiek beeld op. Negen lopen uiteen, in zes soorten, en
alle zes zijn verklaard — zie deel C.

## B. Handmatig te controleren

Onder elk punt staat wat u doet en wat u hoort te zien. Vink af per portaal.

### B1. De lijst

- [ ] De inbox toont de berichten van de actieve persona, nieuwste bovenaan.
- [ ] Boven de lijst staat het juiste aantal berichten en het juiste aantal bronnen.
- [ ] De badge met ongelezen berichten in de navigatie klopt met de lijst.
- [ ] Een ongelezen bericht is als ongelezen herkenbaar, ook voor een screenreader.
- [ ] Een bericht met een bijlage toont het bijlage-teken.
- [ ] De datum staat er voluit: “9 april 2026”, niet “09-04-2026”.
- [ ] Klikken op een onderwerp opent de detailpagina van dat bericht.

### B2. Zoeken, filteren en sorteren

- [ ] Zoeken op een deel van een afzender of onderwerp beperkt de lijst.
- [ ] Zoeken is hoofdletterongevoelig en negeert spaties eromheen.
- [ ] Het afzenderfilter beperkt de lijst tot de aangevinkte organisaties.
- [ ] Zoeken en het afzenderfilter werken samen, niet elkaar tegen.
- [ ] Klikken op een kolomkop sorteert; nog een keer klikken draait de volgorde om.
- [ ] Na sorteren staat u weer op pagina 1.
- [ ] `aria-sort` staat op de gesorteerde kolom en nergens anders.
- [ ] Levert een filter niets op, dan verschijnt de lege staat met een suggestie wat te doen.

### B3. Paginering

- [ ] Bij meer berichten dan op één pagina passen verschijnt de paginanavigatie.
- [ ] Bij één pagina is de paginanavigatie weg.
- [ ] Doorklikken naar pagina 2 toont andere berichten en zet de paginakeuze in de URL.
- [ ] De pagina uit de URL wordt bij het laden aangehouden.
- [ ] Het venster van paginanummers past zich aan de breedte aan; smaller maken toont er minder.
- [ ] Filteren tot minder pagina's laat u niet op een lege pagina achter.

### B4. Acties op een bericht

- [ ] Het kebab-menu in een rij opent en sluit, en sluit bij een klik erbuiten.
- [ ] Archiveren haalt het bericht meteen uit de inbox en zet het in het archief.
- [ ] Verwijderen zet het bericht in de prullenbak.
- [ ] Op ongelezen zetten werkt, en de teller en de badge lopen mee.
- [ ] Markeren met de vlag werkt, en blijft staan na verversen.
- [ ] Verplaatsen opent het mappenpaneel, en het bericht komt in de gekozen map terecht.
- [ ] Een nieuwe map aanmaken werkt, en de map verschijnt in de zijbalk.
- [ ] Het mappenpaneel is met het toetsenbord te bedienen en sluit met Escape.
- [ ] Alles hierboven blijft staan na het verversen van de pagina.

### B5. Archief en prullenbak

- [ ] Het archief toont alleen gearchiveerde berichten, de prullenbak alleen verwijderde.
- [ ] Een bericht dat zowel gearchiveerd als verwijderd is, staat in de prullenbak.
- [ ] Het archief wordt niet meegefilterd met het organisatiefilter van het portaal.
- [ ] Het archief wordt niet meegefilterd op persona-relevantie.
- [ ] De tellers boven het archief en de prullenbak kloppen met wat eronder staat.
- [ ] Een leeg archief toont de lege staat, niet een lege tabel.
- [ ] Terugzetten naar de inbox werkt vanuit beide weergaven.

### B6. De detailpagina

- [ ] Het bericht wordt geopend en telt daarna als gelezen.
- [ ] Afzender, onderwerp, datum en map staan erboven.
- [ ] Bijlagen worden geladen en zijn te openen.
- [ ] De voorvertoning van een PDF werkt, en downloaden als PDF en als tekst werkt.
- [ ] Een bijlage die niet laadt, geeft een zichtbare melding en geen lege plek.
- [ ] Archiveren, verwijderen en verplaatsen vanaf de detailpagina werken en brengen u terug.
- [ ] De demo-detailpagina (`bericht-demo`) toont het gekozen bericht, en meldt het als het bericht niet bestaat.

### B7. Het Belastingdienst-portaal

- [ ] Standaard staan er alleen berichten van de Belastingdienst.
- [ ] De organisatie-schakelaar zet berichten van andere organisaties aan en uit.
- [ ] De keuze blijft staan na verversen.
- [ ] Staat de vlag “Zakelijk postvak” uit, dan is de schakelaar er niet.

### B8. Storingen en de unhappy flow

Zet de vlag “Berichtenbox unhappy flow” aan. Er wordt per keer laden willekeurig één scenario
gekozen; ververs tot u ze alle drie gezien heeft.

- [ ] Scenario “één bron onbereikbaar”: er staat een melding welke bron ontbreekt, de rest van de lijst werkt gewoon.
- [ ] Scenario “geen enkele bron”: er staat een storingsmelding, en níet “u heeft geen berichten”.
- [ ] Scenario “bron valt later uit”: de lijst laadt, en daarna verschijnt de uitval-melding.
- [ ] De knop “Opnieuw proberen” herstelt de bron en de lijst.
- [ ] De melding over onbereikbare bronnen staat alleen op de inbox, niet op het archief of de prullenbak.
- [ ] Een onbeschikbaar bericht op de detailpagina geeft een melding met een knop om het opnieuw te proberen.
- [ ] Het pictogram past bij de melding: een uitroepteken bij een storing, een “i” bij een mededeling.

### B9. Binnendruppelende berichten

Zet de vlag “Dynamische berichten” aan. Gebruik `?poll=5` om niet een minuut te hoeven wachten.

- [ ] Er komt af en toe een bericht bij, met een korte invade-animatie op alleen dat bericht.
- [ ] De tellers en de badge lopen mee.
- [ ] Na de limiet stopt het, met de mededeling dat alle demo-berichten binnen zijn.
- [ ] Verversen laat de binnengekomen berichten staan.
- [ ] De vlag weer uitzetten en verversen ruimt de demo-berichten op.

### B10. De voortgangsanimatie

- [ ] Bij het eerste bezoek (na een reset) loopt de balk “berichten ophalen bij bronnen” door.
- [ ] De aantallen in de animatie eindigen op wat er daadwerkelijk in de lijst staat.
- [ ] Bij een volgend bezoek wordt de animatie overgeslagen.
- [ ] Met “beperkte beweging” aan in het besturingssysteem springt hij naar het eind in plaats van te animeren.

### B11. Toegankelijkheid

- [ ] De hele berichtenbox is met alleen het toetsenbord te bedienen.
- [ ] De focusrand is overal zichtbaar, ook op de knoppen in een rij.
- [ ] Wijzigingen aan de lijst worden aangekondigd via het `aria-live`-gebied.
- [ ] Een screenreader leest per rij de afzender, het onderwerp, de datum en of het ongelezen is.
- [ ] Elke gebouwde rij heeft evenveel cellen als er kolomkoppen zijn.
- [ ] Bij 400% zoom en op 320 pixels breed blijft alles bereikbaar zonder horizontaal scrollen.

### B12. Zonder JavaScript

- [ ] Met JavaScript uit staat er een gevulde lijst met server-gerenderde rijen.
- [ ] De links naar de detailpagina's werken.
- [ ] Er staat geen lege staat en geen storingsmelding onder een gevulde lijst.

### B13. Opslag die niet meewerkt

- [ ] In een privévenster met geblokkeerde opslag: acties melden zichtbaar dat de wijziging niet bewaard is, en draaien zichzelf terug.
- [ ] Met een handmatig kapotgemaakte `berichtenbox`-key in localStorage: de berichtenbox werkt, meldt dat de bewaarde staat onleesbaar is, en schrijft er niet overheen.

### B14. Andere pagina's met berichtenbox-markup

Deze pagina's delen het script maar hebben geen volledige dataset. Ze horen ongemoeid te blijven.

- [ ] `/moza/belang-tuin/`, `/moza/belang-vve/`, `/moza/belang-winter/`: de statische lijst staat er nog en de kebab-menu's openen.
- [ ] `/mobu/namens-kind/`, `/mobu/namens-mantelzorg/`: idem.
- [ ] `/mailbox/zakelijk/` en `/mailbox/mail-zakelijk/`: onveranderd.
- [ ] Markeren vanaf de homepage van MOZa werkt en deelt de state met de berichtenbox.
- [ ] Op pagina's zonder berichtenbox staan geen nieuwe fouten in de console.

## C. Verschillen met main, en waarom

Gemeten met `npm run test:vergelijk`, niet geredeneerd. Vier ervan zijn fouten op `main` die deze
branch oplost; twee zijn gevolg van de opzet en vragen om een akkoord.

### Wat deze branch rechtzet

- [ ] **Het archief en de prullenbak bouwden een cel te veel.** Die pagina's hebben vijf
      kolomkoppen; `main` bouwt er rijen van zes cellen in. Voor wie de tabel met een screenreader
      doorloopt, klopt de kolomindeling daar niet. De branch bouwt vijf cellen.
- [ ] **“Ongelezen.” bleef in de rij staan.** Zet u een bericht op gelezen, dan haalt `main` wel de
      opmaak weg maar niet de verborgen tekst “Ongelezen.” in de afzenderkolom. Een screenreader
      blijft het bericht dus als ongelezen aankondigen. De branch bouwt de rij opnieuw en laat die
      tekst weg.
- [ ] **De badge werd verkeerd bewaard.** Archiveert of verwijdert u een ongelezen bericht, dan
      toont `main` op het scherm 15 en schrijft het 16 naar localStorage. Op de volgende pagina
      staat de badge daardoor één te hoog. De branch bewaart wat u ziet.
- [ ] **Een bericht kon in het archief én in de prullenbak staan.** Archiveert u een bericht en
      gooit u het daarna weg, dan blijft het op `main` ook in het archief staan. De branch geeft de
      prullenbak voorrang, zoals de bewaarde staat het al beschreef.

### Wat bewust verandert

- [ ] **Zoeken kijkt naar de brongegevens.** Op `main` liep het zoeken over de tekst in de rijen,
      inclusief de verborgen “Ongelezen.”. Zoeken op “ongelezen” gaf daar tien resultaten; hier
      geeft het er nul en verschijnt de lege staat. U zoekt nu in de afzender en het onderwerp.
- [ ] **Alleen de zichtbare pagina staat in de HTML.** Zoeken in de pagina met Ctrl+F vindt daardoor
      alleen berichten op de huidige pagina, niet op alle pagina's.
- [ ] **Het script is een ES-module.** Modulescripts draaien ná alle klassieke `defer`-scripts, dus
      de berichtenbox komt later op gang dan de andere scripts op de pagina.

### Al eerder toegevoegd op deze branch

- [ ] **De lege staat op de inbox.** `main` heeft daar geen `[data-berichtenbox-empty]`, dus een
      zoekopdracht zonder resultaat laat een lege tabel achter zonder uitleg. Deze branch voegt het
      blok toe aan beide inboxen.

## D. Nog niet geautomatiseerd

Wat noch `npm test` noch de vergelijking raakt: de gesimuleerde bronuitval en haar drie scenario's,
het mappenpaneel, de bijlagen met hun voorvertoning en downloads, de responsieve paginanavigatie
(jsdom kent geen breedte), en alles wat met opmaak, kleur, focusrand en beweging te maken heeft.

Die eerste vier zitten in de render-laag. Ze horen in een volgende stap naar de datalaag of achter
testbare functies, zodat deel B korter wordt in plaats van langer. Voor de laatste groep is een
echte browser nodig; in deze omgeving was er geen te installeren.
