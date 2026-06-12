# Compacte informatieplicht-notificatie in regelgeving-tegel

**Datum:** 11 juni 2026
**Status:** goedgekeurd

## Probleem

De informatieplicht-notificatie voor persona Claudia van Dam (commit `409e51ed`) is een
volle kaart bovenaan de homepage: feedback-banner, bronnen-`<dl>` (KvK, netbeheerder),
wervende alinea en CTA. Te zwaar voor een dashboardmelding, domineert de homepage en
dupliceert de bronvermelding die het assistent-gesprek (stap 2) zelf al doet.

## Oplossing

1. **Grote kaart verwijderen** uit `moza/index.html` (de sectie met
   `data-persona-toon="koffiezaak"` boven Actualiteiten).
2. **Compact blok toevoegen** in de bestaande tegel "Wetten en regelgeving".
   Na UI-tuning (tweede review-ronde) ziet de tegel er voor Claudia zo uit:
   melding als `feedback feedback-info`-blokje met info-icoon, daaronder de
   assistent-knop als enige `btn-cta`, daaronder "Ga naar Wetten en regelgeving"
   als gewone tekstlink. De telling-zinnen ("Er is 1 nieuwe wet…"), de lege
   lijst en de oorspronkelijke tegel-knop staan in een wrapper met het nieuwe
   attribuut `data-persona-verberg="koffiezaak"` zodat Claudia één boodschap
   ziet in plaats van twee; alle andere persona's zien de tegel ongewijzigd.

   Zichtbaarheid via het bestaande `data-persona-toon`-mechanisme plus het
   nieuwe spiegelbeeld `data-persona-verberg` (personas.js); de `?vraag=`-link
   blijft identiek (startvraag stap 1); het bestaande link-rewrite-mechanisme
   voegt `&persona=` automatisch toe. De wrapper is nodig omdat `setTelling()`
   zelf al `hidden` schrijft op de telling-zinnen.
3. **Detailpagina-ingang**: het milieubeheer-item in `_data/regelgevingData.json`
   krijgt een veld `assistentVraag`; `moza/regelgeving/regeling.njk` rendert dan
   een "Start met de digitale assistent"-knop met die vraag als `?vraag=`,
   alleen zichtbaar voor Claudia (`data-persona-toon="koffiezaak"`). Daarmee is
   de route dashboard → regelgeving-overzicht → detailpagina niet langer
   doodlopend.
4. **README** (sectie "Demo: informatieplicht energiebesparing") aanpassen:
   notificatie zit nu in de regelgeving-tegel, bronnen worden in het gesprek
   getoond, detailpagina heeft ook een startknop.

## Bewust niet gedaan

- De lege `<ul class="list-content-links">` in de regelgeving-tegel **niet** koppelen
  aan `data-homepage-regelgeving`: `maakRegelingLi()` bouwt volle card-topics
  (h3 + beschrijving + `<dl>` + action-group) en de wijziging raakt álle persona's.
  Pre-existing kwestie, los van deze demo.
- Bronnen (KvK/netbeheerder) niet elders op het dashboard tonen: het gesprek doet dat.

## Succescriteria

- Claudia: feedback-blokje + assistent-knop (enige `btn-cta`) + tekstlink in de
  regelgeving-tegel; telling-zinnen verborgen; badge telt milieubeheer-item mee.
- Knop opent assistent met startvraag, persona blijft behouden in URL.
- Claudia: ook startknop op de detailpagina van de Wet milieubeheer.
- Robin (default): geen melding, telling-zinnen en tegel-knop zichtbaar,
  detailpagina zonder assistent-knop. Tegel ongewijzigd.
- Grote kaart komt nergens meer voor.
