#!/usr/bin/env bash
#
# Richt deployment `nlw` in ZAD-project pm-5sj in. Eenmalig, met de zad-cli
# (https://github.com/RijksICTGilde/zad-cli) en een project-key (`zad project use pm-5sj`).
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

# Hostnamen <component>.nlw.moza.rijksapp.nl. Het subdomein moza op rijksapp.dev is van deployment
# poc (proef.moza.rijksapp.dev) en kan niet door een tweede deployment gebruikt worden; op
# rijksapp.nl delen de onderzoeksreleases het al met domain-format deployment.subdomain.
zad deployment create "${deployment}" --component nlw --image "${kern}" \
	--base-domain rijksapp.nl --subdomain moza --domain-format component.deployment.subdomain --yes
for component in "${proxy_componenten[@]}"; do
	zad component assign "${component}" "${deployment}" --image "${proxy}"
done
zad service config set publish-on-web --target deployment --deployment "${deployment}" \
	--set base-domain=rijksapp.nl --set subdomain=moza --set domain-format=component.deployment.subdomain \
	--set issuer=letsencrypt --yes

# De kerncontainer bouwt zijn publieke adressen uit dit domein (zie rootfs/opt/nlw/sbin/omgeving).
zad env add NLW_DOMEIN=nlw.moza.rijksapp.nl --component nlw --deployment "${deployment}"

# Een Service heet op ZAD <deployment>-<component>; de proxy's melden bij het starten alle
# *_SERVICE_HOST-variabelen, mocht dat ooit anders zijn.
for component in "${proxy_componenten[@]}"; do
	zad env add "NLW_KERN=${deployment}-nlw:8080" --component "${component}" --deployment "${deployment}"
done

command zad project refresh
command zad deployment describe "${deployment}"
