# Wetten en regels als bord — ontwerp

Datum: 27 augustus 2026. Status: concept, ter review.

## Waarom

De digitale assistent als vrije chat heeft één structureel risico: een model dat
vrij over wetten formuleert, kan foutieve informatie geven. Het gebruikersonderzoek
van 25 en 27 augustus liet zien dat ondernemers de assistent wél willen gebruiken,
maar dat de waarde zit in "wat geldt voor mij, en wat moet ik doen" — niet in
vrij vragen stellen.

Dit ontwerp draait het om. De pagina **Wetten en regels** wordt een bord met
alle regels en subsidies die op dít bedrijf slaan, en de assistent mag daarbinnen
alleen drie dingen die elk een controleerbare bron hebben:

| Handeling | Bron | Model nodig? |
|---|---|---|
| **Wijzen**: welke regels gelden voor dit bedrijf | bedrijfsprofiel × regelcorpus (`geldtVoor`, persona) | nee |
| **Rekenen**: geldt het echt, wat is de deadline | RegelRecht (deterministisch, met wetsartikel) | nee |
| **Uitleggen en regelen**: per regel, gescopet | de tekst van díe regel + de toetsuitkomst; bestaande chat-flow | ja, maar begrensd |

De zoekbalk is "slim" zonder te antwoorden: een model vertaalt de vraag naar
zoektermen, de resultaten zijn altijd regels uit het corpus met bronlink. Er is
op deze pagina geen pad meer waarin een model zonder bron een antwoord geeft.

## Wat verandert voor de ondernemer

- Zijnavigatie: het item **Digitale assistent (AI)** verdwijnt; het item
  **Wetten en regelgeving** wordt **Wetten en regels** en toont het bord.
- `/moza/regelgeving/` (de huidige lijst) wordt vervangen door het bord op
  dezelfde URL. Bewaren en "niet relevant" uit de lijst gaan op in de kolommen.
- `/moza/digitale-assistent/` blijft bestaan (zijpaneel van het bord opent dezelfde
  chat; bestaande links met `?vraag=` blijven werken), maar staat niet meer in
  het menu.

## Het bord

### Kolommen

Te doen · Mee bezig · Komt eraan · Niet beoordelen · Afgerond.

"Afgerond" is toegevoegd aan de vier uit de opdracht: zonder die kolom eindigt
een ingediende rapportage in "Mee bezig" of verdwijnt hij.

### Kaart

Eén regel of subsidie. Inhoud, van boven naar beneden:

1. Label **Wet** of **Subsidie**, en de instantie (`bron`).
2. Titel, één zin (`beschrijving`).
3. **Wat we echt weten** — een strook met alleen feiten uit een bron:
   - datum: "Geldt sinds 1 juli 2026" of "Geldt vanaf …" (`inwerkingtreding`),
     of "Deadline uit de wet: 1 december 2026" (uit de regeltoets);
   - toetsstatus: "Getoetst: geldt voor uw bedrijf (RegelRecht, art. 5.15d Bal)",
     "Getoetst: geldt niet", of "Niet automatisch te toetsen";
   - zaak: "Rapportage ingediend, referentie RVO-…" (uit lopende zaken).
4. Herkomst van de plaatsing: "Voorgesteld door de assistent" of "Door u geplaatst
   op 27 augustus". In "Niet beoordelen": de reden die de ondernemer opgaf.
5. Acties:
   - **Geldt dit voor mij?** — alleen op kaarten met een rekenregel (nu: de
     informatieplicht energiebesparing, regel-id `milieubeheer`). Opent het
     zijpaneel en start de bestaande toets-flow.
   - **Vraag de assistent over deze regel** — opent het zijpaneel met de scope
     van deze regel.
   - **Verplaats naar…** — knopmenu met de andere kolommen. Geen drag-only:
     toetsenbord en screenreader moeten hetzelfde kunnen. Kiest de ondernemer
     "Niet beoordelen", dan vraagt een klein formulier een reden (verplicht,
     vrije tekst).
   - **Lees de regel** — link naar `externUrl` (wetten.overheid.nl / RVO).

### Eerste indeling: het voorstel van de assistent

Regel-gebaseerd, in de frontend, geen model:

| Situatie | Kolom |
|---|---|
| `inwerkingtreding` ligt na vandaag | Komt eraan |
| er is een zaak voor deze regel in `zaken` (localStorage) met status ingediend/afgehandeld | Afgerond |
| er is een zaak voor deze regel in behandeling, of er is een gesprek over gevoerd | Mee bezig |
| eerder "niet relevant" gemarkeerd (`hidden:<titel>`) | Niet beoordelen, reden "eerder als niet relevant gemarkeerd" |
| anders | Te doen |

Welke kaarten: `persona.regelgeving` + `persona.subsidies` (ids) → details uit
`regelgevingData` en `subsidiesData`. Zolang de ondernemer een kaart niet
verplaatst, blijft het voorstel leidend en beweegt de kaart mee met nieuwe feiten
(zaak ingediend → Afgerond). Na een handmatige verplaatsing wint de ondernemer;
de strook "Wat we echt weten" blijft wel bijwerken.

### Staat

localStorage, per persona: `bord:<kvkNummer>` → `{ [regelId]: { kolom, door: "assistent"|"ondernemer", op: ISO-datum, reden? } }`.
Zelfde mechaniek als de gesprekshistorie. Persona-wissel = ander bord.

## Zijpaneel: de assistent per kaart

Het zijpaneel (`<aside>`) bevat de bestaande chat-elementen (`#chat-form`,
`#chat-input`, `#chat-messages`, `#chat-nieuw`, `#chat-bewaar`, `#chat-status`),
zodat `digitale-assistent.js` ongewijzigd werkt: gesprekken, formulieren,
deelverzoeken, zaken.

Scope: bij openen vanuit een kaart zet de frontend de eerste vraag klaar via
`window.MozaAssistentVraag.vraag(item, soort)` (bestaat al) met de regel als
context: "Over *Informatieplicht energiebesparing* (Wet milieubeheer): …". Het
paneel toont bovenin op welke regel het gesprek gaat, en een knop "Sluit".

Host-kant, later (niet in deze branch): een `regel`-veld op het chat-contract
zodat de systeemprompt echt op één regel wordt begrensd (tekst van de regel als
enige bron; buiten scope → "daar kan ik in dit gesprek niets over zeggen").
Deze frontend stuurt het veld al mee zodra het bestaat; nu gaat de scope via de
berichttekst.

Gesprekshistorie: per persona én per regel (`chatHistory` krijgt de regel-id in
de combo-sleutel), zodat een gesprek over de arbowet niet in dat over de
informatieplicht doorloopt.

## Zoekbalk

Bovenaan de pagina, over **alle** regels en subsidies in het corpus (niet alleen
die van de persona): titel, beschrijving, inhoud, `geldtVoor`.

- Client-side: woordmatch met normalisatie (kleine letters, diakrieten, stam
  via simpele suffix-stripping), gewogen: titel > geldtVoor > beschrijving >
  inhoud.
- "Slim": staat de host-endpoint `/zoektermen` beschikbaar, dan gaat de vraag
  daarheen en komen er extra zoektermen en categorieën terug ("koelcel" →
  "koelinstallatie, energiebesparing, milieubeheer"). Het model mag alleen
  termen teruggeven; de frontend toont nooit modeltekst als resultaat. Zonder
  endpoint werkt de zoekbalk gewoon zonder die stap.
- Resultaat = dezelfde kaart als op het bord, met "Staat op uw bord (Te doen)"
  of knop **Toevoegen aan bord** (komt in Te doen, "Door u geplaatst"). Elke
  kaart heeft de bronlink.
- Geen resultaten: "Geen regel gevonden voor '…'. Probeer een ander woord, of
  kijk op wetten.overheid.nl." — geen assistent-antwoord als vervanging.

## Toegankelijkheid en schrijfwijzer

- Kolommen zijn `<section>`s met `<h2>`; kaarten `<article>`s in een `<ul>`.
- Verplaatsen via `<button>`-menu (`aria-expanded`), focus keert terug naar de
  kaart in de nieuwe kolom; `aria-live` meldt "Verplaatst naar Mee bezig".
- Zijpaneel: `role="complementary"`, `aria-labelledby` de regeltitel, Escape sluit,
  focus terug naar de knop.
- Teksten in de u-vorm, B1; knopteksten werkwoord-gericht; datums voluit.
- Design tokens (`--toepassing-*`), logical properties, `data-feature` op de
  "slim zoeken"-stap zodat die uit kan.

## Buiten scope van deze branch

- Host: `regel`-veld op het chat-contract en `/zoektermen`-endpoint (aparte PR in
  `moza-poc-digitale-assistent`; de frontend werkt zonder).
- Meer rekenregels dan de informatieplicht.
- Synchronisatie van het bord buiten de browser.

## Bestanden (indicatief)

| Bestand | Wat |
|---|---|
| `moza/regelgeving.njk` | wordt het bord (zoekbalk, kolommen, zijpaneel met chat-elementen) |
| `_includes/side-nav-overheid.njk` | "Wetten en regels"; assistent-item weg |
| `assets/javascript/regelbord.js` | kaarten opbouwen, voorstel-indeling, verplaatsen, localStorage, zoekbalk |
| `assets/javascript/assistent-vraag.js` | scope-vraag per regel |
| `assets/javascript/digitale-assistent.js` | combo-sleutel met regel-id; paneel-open/dicht |
| `style/style.css` | `.regelbord`, `.regelkaart`, `.regel-zoek`, `.assistent-paneel` |
| `_data/regelgevingData.json` | de informatieplicht-kaart krijgt `rekenregel: "omgevingswet/energiebesparing/informatieplicht"` |
| `stories/` | story voor kaart en bord |
