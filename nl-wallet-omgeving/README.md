# NL Wallet-testomgeving

Een online NL Wallet-omgeving waartegen een zelfgebouwde NL Wallet-app (Android) kan onboarden, een PID kan ophalen via de mock-DigiD, een KVK-bevoegdheid kan krijgen en kan inloggen bij MOZa. Het is de lokale ontwikkelomgeving van [MinBZK/nl-wallet](https://github.com/MinBZK/nl-wallet) (`scripts/setup-devenv.sh` en `scripts/start-devenv.sh`), in een container op ZAD.

Alleen voor testen met fictieve gegevens. De omgeving gebruikt SoftHSM, een gesimuleerde Play Integrity-controle en testsleutels.

## Opzet

ZAD-project `pm-5sj`, deployment `nlw`.

| Component | Hostnaam | Wat |
|---|---|---|
| `nlw` | geen (intern) | Kerncontainer: alle services, PostgreSQL, redis, SoftHSM, mock-DigiD (nl-rdo-max), BRP-proxy. Persistent volume op `/data`. |
| `nlw-wp` | nlw-wp.nlw.moza.rijksapp.nl | wallet_provider |
| `nlw-static` | nlw-static.nlw.moza.rijksapp.nl | static_server: wallet-config, WIA-statuslijsten, WRPAC-CRL |
| `nlw-ups` | nlw-ups.nlw.moza.rijksapp.nl | update_policy_server |
| `nlw-pid` | nlw-pid.nlw.moza.rijksapp.nl | pid_issuer, met de mock-DigiD-inlogpagina |
| `nlw-issuance` | nlw-issuance.nlw.moza.rijksapp.nl | issuance_server (KVK-bevoegdheid van "KVK Demo") |
| `nlw-verifier` | nlw-verifier.nlw.moza.rijksapp.nl | verification_server (publieke kant) |

De hostnamen staan op `rijksapp.nl`: het subdomein `moza` op `rijksapp.dev` hoort bij deployment `poc` en is niet voor een tweede deployment beschikbaar. `zad-inrichten.sh` maakt de deployment eenmalig aan.

ZAD geeft elk component één hostnaam. De `nlw-*`-componenten zijn daarom kleine nginx-proxy's (`proxy/`) die met de oorspronkelijke Host-header doorsturen naar `nlw:8080`. De nginx in de kerncontainer kiest op die hostnaam de service (`rootfs/opt/nlw/nginx.conf`).

Binnen het project (bijvoorbeeld vanuit MOZa) geeft `http://nlw:8080` de interne API van de verification_server, en `http://nlw:8080/moza.json` de links voor "bevoegdheid toevoegen".

## Bouwen

`.github/workflows/nl-wallet-omgeving.yml` checkt NL Wallet uit op de commit in `versies.env`, bouwt de binaries (`bouw-binaries.sh`) en daarna de images, als tags `nl-wallet-sha-…` en `nl-wallet-proxy-sha-…` in het openbare package `ghcr.io/minbzk/moza-poc`. De images bevatten geen geheimen; sleutels ontstaan bij de eerste start. Op `main` rolt de workflow ze uit naar ZAD.

De app op het toestel moet met dezelfde NL Wallet-commit gebouwd zijn. Verander je `NL_WALLET_REF`, bouw dan ook de app opnieuw.

## Eerste start en persistentie

Op een leeg volume draait `rootfs/opt/nlw/sbin/inrichten` één keer:

1. `publiek-maken.py` zet de devenv-templates om van `localhost` naar de publieke https-adressen, en de TLS-pinning in de wallet-config naar de Let's Encrypt-roots;
2. `scripts/setup-devenv.sh` van NL Wallet maakt CA's, certificaten, HSM-sleutels en configuratie. `cargo run` gaat via een shim naar de binaries in het image;
3. de mock-DigiD krijgt zijn sleutels en configuratie;
4. `moza/inrichten.sh` voegt de MOZa-verifier (usecase `moza_inloggen`), de testpersonen uit `moza/testpersonen/` en de KVK-bevoegdheid (`moza/attestaties/`) toe.

Sleutels, HSM-token, database en configuratie horen bij elkaar. Een nieuw volume betekent een nieuwe omgeving: wallets die tegen de oude omgeving geregistreerd zijn, werken dan niet meer. Migraties draaien bij elke start met `up`, nooit met `fresh`.

`moza/inrichten.sh` is afgeleid van `server/nl-wallet/lokaal-inrichten.sh` op de branch `feat/nl-wallet-inloggen`. Pas wijzigingen in testpersonen of attestaties op beide plekken toe, tot die branch gemerged is.
