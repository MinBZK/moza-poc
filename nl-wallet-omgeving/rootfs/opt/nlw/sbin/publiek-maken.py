#!/usr/bin/env python3
"""Zet de NL Wallet-devenv-templates om van localhost naar de publieke https-adressen.

scripts/setup-devenv.sh gebruikt voor alles `${SERVICES_HOST}:<poort>`. Voor een telefoon via
internet moeten de adressen die de wallet ziet de publieke hostnamen zijn; de interne aanroepen
(BRP, rdo-max, de attestatie-endpoint van demo_issuer) blijven op localhost. De TLS-pinning in de
app wijst naar de Let's Encrypt-roots in plaats van naar de zelfgemaakte devenv-CA's.

Elke vervanging moet precies raak zijn: verandert NL Wallet een template, dan faalt dit script
in plaats van stil een localhost-adres te laten staan.
"""

import base64
import os
import sys
from urllib.parse import quote

BASIS = "/opt/nl-wallet/scripts"
DEVENV = f"{BASIS}/devenv"

url = {naam: os.environ[f"NLW_URL_{naam}"] for naam in ("WP", "STATIC", "UPS", "PID", "ISSUANCE", "VERIFIER")}

ankers = ", ".join(
    '"' + base64.b64encode(open(f"/opt/nlw/tls/{naam}", "rb").read()).decode() + '"'
    for naam in ("isrg-root-x1.der", "isrg-root-x2.der")
)

VERVANGINGEN = {
    f"{DEVENV}/wallet-config.json.template": [
        ("https://${SERVICES_HOST}:${WALLET_PROVIDER_PORT}/api/v1/", url["WP"] + "/api/v1/"),
        ('"${WALLET_PROVIDER_SERVER_CA_CRT}"', ankers),
        ("http%3A%2F%2F${SERVICES_HOST}%3A${PID_ISSUER_PORT}", quote(url["PID"], safe="")),
        ("https://${SERVICES_HOST}:${UPDATE_POLICY_SERVER_PORT}/update/v1/", url["UPS"] + "/update/v1/"),
        ('"${UPDATE_POLICY_SERVER_CA_CRT}"', ankers),
        ("https://${SERVICES_HOST}:${STATIC_SERVER_PORT}/", url["STATIC"] + "/"),
    ],
    f"{DEVENV}/config-server-config.json.template": [
        ("https://${SERVICES_HOST}:${STATIC_SERVER_PORT}/config/v1/", url["STATIC"] + "/config/v1/"),
        ('"${STATIC_SERVER_CA_CRT}"', ankers),
    ],
    f"{DEVENV}/pid_issuer.toml.template": [
        ("public_url = 'http://${SERVICES_HOST}:${PID_ISSUER_PORT}/'", f"public_url = '{url['PID']}/'"),
    ],
    f"{DEVENV}/demo_issuer_issuance_server.toml.template": [
        ("public_url = 'http://${SERVICES_HOST}:${ISSUANCE_SERVER_PORT}/'", f"public_url = '{url['ISSUANCE']}/'"),
    ],
    f"{DEVENV}/demo_rp_verification_server.toml.template": [
        ("public_url = 'http://${SERVICES_HOST}:${VERIFICATION_SERVER_PORT}/'", f"public_url = '{url['VERIFIER']}/'"),
        ("http://${SERVICES_HOST}:${VERIFICATION_SERVER_PORT}/disclosure/", url["VERIFIER"] + "/disclosure/"),
    ],
    f"{DEVENV}/demo_issuer.json.template": [
        ('"issuance_server_url": "http://${SERVICES_HOST}:${ISSUANCE_SERVER_PORT}"', f'"issuance_server_url": "{url["ISSUANCE"]}"'),
    ],
    f"{DEVENV}/wallet_provider.toml.template": [
        ('base_url = "https://${SERVICES_HOST}:${STATIC_SERVER_PORT}/wia"', f'base_url = "{url["STATIC"]}/wia"'),
    ],
    f"{DEVENV}/digid-connector/clients.json": [
        ('"http://${SERVICES_HOST}:${PID_ISSUER_PORT}/digid/callback"', f'"{url["PID"]}/digid/callback"'),
    ],
    f"{BASIS}/setup-devenv.sh": [
        ('"http://${SERVICES_HOST}:${STATIC_SERVER_CRL_PORT}/wrpac.crl.der"', f'"{url["STATIC"]}/wrpac.crl.der"'),
    ],
}

fouten = []
for pad, vervangingen in VERVANGINGEN.items():
    tekst = open(pad, encoding="utf-8").read()
    for oud, nieuw in vervangingen:
        if oud not in tekst:
            fouten.append(f"{pad}: niet gevonden: {oud}")
            continue
        tekst = tekst.replace(oud, nieuw)
    open(pad, "w", encoding="utf-8").write(tekst)

if fouten:
    print("\n".join(fouten), file=sys.stderr)
    sys.exit(1)
print("Templates wijzen nu naar de publieke adressen")
