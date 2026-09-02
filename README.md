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

```bash
npm install @11ty/eleventy
```

### Pagina's bouwen

Om de HTML pagina's te bouwen voer je dit commando uit vanuit de root van het project:

```bash
npx @11ty/eleventy
```

De gebouwde pagina's worden in de map `_site` geplaatst.

### Lokaal bekijken

Start een lokale server met live reload:

```bash
npx @11ty/eleventy --serve
```

De site is vervolgens te bekijken op [`localhost:8080`](http://localhost:8080).

> Let op: voor sommige API-calls en integratietests draait er een lokale proxy-server die requests naar externe services kan doorsturen of mocken. Start deze in een aparte terminal met:
>
> ```bash
> npm run proxy
> ```
>
> Dit voert `server/proxy.js` uit en zorgt dat requests naar `/api/...` lokaal naar de juiste upstream worden geproxied (gebruikelijk voor ontwikkeling wanneer je services lokaal of via een test‑target draait).

### Includes

Herhalende componenten staan in de `_includes` map:

| Bestand                    | Beschrijving                                             |
| -------------------------- | -------------------------------------------------------- |
| `base.njk`                 | Basis layout                                             |
| `header-rijksoverheid.njk` | Rijksoverheid header met logo en navigatie               |
| `header-overheid.njk`      | Overheid header header met logo                          |
| `footer-overheid.njk`      | Overheid footer                                          |
| `side-nav-overheid.njk`    | Overheid hoofdnavigatie                                  |
| `action-group.njk`         | Actiegroep onder een topic (Bewaar, Deel, Niet relevant) |

Elke pagina selecteert diens layout en opties bovenaan het bestand:

```yaml
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

Het bestand `tokens/tokens.json` is de _single source of truth_ voor alle ontwerp-waarden én toepassingen (kleur, typografie, spacing, etc.). Dit bestand is in twee richtingen te bewerken:

- **Figma**; via de [Tokens Studio](https://docs.tokens.studio/) plugin kunnen ontwerpers tokens ophalen, aanpassen en terugschrijven naar Git.
- **IDE**; ontwikkelaars kunnen het JSON-bestand ophalen, aanpassen en terugschrijven naar Git in een code-editor.

### Style Dictionary

Om de design tokens te vertalen naar CSS variabelen wordt [Style Dictionary](https://styledictionary.com/) gebruikt.

1. [Installeer Style Dictionary](https://styledictionary.com/getting-started/using_the_cli/#installation) in `/style-dictionary`, deze vertaald design tokens naar CSS variabelen
1. [Instaleer SD-Transforms](https://www.npmjs.com/package/@tokens-studio/sd-transforms#installation) in `/style-dictionary`, dit is een pakketje met extra transformatie-opties die nodig zijn om design tokens uit Figma [Tokens Studio](https://docs.tokens.studio/) te vertalen

De pipeline ziet er zo uit:

Figma met Tokens Studio óf IDE → tokens/tokens.json → Style Dictionary + SD-Transforms → CSS variabelen → Stylesheet (style.css)

Style Dictionary leest `tokens.json` en transformeert de tokens naar CSS custom properties. Omdat Tokens Studio een eigen tokenformaat hanteert dat afwijkt van het [standaard Design Token Community Group (DTCG) formaat](https://www.designtokens.org/tr/2025.10/format/), wordt [SD-Transforms](https://www.npmjs.com/package/@tokens-studio/sd-transforms) als aanvulling gebruikt. Dit zorgt onder andere voor het correct oplossen van tokenreferenties, het omrekenen van `px` naar `rem` waarden en het omzetten van namen naar ‘_kebab-case_’.

Het resultaat wordt opgesplitst in twee automatisch gegenereerde CSS-bestanden:

- **`_rijkshuisstijl.css`**; bevat de waarden uit de Rijkshuisstijl: het kleurenpalet, typografie-instellingen, maatvoering, etc. Dit zijn de beschikbare _opties_.
- **`_toepassing.css`**; bevat semantische variabelen die verwijzen naar de Rijkshuisstijl-waarden en daar een concrete betekenis aan geven, bijvoorbeeld `--color-text-default` of `--button-primary-background-color`. Dit zijn de _toepassingen_ van de opties.

Gebruik in stylesheets en componenten altijd variabelen uit `_toepassing.css` en nooit rechtstreeks uit `_rijkshuisstijl.css`. De Rijkshuisstijl-variabelen zijn de bouwstenen; de toepassingsvariabelen bepalen _hoe_ die bouwstenen worden ingezet. Door deze scheiding kan een Rijkshuisstijl-waarde wijzigen zonder dat stylesheets aangepast hoeven te worden, de toepassingslaag vangt de verandering op.

Beide bestanden worden automatisch gegenereerd en mogen niet handmatig bewerkt worden. Alle wijzigingen aan ontwerp-waarden horen thuis in `tokens/tokens.json`.

### Design tokens vertalen naar CSS variabelen

Gebruik dit commando om design tokens handmatig naar CSS variabelen om te zetten:

```bash
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

In productie draait alles achter **één origin**: de nginx van de frontend **proxyt** de chat-endpoints (`/chat`, `/chat/stream`, `/health`, `/tools`) intern naar de backend. De browser praat dus alleen met de frontend-origin — **geen CORS nodig**, en de backend hoeft niet publiek te zijn. Twee instellingen:

| Variabele        | Waar                                                                  | Betekenis                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MOZA_CHAT_API`  | build-time (`_data/chatApi.js` → `base.njk` → `window.MOZA_CHAT_API`) | Waar de **browser** naartoe fetcht. Default leeg (`""`) = same-origin via de proxy. Productie laat dit leeg.                                                                  |
| `BACKEND_ORIGIN` | runtime env op de nginx-container                                     | Waar de **proxy** de chat-endpoints naartoe stuurt (zie [Welke backend krijgt welk pad](#welke-backend-krijgt-welk-pad) voor de rest). Default `http://dabackend:8000`. Zet dit op het ZAD-component `proef` via de **ZAD-UI** (`zad-actions/deploy` kan geen runtime-env zetten). |

De frontend heeft **geen** eigen variabele voor de bedrijfsidentiteit: die stuurt gewoon het KvK-nummer van de actieve persona mee, zie [Sessie-identiteit](#sessie-identiteit).

**Lokaal end-to-end** (zonder proxy; backend draait los, dus daar wél CORS):

1. `npm run dev` — Eleventy `--serve` op [`localhost:8080`](http://localhost:8080); zet automatisch `window.MOZA_CHAT_API=http://localhost:8000` zodat de browser de lokale backend direct aanroept.
2. Start de backend (FastAPI, poort `8000`) volgens de [backend-repo](https://github.com/MinBZK/moza-poc-digitale-assistent).
3. Zet aan de backend `ALLOWED_ORIGINS=http://localhost:8080` en `TEST_KVK_NUMMERS=85234567,62345681,56789012` (de persona's met een backend-profiel). Ontbreekt die allowlist, dan geeft élke vraag "log eerst in".

> ⚠️ **Preview-deploys (`pr<nr>`):** het backend-component `dabackend` draait alleen in de gedeelde deployments (`poc`, gebruikersonderzoek), niet in per-PR previews. In een PR-preview is er dus geen backend en werkt de chat niet, tenzij `dabackend` aan die deployment wordt toegevoegd.

> Voor losse demo's van de CLI-tools (`kvk-cli`, `koop-cli`, …) gebruik je de backend-repo; die bevat de standalone bash-tools.

### Demo-modus (zonder backend)

Zonder backend of API-sleutel blijft het grootste deel van de assistent onzichtbaar: het deelverzoek, de energiekaart uit de Business Wallet, de vraagformulieren en de zaak die bij de RVO wordt ingediend komen allemaal uit backend-events. **Demo-modus** speelt die events af uit een draaiboek, zodat je ze zonder backend kunt zien, beoordelen en tonen.

Aanzetten via het feature-flags-paneel rechtsonder → kopje "Digitale Assistent" → **Demo-modus** (localStorage `setting:demo-mode`). Zolang die aanstaat gaat er geen enkele request naar de backend; ook `/health` en de RegelRecht-drempel komen uit het draaiboek, zodat de bronstatus niet ten onrechte "niet bereikbaar" toont.

Het draaiboek staat in `assets/javascript/digitale-assistent-demo.js` en levert dezelfde events als de backend (`status`, `tool`, `case`, `answer`, `error`). `digitale-assistent.js` verwerkt ze via `verwerkEvent()` — hetzelfde renderpad als een echte beurt. Wat in demo-modus te zien is, is dus wat live ook gebeurt.

**Bronvermelding.** Elke bronvermelding in de chat gebruikt hetzelfde patroon (`.chat-bronnen`): bron en titel apart, met de datum van raadpleging, en bij een URL een externe link met `rel="external noopener" target="_blank"`. Dat geldt voor het antwoord, voor de regel onder een vraagformulier en voor de energiekaart uit de Business Wallet.

De chat vult die lijst uit twee bronnen, in deze volgorde:

1. **Veld `bronnen` op het `answer`-event** — een lijst van `{ label, titel?, url?, geraadpleegdOp? }`. Het draaiboek van de demo gebruikt dit.
2. **De slotregel van de antwoordtekst** — de backend schrijft de bron als laatste regel: `Bron: RegelRecht (art. 5.15 Besluit activiteiten leefomgeving)` (zie `prompts/blocks/shared/format.md` in de [backend-repo](https://github.com/MinBZK/moza-poc-digitale-assistent)). `haalBronnenUitTekst()` haalt die regel eraf en rendert hem als bronvermelding. Ook een `Bronnen:`-kop met een opsomming eronder wordt herkend.

Zo krijgt een live antwoord dezelfde vormgeving als de demo, zonder dat de backend iets hoeft te veranderen. Herkent de parser niets, dan blijft de tekst onaangeroerd — een opsomming midden in een antwoord wordt nooit als bronvermelding gelezen.

**Links op bronnen.** De backend noemt een bron alleen bij naam ("Bron: RegelRecht"), zonder verwijzing. De link komt daarom uit het veld `url` in `STATUS_ITEMS` (`digitale-assistent.js`) — dezelfde lijst die de statusregel boven het gesprek vult. `bronURL()` zoekt de naam terug, zodat zowel "KvK" als "KvK Handelsregister" raak is. Een bron die zijn eigen `url` meestuurt (het demo-draaiboek doet dat, met diepe links naar het wetsartikel) wint van de lijst.

| Bron                | Link                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| RegelRecht          | <https://regelrecht.rijks.app/>                                      |
| KvK Handelsregister | <https://www.kvk.nl/handelsregister/>                                |
| KOOP Regelingenbank | <https://wetten.overheid.nl/>                                        |
| RVO                 | <https://www.rvo.nl/>                                                |
| Business Wallet     | geen — mock in dit prototype, dus die bron toont de naam zonder link |

| Vraag in de chat                                       | Wat je te zien krijgt                                                                                                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Geldt de energiebesparingsinformatieplicht voor mij?" | Vier beurten: deelverzoek Business Wallet → energiekaart met grens-annotatie → getrapt categorieformulier → maatregelenlijst (EML, met één voorgevuld veld en toelichting) → `case`-event met knop naar Lopende zaken |
| "Hoe kan ik mijn bedrijfsgegevens bekijken?"           | Deelverzoek voor het KvK Handelsregister, daarna het uittreksel met bronvermelding                                                                                                                                    |
| "Hoe bereid ik mijn belastingaangifte voor?"           | Vraagformulier met gemengde veldtypen (keuze + open veld), daarna het antwoord                                                                                                                                        |
| "fout"                                                 | De foutmelding met de knop "Neem contact op"                                                                                                                                                                          |
| "Leg mij dit uit"                                      | Uitleg-antwoord; het formulier blijft staan (schuift het draaiboek niet vooruit)                                                                                                                                      |
| "Niet delen" in een deelverzoek                        | De assistent respecteert de weigering en raadpleegt de bron niet                                                                                                                                                      |
| Persona buiten de allowlist                            | "Log eerst in" — als gewoon antwoord, niet als foutmelding                                                                                                                                                            |

De inhoud volgt de **actieve persona**: het uittreksel toont de gegevens uit `_data/personas.json` en de energiekaart het verbruik uit `bedrijf.energie` (alleen Koffiezaak Noon heeft dat; de rest krijgt een demo-verbruik boven de drempel). Blijft een persona onder beide drempels, dan eindigt het scenario met "geldt niet voor u" in plaats van een rapportage.

Losse onderdelen bekijken zonder een gesprek te voeren kan met de knoppen in hetzelfde paneel: testantwoord met bronvermelding, deelverzoek Business Wallet, formulier maatregelenlijst en formulier ja/nee-vraag. "Nieuw gesprek" zet het draaiboek terug op de eerste beurt.

### API-sleutels

Gebruikers kunnen hun eigen VLAM- en Claude-sleutel invullen via het feature-flags-paneel rechtsonder in de site. Deze worden per request als `X-VLAM-API-Key` / `X-Claude-API-Key` header naar de backend meegestuurd (de proxy laat die headers door). Dit werkt zolang de backend `ALLOW_API_KEY_OVERRIDE=true` heeft (PoC-default); lege velden vallen terug op de server-side keys.

> Let op: een **Claude**-sleutel uit de UI werkt zelfstandig. Voor **VLAM** vraagt de UI alleen de sleutel, maar VLAM heeft ook `VLAM_BASE_URL` + `VLAM_MODEL_ID` nodig — die moeten server-side op de backend staan. Het eenvoudigst is om de server-side keys op de backend-deployment te zetten, dan werkt de chat voor iedereen zonder iets in te vullen.

### Sessie-identiteit

De frontend stuurt bij elke chat-request de header `X-Test-User` met het **KvK-nummer van de actieve persona** (uit `_data/personas.json`). De backend toetst dat aan zijn allowlist `TEST_KVK_NUMMERS` en injecteert het nummer vervolgens server-side bij elke bronaanroep (PDR-009 in de [backend-repo](https://github.com/MinBZK/moza-poc-digitale-assistent)). De parameter `kvk_nummer` is uit alle tool-schema's gestript, dus het model ziet 'm niet en kan de identiteit niet kiezen — ook niet als iemand in het gesprek een ander nummer noemt.

Het nummer komt uit één van twee plekken, waarbij de eerste voorgaat:

1. **Flags-paneel** → veld "KvK-nummer assistent" (localStorage `setting:test-user-kvk`). Handmatige override, handig om een nummer buiten de allowlist te testen. Wijzigen start een schoon gesprek.
2. **Actieve persona** → het veld `kvkNummer` van die persona in `_data/personas.json`.

Staat het nummer niet in de allowlist van de backend — of is er geen persona — dan antwoordt de assistent "Log eerst in om uw bedrijfsgegevens te kunnen gebruiken." Dat is gewenst gedrag, geen fout: alleen persona's met een backend-profiel zien bedrijfsgegevens. Bij een persona-wissel start de frontend een nieuwe sessie, zodat het gesprek van de vorige identiteit niet doorloopt.

> ⚠️ **Dit is geen authenticatie.** Een gebruiker kan de header in de browser aanpassen en zo een andere testpersona worden; de allowlist begrenst alleen wélke nummers werken. Met een token was dat niet anders — dat stond leesbaar in de paginabron. Voor een gesloten testgroep met uitsluitend fictieve bedrijven is dat aanvaardbaar. Echte identiteitsvaststelling (eHerkenning/DigiD, via de NL GOV-profielen van OAuth/OIDC) is BETA-02 in de backend-repo.

**Persona's met een backend-profiel.** De backend kent alleen deze bedrijven; voor de rest volgt terecht "log eerst in".

| Persona-id      | Bedrijf             | KvK      | Bron backend-zijde                   |
| --------------- | ------------------- | -------- | ------------------------------------ |
| `koffiezaak`    | Koffiezaak Noon     | 85234567 | mock in `services/mcp/kvk/server.py` |
| `bloemenkweker` | Kwekerij De Bloesem | 62345681 | mock in `services/mcp/kvk/server.py` |
| `haarstylist`   | Roots & Locks       | 56789012 | mock in `services/mcp/kvk/server.py` |

Een persona toevoegen is dus twee stappen: een profiel in de backend en het KvK-nummer in `TEST_KVK_NUMMERS` daar. Aan deze kant is niets nodig zolang `_data/personas.json` hetzelfde nummer heeft. Houd de gegevens in beide bronnen gelijk, anders toont de pagina Bedrijfsgegevens iets anders dan de assistent vertelt.

#### De ontvanger bij een bijlage uit het stelsel

Een bijlage uit het Federatief Berichtenstelsel is een gewone URL die de browser zelf ophaalt, en
het stelsel eist daarbij de header `X-Ontvanger`. Een `<a href>` en een `<object data>` kunnen die
niet meesturen, dus zet `berichtenbox-keten.js` de ontvanger in een cookie en maakt de proxy er weer
een header van (`location ~ ^/api/v1/berichten/.../bijlagen/...` in de template). Alle andere
aanroepen zetten de header gewoon zelf.

Dat cookie is **geen** beveiliging — de bezoeker kan het net zo goed zelf zetten als de header, en
het stelsel houdt zijn eigen controle. De waarde is wel een identiteit, dus het reist zo min
mogelijk mee: `path=/api/v1/berichten`, `SameSite=Strict` en `Secure` zodra de pagina over https
gaat. Geen vervaltijd, dus een sessiecookie: het leeft zolang de browserzitting duurt. Een vaste vervaltijd
brak precies het normale geval: het cookie wordt alleen bij een paginalading gezet, en de inbox is
een pagina die blijft openstaan. Na afloop gaf elke bijlage een 400 zonder melding.

Wat er in staat is bij deze persona's altijd `KVK:<nummer>`; `berichtenbox-keten.js` matcht daar hard op. Kent
het stelsel straks ook ontvangers op BSN, dan staat er een BSN in en telt dat als bijzonder
persoonsgegeven.

Bij een persona-wissel wordt het gewist, op het nieuwe én op het oude pad, want anders haalt een klik
het document van de vorige persona op.

Uit die identiteit volgt één regel voor de proxy-config: **zet `$http_cookie` nergens in een
logformaat of debug-regel.** Het standaard nginx-logformaat doet dat niet, en zo hoort het te
blijven.

#### Op een deployment

Niets in te stellen aan de frontend-kant: er is geen build-variabele, geen repo-secret en geen build-arg voor de identiteit. Zet alleen op de **backend**-deployment `TEST_KVK_NUMMERS=85234567,62345681,56789012`. Ontbreekt die, dan antwoordt de assistent overal "log eerst in".

### Demo: informatieplicht energiebesparing

Voor de demo van de ideale flow van de informatieplicht energiebesparing (Dag van de Toekomst, 18 juni 2026) bevat het prototype de testpersona **Claudia van Dam**, eigenaar van **Koffiezaak Noon** in Rotterdam (KvK 85234567, eenmanszaak, SBI 56102 Cafés). Kies haar via het feature-flags-paneel rechtsonder (kopje "Persona's") of via `?persona=Horecaondernemer` in de URL.

Of de informatieplicht geldt, bepaalt een business rule: het jaarverbruik van de actieve persona (`bedrijf.energie` in `_data/personas.json`) wordt vergeleken met de wettelijke drempel uit RegelRecht (50.000 kWh / 25.000 m³, gespiegeld in `_data/regelrecht.json`). Komt het verbruik daarboven — zoals bij Claudia — dan toont het dashboard bovenaan een melding over de informatieplicht energiebesparing (stap 0) met een knop naar de digitale assistent. Dezelfde drempel-check staat op de detailpagina van de Wet milieubeheer; daar opent de knop het assistent-gesprek meteen met een startvraag (stap 1, via de URL-parameter `?vraag=…`, gevuld uit het veld `assistentVraag`). De geraadpleegde bronnen (KvK Handelsregister, netbeheerder) toont de assistent in het gesprek zelf. De stappen daarna — verbruik raadplegen, toets, geldende maatregelen, indienen en bevestiging — doet de assistent in het gesprek zelf (backend). Na indiening verschijnt de zaak via het `case`-event onder Lopende zaken.

> ⚠️ **Allowlist nodig voor de Claudia-flow.** De assistent gebruikt alleen de gegevens van Koffiezaak Noon als 85234567 in `TEST_KVK_NUMMERS` op de backend staat (zie [Sessie-identiteit](#sessie-identiteit)); anders antwoordt die "log eerst in". Wisselen van persona kan zonder herstart van de backend: de identiteit volgt de header, niet de omgeving.

### Containerisatie

De `container/Containerfile` bouwt de statische site (frontend-only): een Node-builder genereert de Eleventy-site en Storybook, en een **nginx**-image serveert die op poort 8080 én doet de **same-origin reverse proxy** naar de backend (zie [Verbinden met de backend](#verbinden-met-de-backend)). De proxy-config (`container/default.conf.template`) wordt bij container-start gerenderd met `envsubst`; `BACKEND_ORIGIN` (runtime env, default `http://dabackend:8000`) bepaalt de upstream, met runtime-DNS-resolutie zodat nginx ook start als de backend nog niet up is. Dezelfde image (non-root, poort 8080) wordt gebruikt voor preview- en productiedeploys (ZAD).

```bash
docker build -f container/Containerfile -t moza .
# wijs de proxy naar een lokaal draaiende backend (Docker Desktop):
docker run --rm -p 8080:8080 -e BACKEND_ORIGIN=http://host.docker.internal:8000 moza
```

#### Welke backend krijgt welk pad

De proxy bedient drie ongerelateerde diensten. Elke variabele is runtime-env op de container en
mag leeg blijven; wat er dan gebeurt staat in de laatste kolom.

| Variabele | Bedient | Leeg gelaten |
| --- | --- | --- |
| `BACKEND_ORIGIN` | `/chat`, `/chat/stream`, `/health`, `/tools` — de Digitale Assistent | default `http://dabackend:8000` |
| `BACKEND_API` | de catch-all `/api/` en de terugval van `BACKEND_PROFIEL` en `BACKEND_API_2` | valt terug op `BACKEND_ORIGIN` |
| `BACKEND_PROFIEL` | `/api/profielservice/` | valt terug op `BACKEND_API` |
| `BACKEND_API_2` | `/api/other/` (voorbeeld) | valt terug op `BACKEND_API` |
| `BACKEND_KETEN` | `/api/v1/` — de berichtenuitvraag van het Federatief Berichtenstelsel | default: de publieke omgeving van FBS. Expliciet leeggemaakt: **502**; onder `/api/v1/` met de variabelenaam erin, bij een bijlage-adres bewust zonder |
| `BACKEND_PERSONAS` | `/api/demo/personas` — de testaccountlijst, een eigen publieke dienst | default: de publieke lijst van FBS; leeggemaakt valt hij terug op `BACKEND_DEMO` |
| `BACKEND_DEMO` | de rest van `/api/demo/` — de demo-console | valt terug op `BACKEND_KETEN`, anders **502** |
| `BACKEND_KETEN_HOST` | de `Host`-header naar de uitvraag | de host van de browser |
| `BACKEND_DEMO_HOST` | de `Host`-header naar de demo-console | valt terug op `BACKEND_KETEN_HOST` |
| `BACKEND_PERSONAS_HOST` | de `Host`-header naar de testaccountlijst | valt terug op `BACKEND_DEMO_HOST` |

Drie dingen om te weten bij het uitrollen:

- **Het stelsel valt niet terug.** Staat `BACKEND_KETEN` niet, dan antwoordt nginx zelf met een 502
  die de variabelenaam noemt. Dat is met opzet: doorsturen naar de chat-backend leverde een 404 of
  een DNS-fout uit een dienst die deze paden niet kent, en dan is niet te zien dát er een variabele
  ontbreekt.
- **Elke route bewaakt zijn eigen variabele.** Is die leeg — en de terugval erachter ook — dan
  antwoordt de proxy met een 502 die zegt welke variabele ontbreekt, in plaats van met een kale 500
  (`invalid URL prefix` in het logboek). `BACKEND_ORIGIN` leegmaken legt dus alleen `/chat`,
  `/health` en `/tools` stil; staat `BACKEND_API` dan op een werkende dienst, dan blijft alles onder
  `/api/` gewoon werken.
- **De keten heeft een default naar de publieke omgeving van FBS.** Zonder die default toont elke
  PR-preview een configuratie-502 voor de aangesloten persona's, want de deploy-action kan geen
  runtime-env zetten. Het adres staat in `container/Containerfile` en wijst naar hun `test`. Wijs
  het niet naar een PR-omgeving van hen: die wordt opgeruimd zodra hun PR sluit, en dan wijzen deze
  defaults naar een dood adres. Dat leest als een storing en niet als een configuratiefout, want de
  variabele ís gezet.
- **Een configuratiefout is te herkennen aan `X-Proxy-Configuratie`.** Die header staat op het
  502-antwoord van elke guard en noemt de ontbrekende variabele. Een omgevallen upstream geeft óók
  een 502, maar zonder die header — daarmee kan de berichtenbox "deze omgeving is niet volledig
  ingericht" zeggen in plaats van "ververs de pagina", wat tegen een lege variabele nooit helpt.
- **De testaccountlijst staat los van de demo-console.** `/api/demo/personas` is een eigen,
  publiek bereikbare deployment; de rest van de console (storingen schakelen, berichten opvoeren)
  zit achter een SSO-muur. Zo'n muur blokkeert ook server-side proxyen: deze container heeft geen
  sessie en het cookie van de bezoeker geldt op een andere host, dus die paden geven een 403. Dat is
  geen gemis — de berichtenbox roept alleen de lijst aan.
- **`/health` zegt niets over deze container.** Dat pad proxyt naar de Digitale-Assistent-backend.
  Draait die niet in de omgeving, richt een health-check dan niet op `/health` — die faalt dan
  terwijl de proeftuin het prima doet.

---

## Storybook

[Storybook](https://storybook.js.org/) is de omgeving om afzonderlijke componenten te bekijken, testen en documenteren.

### Lokaal opstarten

```bash
npm run storybook
```

Storybook is vervolgens te bekijken op [`localhost:6006`](http://localhost:6006).

### Automatisch bouwen

Bij het gebruik van `npm run dev` wordt Storybook automatisch opnieuw gebouwd naar `_site/storybook` wanneer bestanden in `stories/` of `style/style.css` wijzigen. Dit gebeurt via [chokidar](https://www.npmjs.com/package/chokidar-cli) die het `build-storybook` script triggert bij elke wijziging.

### Stories

De stories staan in de `stories/` map. Elk bestand beschrijft één component en toont varianten, bijvoorbeeld:

| Bestand                  | Beschrijving                                 |
| ------------------------ | -------------------------------------------- |
| `Knop.stories.js`        | Knopvarianten (primair, secundair, negatief) |
| `Link.stories.js`        | Linkvarianten                                |
| `Tekstinvoer.stories.js` | Tekstinvoervelden                            |
| `Selectie.stories.js`    | Selectievakjes en keuzerondjes               |
| `Feedback.stories.js`    | Notificaties en foutmeldingen                |
| `Navigatie.stories.js`   | Navigatiecomponenten                         |
| `Typografie.stories.js`  | Koppen en tekststijlen                       |
| `Tabel.stories.js`       | Tabelopmaak                                  |

---

### NPM scripts

Installeer dependencies in de root van het project:

```bash
npm install
```

| Script                    | Commando                       | Beschrijving                                                                                                                                                                                        |
| ------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`             | Eleventy serve + token watcher | Beide parallel via `concurrently`. Eleventy `--serve` met live reload op [`localhost:8080`](http://localhost:8080); de chat-backend draai je apart (zie [Digitale Assistent](#digitale-assistent)). |
| `npm run build`           | Tokens + Eleventy              | Volledige productie-build                                                                                                                                                                           |
| `npm run build:tokens`    | Alleen Style Dictionary        | Handmatig tokens bouwen                                                                                                                                                                             |
| `npm run storybook`       | Storybook dev server           | Componentenbibliotheek lokaal bekijken                                                                                                                                                              |
| `npm run build-storybook` | Storybook productie-build      | Statische Storybook-site bouwen                                                                                                                                                                     |
| `npm run proxy`           | node server/proxy.js           | Start de lokale proxy server die API-requests kan doorsturen of mocken (open een aparte terminal om deze te draaien tijdens ontwikkeling).                                                          |
| `npm run vite:build`      | vite build                     |                                                                                                                                                                                                     |
| `npm run format`          | prettier --write .             |                                                                                                                                                                                                     |

---

## Structuur

```text
📂 _data                    Eleventy-data: persona's, subsidies, regelgeving, berichtenbox, activiteitenlog-entries
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

```text
--prefix-categorie-optionelesubcategorie-attribuut--optionelestaat
```

Voorbeelden:

- `--rijkhuisstijl-color-lintblauw-50`
- `--toepassing-button-primary-background-color`

### Logical properties

In de stylesheets worden [CSS ‘logical’ properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values) gebruikt in plaats van ‘physical’ properties. Logical properties passen zich automatisch aan op basis van de schrijfrichting (`direction`) en schrijfmodus (`writing-mode`), wat de CSS toekomstbestendig en beter geschikt maakt voor meertalige ondersteuning.

Voorbeelden van physical properties en hun logical equivalenten:

| Physical                         | Logical                                       |
| -------------------------------- | --------------------------------------------- |
| `width`                          | `inline-size`                                 |
| `height`                         | `block-size`                                  |
| `max-width`                      | `max-inline-size`                             |
| `min-height`                     | `min-block-size`                              |
| `margin-top` / `margin-bottom`   | `margin-block-start` / `margin-block-end`     |
| `margin-left` / `margin-right`   | `margin-inline-start` / `margin-inline-end`   |
| `padding-top` / `padding-bottom` | `padding-block-start` / `padding-block-end`   |
| `padding-left` / `padding-right` | `padding-inline-start` / `padding-inline-end` |
| `border-top` / `border-bottom`   | `border-block-start` / `border-block-end`     |

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
