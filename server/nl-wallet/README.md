# Inloggen met NL Wallet

MOZa als verifier (relying party) van de [NL Wallet](https://github.com/MinBZK/nl-wallet). Op de inlogkeuze (`/inloggen/zakelijk/`) opent de kaart “Inloggen met een wallet” direct het venster van NL Wallet met de QR-code; de gebruiker deelt voornaam, achternaam en de bevoegdheid voor de onderneming (demo-attestatie van “KVK Demo”). Onderaan in de grijze overlay staat een link om die bevoegdheid eerst in de wallet te zetten; onder dat venster staat een link terug naar inloggen, en sluiten opent het inlogvenster ook weer. Na het inloggen staat de naam in de balk van MijnOverheid Zakelijk; de persona volgt uit het KVK-nummer in de bevoegdheid.

## Onderdelen

| Onderdeel                                        | Wat het doet                                                                                                                                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_includes/nl-wallet-inloggen.njk`               | Meldingen, de link in de overlay en de plek voor de onzichtbare knoppen van NL Wallet; opgenomen in `inloggen/index-zakelijk.html`                                                                                     |
| `inloggen/index-zakelijk.html`                   | De kaart “Inloggen met een wallet” (`data-nl-wallet-inloggen`)                                                                                                                                                         |
| `inloggen/nl-wallet-terug.html`                  | Terugkeer na inloggen op dezelfde telefoon                                                                                                                                                                             |
| `assets/javascript/nl-wallet-inloggen.js`        | Opent de vensters via onzichtbare knoppen van NL Wallet, volgt de sessie, bewaart de naam in `sessionStorage` (`inlog:persoon`) en stuurt door                                                                         |
| `assets/javascript/personas.js`                  | Toont die naam in plaats van de naam van de persona                                                                                                                                                                    |
| `assets/javascript/vendor/nl-wallet-web.iife.js` | `wallet_web` uit de NL Wallet-repo (EUPL-1.2), gebouwd uit `wallet_web/dist`                                                                                                                                           |
| `server/nl-wallet.js`                            | Serveert `_site`, de endpoints `POST /api/nl-wallet/sessies`, `GET /api/nl-wallet/sessie`, `GET /api/nl-wallet/sessies/:token/gegevens` en `GET /api/nl-wallet/config`, en de download `/downloads/nl-wallet-moza.apk` |
| `server/nl-wallet/verifier.js`                   | Praat met de verification_server; getest in `tests/nl-wallet/`                                                                                                                                                         |
| `server/nl-wallet/lokaal-inrichten.sh`           | Richt de lokale NL Wallet-omgeving in: MOZa als verifier, KVK Demo als uitgever van de bevoegdheid, en de testpersonen                                                                                                 |

## Het venster van NL Wallet

De knoppen van `wallet_web` staan onzichtbaar op de pagina (`.nl-wallet-onzichtbaar::part(button) { display: none }`); het script klikt ze aan vanuit de gewone inlogkaart. Het venster zelf blijft van NL Wallet, zodat het bij elke relying party hetzelfde is. Twee dingen om te weten:

- Het venster is `position: fixed` met `z-index: 1045` in de shadow DOM. Een voorouder met `container-type` wordt dan de referentie en het venster beslaat maar een deel van het scherm; het script hangt de knoppen en de link daarom direct onder `<body>`. De link in de overlay ligt met `z-index: 1046` net boven het venster.
- Het venster voor de bevoegdheid werkt met vaste links (`same-device-ul`, `cross-device-ul`). Die variant van `wallet_web` weet niet wanneer de uitgifte klaar is en meldt alleen `close`, nooit `success`. Daarom geen automatische terugkeer, maar de link “Ga verder met inloggen” onder dat venster; sluiten opent het inlogvenster ook.
- Wisselen tussen inlogvenster en bevoegdheid-venster gaat door de onzichtbare knop weg te halen. De eigen sluitknop van NL Wallet vraagt in de beginstand eerst “Wilt u stoppen?”.

## Na “Gelukt” direct door

De knop van NL Wallet meldt een geslaagde sessie pas aan de pagina als de gebruiker het venster sluit. Daarom onthoudt de server bij `POST /api/nl-wallet/sessies` het sessietoken in een HttpOnly-cookie (`nl-wallet-sessie`, alleen op `/api/nl-wallet`), en volgt de pagina na een klik op de knop `GET /api/nl-wallet/sessie`. Staat de sessie op `DONE`, dan geeft dat endpoint meteen naam en bevoegdheid mee, wist het cookie, en stuurt de pagina door. Sluiten van het venster blijft een tweede weg naar hetzelfde doel.

## Bevoegdheid als attestatie

Op proef is een eigenaar van een eenmanszaak bevoegd omdat die met de eigen DigiD inlogt. In de wallet is die bevoegdheid een eigen attestatie, `com.example.kvk_bevoegdheid` (SD-JWT), uitgegeven door de fictieve uitgever “KVK Demo” via de issuance_server van NL Wallet. De wallet deelt eerst het BSN uit de PID; de demo_issuer zoekt daar de bevoegdheden bij.

| Bestand                                        | Inhoud                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `attestaties/com.example.kvk_bevoegdheid.json` | Type-metadata: KVK-nummer, handelsnaam, rechtsvorm, functie, bevoegdheid                                      |
| `attestaties/kvk_issuer_auth.json`             | Organisatiegegevens van KVK Demo in het uitgevercertificaat                                                   |
| `attestaties/bevoegdheden.json`                | Ondernemingen met hun bevoegdheid en houders (BSN); per onderneming een eigen uitgifte `kvk_bevoegdheid_<id>` |

Inloggen vraagt de PID-naam én de bevoegdheid. Beide zijn verplicht: NL Wallet weigert DCQL `credential_sets`, dus een optioneel onderdeel kan niet. Heeft precies één persona het KVK-nummer uit de bevoegdheid, dan gaat de gebruiker door naar die persona.

## Twee ondernemingen voor Claudia

Claudia van Dam is eigenaar van Koffiezaak Noon (persona Horecaondernemer, KVK 85234567) en van Koffiebranderij Blend (persona Koffiebrander, KVK 91827364). Onder het inlogvenster staat per onderneming een link om die bevoegdheid in de wallet te zetten; de titel boven het venster noemt de onderneming.

NL Wallet deelt per gevraagd type één kaart (DCQL `multiple` wordt geweigerd). Heeft Claudia beide bevoegdheden, dan kiest ze bij het inloggen in de app welke ze deelt; MOZa kiest de persona op het KVK-nummer daarvan.

In het portaal staat daarom **Mijn ondernemingen** in de balk (`nl-wallet-portaal.js`, markup in `_includes/header-overheid.njk`): de ondernemingen waarvan in deze sessie een bevoegdheid is gedeeld (`sessionStorage` `inlog:ondernemingen`), met per onderneming een link naar de persona met dat KVK-nummer. Onderaan staat “Andere onderneming toevoegen met NL Wallet”: dat opent `/inloggen/zakelijk/?onderneming=toevoegen`, waar het venster direct opengaat. De gedeelde bevoegdheid komt erbij, mits naam en achternaam horen bij wie al is ingelogd.

## NL Wallet MOZa installeren

`/inloggen/nl-wallet/app/` legt uit hoe een collega de testapp installeert en Claudia toevoegt, met een downloadknop naar `/downloads/nl-wallet-moza.apk`. Lokaal is dat de debug-APK uit de NL Wallet-build; die werkt alleen met een telefoon die via USB (`adb reverse`) aan deze Mac hangt. Voor collega’s is een build nodig met de adressen van een online NL Wallet-omgeving; zet het downloadadres dan in `NL_WALLET_APP_URL`.

## Testpersonen

`server/nl-wallet/testpersonen/` bevat fictieve personen die alleen in de lokale omgeving bestaan, zodat de lokale MOZa-wallet niet dezelfde gebruikers heeft als de pre-prod-wallet. `lokaal-inrichten.sh` zet ze in de mock-BRP en op de mock-DigiD-pagina van de pid_issuer. De bestandsnaam is het BSN (een geldig testnummer volgens de elfproef).

| BSN       | Naam                                                                                   | Geboren      | Adres                          |
| --------- | -------------------------------------------------------------------------------------- | ------------ | ------------------------------ |
| 999992004 | Claudia van Dam (persona Horecaondernemer, bevoegd voor Koffiezaak Noon, KVK 85234567) | 12 juni 1986 | Oudedijk 21, 3061 AB Rotterdam |

Laad `nl-wallet-web` niet via npm of een CDN: het pakket met die naam op npm is een beveiligingsplaceholder.

## Lokaal draaien

Vereist een lokale NL Wallet-ontwikkelomgeving (`scripts/setup-devenv.sh` en `scripts/start-devenv.sh --default` in de NL Wallet-repo) en een zelfgebouwde NL Wallet-app die daartegen praat.

```sh
# 1. Verifier voor MOZa inrichten (certificaat, usecase moza_inloggen, CORS)
NL_WALLET_DIR="$HOME/Documents/GitHub/NL wallet" bash server/nl-wallet/lokaal-inrichten.sh

# 2. Site bouwen en de server starten
npm run build
npm run nl-wallet
```

Open http://localhost:8095/inloggen/zakelijk/ en kies “Inloggen met een wallet”. Een Android-telefoon aan USB bereikt de Mac via `adb reverse`; zet daarvoor ook de MOZa-poort door:

```sh
adb reverse tcp:8095 tcp:8095
```

`lokaal-inrichten.sh` herstart de betrokken services zelf en niet via `scripts/start-devenv.sh`. Dat script draait bij elke start `migrations fresh` en gooit `target/status-lists` weg; kaarten die al in een wallet staan zijn daarna niet meer te verifiëren (“not all revocation statuses are valid”) en de wallet moet opnieuw gevuld worden. Draai `start-devenv.sh` voor pid_issuer, issuance_server of verification_server dus alleen als dat de bedoeling is.

Certificaten (MOZa als verifier, KVK Demo als uitgever) maakt het script alleen als ze er nog niet zijn; met `NIEUWE_CERTIFICATEN=1` maakt het nieuwe. Een nieuw certificaat geeft een nieuwe `client_id`, en een QR-code met de oude weigert de wallet (“incorrect client_id”). De inlogpagina haalt de links daarom pas op bij het kiezen van een onderneming.

### Omgevingsvariabelen

| Variabele               | Standaard                      | Betekenis                                                                                                                                              |
| ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NL_WALLET_PORT`        | `8095`                         | Poort van deze server                                                                                                                                  |
| `NL_WALLET_VS_INTERNAL` | `http://localhost:3012`        | Interne (requester) API van de verification_server                                                                                                     |
| `NL_WALLET_VS_PUBLIC`   | `http://localhost:3011`        | Publieke (wallet) API; de browser pollt hier de status                                                                                                 |
| `NL_WALLET_USECASE`     | `moza_inloggen`                | Usecase in de verification_server                                                                                                                      |
| `NL_WALLET_API_KEY`     | leeg                           | Bearer-token voor de interne API, als die er een eist                                                                                                  |
| `MOZA_PUBLIC_URL`       | leeg                           | Basis voor de return-URL na inloggen op dezelfde telefoon; leeg betekent: afleiden uit het verzoek (Host en X-Forwarded-Proto), zodat ook een PR-preview klopt |
| `NL_WALLET_CONFIG`      | `server/nl-wallet/lokaal.json` | JSON met per onderneming de links voor “bevoegdheid toevoegen” en lokaal het pad naar de APK; `lokaal-inrichten.sh` schrijft dit bestand (niet in git) |
| `NL_WALLET_CONFIG_URL`  | leeg                           | Hetzelfde JSON van een URL in plaats van een bestand; de testomgeving serveert het als `/moza.json`. Heeft voorrang op `NL_WALLET_CONFIG`                |
| `NL_WALLET_APP_URL`     | leeg                           | Online downloadadres van NL Wallet MOZa; zonder deze variabele serveert de server de lokale APK                                                        |

## Online testomgeving

De NL Wallet-kant draait online in [MinBZK/moza-wallet-testomgeving](https://github.com/MinBZK/moza-wallet-testomgeving), ZAD-project `mwt-ked`, met `moza/inrichten.sh` als tegenhanger van `lokaal-inrichten.sh` (houd beide gelijk bij wijzigingen in testpersonen of attestaties). De testapp voor die omgeving staat als release bij die repo. Zolang het subdomein `moza-wallet.rijksapp.dev` op goedkeuring wacht, zijn de adressen `nlw-<dienst>-nlw-mwt-ked.rig.prd1.gn2.quattro.rijksapps.nl`.

### Op proef en op PR-previews

De sessie-endpoints draaien op ZAD als eigen component `nlw-api` (image uit `container/nl-wallet-api/Containerfile`, gebouwd door `production.yml` en `preview.yml` als tag `<versie>-nl-wallet-api` in het package van deze repo (bij een preview begint die met `pr-<N>-`, zodat de opruimstap hem meeneemt)) naast `proef`, in dezelfde deployment. De nginx van `proef` proxyt `/api/nl-wallet/` en `/downloads/nl-wallet-moza.apk` ernaartoe; het adres volgt uit `DEPLOYMENT_NAME` (`<deployment>-nlw-api:8095`, zie `container/16-nl-wallet-backend.envsh`), dus elke PR-preview heeft automatisch zijn eigen.

Eenmalig in ZAD-project `pm-5sj` gedaan (met de CLI):

- component `nlw-api` (poort 8095) met de variabelen `NL_WALLET_VS_INTERNAL=http://nlw-nlw.rig-prd-mwt-ked.svc.cluster.local:8080`, `NL_WALLET_VS_PUBLIC=https://nlw-verifier.moza-wallet.rijksapp.dev`, `NL_WALLET_CONFIG_URL=http://nlw-nlw.rig-prd-mwt-ked.svc.cluster.local:8080/moza.json` en `NL_WALLET_APP_URL` (de release van de testapp);
- `cross-domain-access`: een outbound-regel van `nlw-api` naar `mwt-ked`/`nlw`/`nlw` poort 8080, en in project `mwt-ked` de bijbehorende inbound-regel vanaf `pm-5sj`/`nlw-api`. Pods van verschillende ZAD-projecten mogen elkaar anders niet bereiken. De regel laat de deployment open, zodat ook previews (`pr<N>`) erbij mogen.

De deploy-stap van beide workflows geeft de deployment twee componenten (`proef` en `nlw-api`).

## Naar pre-prod

Met de NL Wallet-app van pre-prod werkt dit pas na de [community onboarding](https://edi.pleio.nl/page/view/0c9b8ee6-cadc-4b2b-b84f-5d27cd264b1e/nl-wallet-community) van NL Wallet. De app vertrouwt alleen verifiers met een WRPAC-certificaat van een CA die het NL Wallet-team heeft opgenomen. Wat daarna verandert:

- een eigen CA voor MOZa, gedeeld met het NL Wallet-team, en een WRPAC-certificaat met een publiek bereikbare CRL;
- een verification_server met https (zonder `allow_insecure_url`) en de universal-link-URL van pre-prod;
- deze server, of een gelijkwaardige route in nginx, achter `proef.moza.rijksapp.dev` onder `/api/nl-wallet/`.

De pagina's en scripts in deze repo hoeven daarvoor niet te veranderen.
