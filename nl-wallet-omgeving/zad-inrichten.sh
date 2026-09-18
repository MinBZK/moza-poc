#!/usr/bin/env bash
#
# Richt deployment `nlw` in ZAD-project mwt-ked (MOZa wallet testomgeving) in. Eenmalig, met de zad-cli
# (https://github.com/RijksICTGilde/zad-cli) en een project-key (`zad project use mwt-ked`).
# Daarna houdt de workflow de images bij.
#
# Gebruik: zad-inrichten.sh <kern-image> <proxy-image>

set -euo pipefail

kern="${1:?Geef het kern-image op}"
proxy="${2:?Geef het proxy-image op}"
deployment=nlw
proxy_componenten=(nlw-wp nlw-static nlw-ups nlw-pid nlw-issuance nlw-verifier)

# Alles eerst opslaan, aan het eind in één keer uitrollen.
zad() {
	command zad --no-rollout "$@"
}

# Kerncontainer: niet publiek, wel een persistent volume. Geheugen en CPU stelt het platform
# zelf bij (resource-tuning); --memory-limit/--cpu-limit gaven bij het aanmaken een 422.
zad component add nlw --port 8080
zad service persistent-storage add data --component nlw --size 1Gi --mount-path /data

for component in "${proxy_componenten[@]}"; do
	zad component add "${component}" --port 8080 --service publish-on-web
done

# Hostnamen nlw-<dienst>.moza-wallet.rijksapp.dev. Een eigen subdomein moet ZAD-beheer goedkeuren;
# tot die tijd serveert het platform op nlw-<dienst>-nlw-mwt-ked.rig.prd1.gn2.quattro.rijksapps.nl
# en moet NLW_HOST_PATROON (hieronder) die vorm aan de kerncontainer vertellen.
zad deployment create "${deployment}" --component nlw --image "${kern}" \
	--base-domain rijksapp.dev --subdomain moza-wallet --domain-format component.subdomain --yes
for component in "${proxy_componenten[@]}"; do
	zad component assign "${component}" "${deployment}" --image "${proxy}"
done
zad service config set publish-on-web --target deployment --deployment "${deployment}" \
	--set base-domain=rijksapp.dev --set subdomain=moza-wallet --set domain-format=component.subdomain \
	--set issuer=letsencrypt --yes

# De kerncontainer bouwt zijn publieke adressen uit dit domein (zie rootfs/opt/nlw/sbin/omgeving).
# Zolang het subdomein niet is goedgekeurd: in plaats daarvan het clusteradres als patroon.
zad env add NLW_DOMEIN=moza-wallet.rijksapp.dev --component nlw --deployment "${deployment}"
zad env add "NLW_HOST_PATROON=nlw-{naam}-${deployment}-mwt-ked.rig.prd1.gn2.quattro.rijksapps.nl" --component nlw --deployment "${deployment}"

# Een Service heet op ZAD <deployment>-<component>; de proxy's melden bij het starten alle
# *_SERVICE_HOST-variabelen, mocht dat ooit anders zijn.
for component in "${proxy_componenten[@]}"; do
	zad env add "NLW_KERN=${deployment}-nlw:8080" --component "${component}" --deployment "${deployment}"
done

command zad project refresh
command zad deployment describe "${deployment}"
