# Iemand aannemen (Digitale assistent 2.0)

Stand 20 oktober 2026, versie 1, branch `feat/iemand-aannemen`. Voor het gebruikersonderzoek van half november (usecase Financieel CV, Digitale assistent 2.0). Ontwikkeld in `~/projects/prototypes/digitale-assistent-moza` en hier één op één overgezet.

## Wat het is

Negen pagina's in de opzet van de proeftuin, met de persona bloemenkweker (Robin Vogel, Kwekerij De
Bloesem, gemeente Lansingerland). Eén kloppend verhaal: Robin neemt Koen de Wit
aan, 32 uur tegen het minimumloon vanaf 1 oktober 2026. Zie
`docs/iemand-aannemen/verhaallijn-koen-v1.md` voor elke gebeurtenis met datum, actor en wetsgrond.

| Pagina | Pad | Wat de deelnemer doet |
|---|---|---|
| Personeel | `/moza/personeel/` | Start "Iemand aannemen"; na het versturen staat de zaak hier |
| Kandidaat | `/moza/iemand-aannemen/` | Vult alleen in wat de overheid niet weet (Koen is voorgevuld) |
| Gegevens per bron | `/moza/iemand-aannemen/gegevens/` | Ziet per bron (UWV, gemeente, KVK, Belastingdienst, eigen opgave) de gegevens, de datum en de wetsvraag; vinkt per bron "klopt" |
| Wat het oplevert | `/moza/iemand-aannemen/wat-het-oplevert/` | Per regeling uitkomst, bedrag, grond en "Waarom" met de stappen van de engine |
| Concept-aanvraag LKS | `/moza/iemand-aannemen/concept-aanvraag-loonkostensubsidie/` | Het omgekeerde formulier: alles ingevuld, met bron; verstuurt |
| Verstuurd | `/moza/iemand-aannemen/verstuurd/` | Bevestiging, link naar de zaak |
| Lopende zaken | `/moza/lopende-zaken/` | De zaak staat in het overzicht (rij toegevoegd aan de proeftuin-pagina) |
| Zaak | `/moza/lopende-zaken/loonkostensubsidie-koen/` | Voortgang (status-track), alles wat is vastgelegd (tijdlijn met correctie), komt hierna |
| Besluit | `/moza/lopende-zaken/loonkostensubsidie-koen/besluit/` | Besluit van het college, dezelfde berekening als vooraf, "Waarom" met gegevens en engine-stappen, "Klopt dit niet?" |

Schermafdrukken op 1280 breed: `docs/iemand-aannemen/beeld/` (ook `12-concept-andere-persona-1280.png` met de persona koffiezaak).

## Draaien

```bash
npx @11ty/eleventy --serve        # http://localhost:8080/moza/personeel/
node tests/iemand-aannemen/schermen.mjs http://localhost:8080 /tmp/schermen   # headless Chromium: schermafdrukken, consolefouten, horizontale scroll, persona-wissel
```

De engine-traces in `_data/daTraces.json` komen uit een `TRACE=1`-run van de BDD-suite van regelrecht; `tests/iemand-aannemen/da-traces.py` maakt dat bestand opnieuw.

## Voor de onderzoeker, tijdens een sessie

- De stappen bouwen op elkaar via de browseropslag: pas als alle bronnen zijn
  aangevinkt werkt "Bereken wat het oplevert"; pas na "Verstuur" bestaat de zaak.
- Op de zaak- en besluitpagina staat onderaan het blok **Voor de onderzoeker**:
  kies het moment (ontvangen, gemeten, vastgesteld, besluit, antwoord, betaling)
  en de voortgang en de tijdlijn volgen. "Begin het scenario opnieuw" wist alles.
  Het blok is een feature flag (`Onderzoeksbediening`), uit te zetten in het
  flags-paneel van de proeftuin.
- "Klopt dit niet?" op het besluit zet de vraag van de deelnemer in de tijdlijn;
  het antwoord van de gemeente verschijnt bij het moment "Antwoord op uw vraag".

## Persona's wisselen (gebruikerstest)

- Het prototype gebruikt de persona-wisselaar van de proeftuin. Wissel via het blok
  **Voor de onderzoeker** op Personeel (keuzelijst "Deelnemer speelt"), via het
  flags-paneel, of met `?persona=<label of id>` in het adres (bijvoorbeeld
  `?persona=koffiezaak`). Bij een wissel begint het scenario opnieuw.
- Wat meewisselt: ondernemer (naam in de kop), onderneming, rechtsvorm, KVK-nummer,
  vestiging, loonheffingennummer, rekeningnummer en het aantal werknemers. Die
  velden zijn `data-profiel`-spans die `personas.js` van de proeftuin vult.
- Wat niet meewisselt: de kandidaat (Koen de Wit, Bergschenhoek), de gemeente van de
  loonkostensubsidie (Lansingerland, de woonplaats van Koen) en de bedragen. Dat
  klopt ook in de wet: de subsidie komt van de gemeente van de werknemer.
- Standaard is de persona `bloemenkweker` (Robin Vogel, Kwekerij De Bloesem); de
  verhaallijn en de verstuurde aanvraag zijn daarop geschreven. Voor een andere
  persona kloppen de werkgevergegevens, maar de zaak blijft het verhaal van Koen.

## Wat vastligt en wat niet

- Uitkomsten en bedragen komen uit de regelrecht-engine (corpus
  `traject/financieel-cv-0bc401e0`, wetsversie 1 juli 2026): loonkostensubsidie
  € 897,41 per maand bij loonwaarde 60 procent en 32 uur, loonkostenvoordeel
  banenafspraak € 1.680,64 per jaar, no-riskpolis ja, begeleiding op de werkplek
  aanspraak, proefplaatsing mogelijk, loondispensatie niet. De traces staan in
  `_data/daTraces.json` (`script/da-traces.py` maakt dat bestand uit een
  TRACE-run van de suite). Het prototype rekent zelf niets.
- Het aantal uren is in te vullen maar het prototype rekent met 32; dat staat
  bij het veld. Live herrekenen komt met de engine-bundel (regelrecht-uitleg),
  die eerst opnieuw gepind moet worden op de huidige corpus en engine.
- Het besluit is van het college; de engine onderbouwt. "Genomen door:
  automatisch" uit het vorige prototype is bewust weg.
- De vergoeding werkgeverslasten zit in de grondslag van het 70-procentmaximum
  (letter van Pwet 10d lid 4); de vraag of de uitvoering afwijkt ligt bij UWV.
  De vraag-en-antwoord in de tijdlijn gaat daarover.
- Toestemming van Koen is de grondslag voor het gebruik van zijn gegevens; dat
  is een aanname voor het prototype.

## Bestanden

- Pagina's: `moza/iemand-aannemen/**`, `moza/lopende-zaken/loonkostensubsidie-koen/**`; `moza/personeel.html` (was "binnenkort beschikbaar") en `moza/lopende-zaken.html` (één rij erbij, verborgen tot de aanvraag is verstuurd).
- Includes: `_includes/da-macros.njk`, `_includes/da-tijdlijn.njk`. Data: `_data/daKoen.json` (verhaal, bronnen, regelingen, gebeurtenissen), `_data/daTraces.json` (engine-traces). Script: `assets/javascript/da-iemand-aannemen.js`. Stijl: `assets/da-iemand-aannemen.css` (alleen `--toepassing-*`-tokens). Filter `euro` in `.eleventy.js`.
- Menu: "Personeel en rollen" staat achter de bestaande feature flag; de pagina is nu de ingang.

## Schrijfwijzer en termen

Volgens `poc-moza/CLAUDE.md`: u en uw, B1, Lopende zaken (niet Dossiers),
Berichtenbox (niet Meldingen), Bedrijfsgegevens (niet Profiel), Verstuur voor
een aanvraag, Annuleer voor afbreken, datums als "3 november 2026".

## Open punten voor UX

1. Gegevens per bron: vijf kaarten onder elkaar is lang op een telefoon. Alternatief: één lijst met een bronfilter, of de vinkjes bovenaan per bron.
2. "Waarom dit geldt" toont de engine-stappen met Nederlandse labels; de volledige trace staat daaronder ingeklapt. Is de eerste laag genoeg voor een ondernemer?
3. De tijdlijn noemt de soorten Regelgeving, Besluit en Uitvoering; de termen lexogram, decretogram en executogram staan niet op het scherm. Terugzetten als het onderzoek erom vraagt.
4. Berichtenbox: de ontvangstbevestiging en het besluit staan nog niet als bericht in de Berichtenbox van de proeftuin; de pagina's verwijzen er wel naar.
5. Home: geen kaart "Iemand aannemen" op de startpagina; de ingang is Personeel. Wil UX een kaart op Home, dan is dat een regel in `moza/index.html` van de proeftuin.
