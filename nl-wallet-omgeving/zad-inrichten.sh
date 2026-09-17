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

# Kerncontainer: niet publiek, wel een persistent volume. Alles draait in één pod, dus ruimer
# geheugen dan een gewone webapp; resource-tuning van het platform stelt het daarna bij.
zad component add nlw --port 8080 --memory-limit 2Gi --cpu-limit 2
zad service persistent-storage add data --component nlw --size 1Gi --mount-path /data

for component in "${proxy_componenten[@]}"; do
	zad component add "${component}" --port 8080 --service publish-on-web
done

# Hostnamen <component>.moza.rijksapp.dev, zoals proef.moza.rijksapp.dev bij deployment poc.
zad deployment create "${deployment}" --component nlw --image "${kern}" \
	--base-domain rijksapp.dev --subdomain moza --domain-format component.subdomain --yes
for component in "${proxy_componenten[@]}"; do
	zad component assign "${component}" "${deployment}" --image "${proxy}"
done
zad service config set publish-on-web --target deployment --deployment "${deployment}" \
	--set base-domain=rijksapp.dev --set subdomain=moza --set domain-format=component.subdomain \
	--set issuer=letsencrypt --yes

command zad project refresh
command zad deployment describe "${deployment}"
