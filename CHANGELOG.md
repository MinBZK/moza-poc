# MijnOverheid Zakelijk POC prototype changelog

## Juni 2026: Rollen en lopende zaken

- **Lopende zaken** met statusoverzicht en een detailpagina per zaak, tab-interface Overzicht / Afgehandeld, sub-stappen.
- **Context-rollen** in de accountwisselaar: Privé, Ik handel namens (mantelzorg, ouderlijk gezag), Mijn ondernemingen, Belangen — elk met eigen pagina's, iconen en kleurcodering.
- **Volledige app per onderneming** via persona's; beperkte, rol-passende omgevingen voor belangen en vertegenwoordiging.
- **Afwijkende CSS per MOZa en MOBu** mogelijk gemaakt.
- Link van MOZa naar (fictieve) MOBu; same-origin reverse proxy + configureerbare backend voor de digitale assistent.
- **Gemeentelijke subsidies (Rotterdam)** toegevoegd; alle persona's hebben nu Rotterdamse gegevens.

## Mei 2026: Persona's, inloggen en mailbox

- **Persona's** (testaccounts wisselbaar via het Feature flags-paneel of `?persona=*`-url).
- **Uniorm inloggen** schermen omgezet naar prototype omgeving.
- Fictieve **DigiD-pagina's** met bijbehorende flow.
- Fictieve **e-mailclient** met keuze tussen privé en zakelijke mailbox (achter feature flags).
- **Bedrijfsgegevens**: content-tiles, back-links op diepere pagina's, twee-koloms layout bij grotere overzichten.
- **Overzichtspagina** van schermen en flows
- Datum/tijd **laatste wijziging** in de footer.

## April 2026: Berichtenbox, MijnOverheid voor burgers en schrijfwijzer

- **FBS Berichtenbox**: inbox met paginering, archief en prullenbak, detailpagina per bericht, state-laag (localStorage), acties (archiveren/verwijderen/verplaatsen/markeren), zoeken en filteren, auto-polling van nieuwe berichten, asynchroon ophalen van bijlagen.
- **MijnOverheid (MOBu)** (burgervariant) toegevoegd naast MijnOverheid Zakelijk.
- Eerste versie van de **Schrijfwijzer**.
- **E-mailvalidatie-flow** met patroonbeschrijving in Storybook.
- **Testprofielen** beheerbaar via JSON en bereikbaar via `?profiel=`.
- **Detailpagina's** voor subsidies, regelgeving en buurtberichten.
- Fictieve **Ondernemersplein → DigiD → MOZa** flow.
- Overstap naar **Stylelint + Markuplint** (i.p.v. Prettier); motion- en border-tokens.

## Maart 2026: Storybook, interactiepatronen en deployment

- **Storybook** gepubliceerd (vervangt `componenten.html`).
- Eerste versie van de **Ontwerp-principes**.
- **Interactie op inhoud**: bewaren (favorieten), delen en relevantie markeren.
- **Accountwisselaar** (privé, zakelijk, meerdere ondernemingen).
- **Feature flags** voor tonen additionele, of afwijkende functionaliteit.
- **Custom** checkbox en radiobutton, breakpoints.
- **ZAD-deployment-workflows** en containerconfiguratie.
- **Tijdelijke pre-flow**, inlogkeuze en mogelijkheid navigatie-items te wijzigen voor gebruikersonderzoeken.

## Februari 2026: POC prototype, Eleventy en componenten

- **Eleventy** als build-tool, met herbruikbare includes voor terugkerende markup en functionaliteit.
- Eerste **MOZa-homepage** en **Actualiteiten**.
- **Componenten**: Link, Badge, Footer, Pageheader, Navigatie, e.d.
- **Contactvoorkeuren wijzigen**; placeholderpagina's voor toekomstige functionaliteit.
- **Design tokens**: borders, box-shadow, spacing, sizing, transities.

## Januari 2026: Fundament

- Initiële opzet van een **design system** (voor prototyping): tokens vanuit Figma → Style Dictionary → CSS custom properties met twee-weg sync tussen front-end en Figma.
- **Buildscript** voor de vertaling van tokens naar CSS-variabelen.
- Eerste **componenten- en formulierpagina's**.
