# Changelog — MijnOverheid Zakelijk (MOZa)

Overzicht van de ontwikkeling van het prototype. Gebaseerd op de Git-historie (707 commits, 28 januari – 4 juni 2026). Hygiëne, refactors en kleine correcties zijn weggelaten; de nadruk ligt op functionaliteit en mijlpalen.

## Juni 2026 — Rollen, lopende zaken en Rotterdam

- **Lopende zaken** met statusoverzicht (status-track): detailpagina per zaak, tab-interface Overzicht / Afgehandeld, sub-stappen.
- **Context-rollen** in de accountwisselaar: Privé, Ik handel namens (mantelzorg, ouderlijk gezag), Mijn ondernemingen, Belangen — elk met eigen pagina's, iconen en kleurcodering.
- **Volledige app per onderneming** via persona's; beperkte, rol-passende omgevingen voor belangen en vertegenwoordiging.
- **Afwijkende CSS per MOZa en MOBu** mogelijk gemaakt.
- Link van MOZa naar (fictieve) MOBu; same-origin reverse proxy + configureerbare backend voor de digitale assistent.
- **Gemeentelijke subsidies (Rotterdam)** toegevoegd; alle persona's hebben nu Rotterdamse gegevens.

## Mei 2026 — Persona's, inloggen en mailbox

- **Persona's** (testaccounts) wisselbaar via het Flags-paneel of `?persona=`-URL.
- Fictieve **DigiD-pagina's** en een uniform inlogscherm met bijbehorende flow.
- Fictieve **e-mailclient** (mailbox), privé en zakelijk, achter feature flags.
- Bedrijfsgegevens: content-tiles, back-links op diepere pagina's, twee-koloms layout bij grotere overzichten.
- Overzichtspagina van schermen en flows; datum/tijd laatste wijziging in de footer.

## April 2026 — Berichtenbox, MOBu en schrijfwijzer

- **FBS Berichtenbox**: inbox met paginering, archief en prullenbak, detailpagina per bericht, state-laag (localStorage), acties (archiveren/verwijderen/verplaatsen/markeren), zoeken en filteren, auto-polling van nieuwe berichten, asynchroon ophalen van bijlagen.
- **MOBu** (burgervariant) toegevoegd naast MOZa.
- Eerste versie van de **Schrijfwijzer**.
- **E-mailvalidatie-flow** met patroonbeschrijving in Storybook.
- Testprofielen beheerbaar via JSON en bereikbaar via `?profiel=`.
- Detailpagina's voor subsidies, regelgeving en buurtberichten.
- Fictieve **Ondernemersplein → DigiD → MOZa** flow.
- Overstap naar **Stylelint + Markuplint** (i.p.v. Prettier); motion- en border-tokens.

## Maart 2026 — Storybook, interactiepatronen en deployment

- **Storybook** geïntroduceerd (vervangt `componenten.html`) en gepubliceerd als onderdeel van het prototype.
- Eerste versie van de **Ontwerp-principes**.
- **Interactie op inhoud**: bewaren (favorieten), delen en relevantie markeren.
- **Accountwisselaar** (privé, zakelijk, meerdere ondernemingen).
- **Feature flags** voor togglebare functionaliteit.
- Layout-concepten **Stacks en Clusters** met bijbehorende tokens.
- Custom checkbox en radiobutton, breakpoints.
- **ZAD-deployment-workflows** en containerconfiguratie.
- Tijdelijke pre-flow, inlogkeuze en nav-switches voor gebruikersonderzoeken.

## Februari 2026 — MOZa-app, Eleventy en componenten

- **Eleventy** als build-tool, met herbruikbare includes voor terugkerende markup.
- Eerste **MOZa-homepage en Actualiteiten** (MVP).
- Componenten: Link, Badge, Footer, Pageheader, navigatie.
- Contactvoorkeuren wijzigen; placeholderpagina's voor toekomstige functionaliteit.
- Uitgebreide **design tokens**: borders, box-shadow, spacing, sizing, transities.
- Proof of Concept-banner.

## Januari 2026 — Fundament

- Initiële opzet van het **design system**: tokens vanuit Figma → Style Dictionary → CSS custom properties.
- Buildscript voor de vertaling van tokens naar CSS-variabelen.
- Eerste componenten- en formulierpagina's; tekstinvoer-stijlen.

## Mijlpalen (Git-tags)

- **v0.1** — eerste gemarkeerde versie.
- **Gebruikersonderzoeken** / **Gebruikersonderzoeken-3** — versies voor gebruikerstests.
- **guerrillatest-2026-05-28** — versie voor een guerrilla-test.
