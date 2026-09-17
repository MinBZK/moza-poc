#!/usr/bin/env bash
#
# Bouwt de NL Wallet-binaries voor de testomgeving, met dezelfde cargo-features als
# scripts/start-devenv.sh in de NL Wallet-repo, behalve test_internal_ui (Swagger).
# Draai vanuit wallet_core; het eerste argument is de map waar de binaries heen gaan.
#
# Alles in één cargo-aanroep, zodat gedeelde crates één keer compileren. Cargo voegt de
# features van gedeelde crates dan samen; voor een testomgeving is dat geen bezwaar.

set -euo pipefail

uitvoer="${1:?Geef de uitvoermap op}"

binaries=(
	wallet_provider
	wallet_provider_migrations
	audit_log_migrations
	pid_issuer
	pid_issuer_migrations
	issuance_server
	issuance_server_migrations
	verification_server
	verification_server_migrations
	demo_issuer
	static_server
	update_policy_server
	gba_hc_converter
	gba_encrypt
	wallet_ca
)

pakketten=()
for binary in "${binaries[@]}"; do
	pakketten+=(--bin "${binary}")
done

cargo build --locked --release \
	"${pakketten[@]}" \
	--features wallet_provider/android_emulator \
	--features pid_issuer/allow_insecure_url \
	--features issuance_server/allow_insecure_url \
	--features verification_server/allow_insecure_url \
	--features demo_issuer/allow_insecure_url \
	--features static_server/allow_insecure_url

mkdir -p "${uitvoer}"
for binary in "${binaries[@]}"; do
	cp "target/release/${binary}" "${uitvoer}/"
done
ls -lh "${uitvoer}"
