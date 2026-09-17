#!/usr/bin/env bash
#
# inrichten.sh
#
# Richt de NL Wallet-testomgeving in als verifier voor MOZa: een WRPAC-certificaat voor "MijnOverheid Zakelijk",
# een usecase `moza_inloggen` in de verification_server en de MOZa-origin in
# allow_origins. Daarnaast komen de fictieve testpersonen uit testpersonen/ in de
# mock-BRP en op de mock-DigiD-pagina, zodat MOZa eigen testgebruikers heeft die
# niet ook in de pre-prod-wallet staan.
#
# Afgeleid van server/nl-wallet/lokaal-inrichten.sh (branch feat/nl-wallet-inloggen), maar voor de
# container: de NL Wallet-checkout staat in /opt/nl-wallet, `cargo run` gaat via de shim naar de
# binaries in het image, de CRL staat op het publieke adres van de static_server en de services
# starten niet opnieuw (dat doet supervisord pas na de inrichting). De links voor "bevoegdheid
# toevoegen" komen in MOZA_JSON, dat de kerncontainer intern serveert op /moza.json.

set -euo pipefail

NL_WALLET_DIR="${NL_WALLET_DIR:-/opt/nl-wallet}"
MOZA_ORIGIN="${MOZA_ORIGIN:?}"
USECASE="${NL_WALLET_USECASE:-moza_inloggen}"

# Lokaal en fictief. Voor de pre-prod-omgeving komen naam, organisatie-ID en CA
# uit de community onboarding van NL Wallet.
RP_NAAM="MijnOverheid Zakelijk"
RP_ORGANISATIE="Ministerie van Binnenlandse Zaken en Koninkrijksrelaties"
RP_ORGANISATIE_ID="NTRNL-00000000"
RP_SAN="https://proef.moza.rijksapp.dev"

TARGET_DIR="${NL_WALLET_DIR}/scripts/devenv/target"
VS_TOML="${NL_WALLET_DIR}/wallet_core/wallet_server/verification_server/verification_server.toml"
CERT_PREFIX="${TARGET_DIR}/demo_relying_party/${USECASE}"
CRL_URL="${NLW_URL_STATIC:?}/wrpac.crl.der"
MOZA_JSON="${MOZA_JSON:?}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
GBA_DIR="${NL_WALLET_DIR}/wallet_core/gba_hc_converter/resources"
PID_TOML="${NL_WALLET_DIR}/wallet_core/wallet_server/pid_issuer/pid_issuer.toml"

for bestand in "${TARGET_DIR}/ca.wrpac.key.pem" "${TARGET_DIR}/ca.wrpac.crt.pem" "${VS_TOML}" "${PID_TOML}"; do
	if [[ ! -f "${bestand}" ]]; then
		echo "Niet gevonden: ${bestand}" >&2
		echo "Draai eerst scripts/setup-devenv.sh in ${NL_WALLET_DIR}." >&2
		exit 1
	fi
done

# Certificaten alleen maken als ze er nog niet zijn (of met NIEUWE_CERTIFICATEN=1). Een nieuw
# certificaat geeft een nieuwe client_id, en dan kloppen links in een al geopende pagina niet meer.
if [[ -n "${NIEUWE_CERTIFICATEN:-}" || ! -f "${CERT_PREFIX}.crt.der" ]]; then
	echo "WRPAC-certificaat maken voor ${RP_NAAM}"
	cargo run --quiet --manifest-path "${NL_WALLET_DIR}/wallet_core/Cargo.toml" \
		--bin wallet_ca cert --type wrpac \
		--ca-key-file "${TARGET_DIR}/ca.wrpac.key.pem" \
		--ca-crt-file "${TARGET_DIR}/ca.wrpac.crt.pem" \
		--common-name "${RP_NAAM}" \
		--organization-name "${RP_ORGANISATIE}" \
		--organization-id "${RP_ORGANISATIE_ID}" \
		--crl-distribution-point "${CRL_URL}" \
		--san-uri "${RP_SAN}" \
		--file-prefix "${CERT_PREFIX}" \
		--force

	openssl x509 -in "${CERT_PREFIX}.crt.pem" -outform DER -out "${CERT_PREFIX}.crt.der"
	openssl pkcs8 -topk8 -inform PEM -outform DER -in "${CERT_PREFIX}.key.pem" -out "${CERT_PREFIX}.key.der" -nocrypt
else
	echo "WRPAC-certificaat voor ${RP_NAAM} bestaat al"
fi

echo "Usecase ${USECASE} en origin ${MOZA_ORIGIN} in de verification_server zetten"
python3 - "${VS_TOML}" "${USECASE}" "${MOZA_ORIGIN}" "${CERT_PREFIX}" <<'PY'
import base64, re, sys

pad, usecase, origin, prefix = sys.argv[1:5]
tekst = open(pad, encoding="utf-8").read()

# Een eerdere run weghalen: de sectie loopt tot de volgende [kop] of het einde.
tekst = re.sub(r"\n\[usecases\." + re.escape(usecase) + r"\]\n(?:(?!\n\[).)*", "", tekst, flags=re.S)

def b64(bestand):
    return base64.b64encode(open(bestand, "rb").read()).decode()

tekst = tekst.rstrip("\n") + (
    f"\n\n[usecases.{usecase}]\n"
    f'certificate = "{b64(prefix + ".crt.der")}"\n'
    f'private_key = "{b64(prefix + ".key.der")}"\n'
    'private_key_type = "software"\n'
)

def voeg_origin_toe(match):
    origins = re.findall(r'"([^"]*)"', match.group(1))
    if origin not in origins:
        origins.append(origin)
    return "allow_origins = [" + ", ".join(f'"{o}"' for o in origins) + "]"

tekst, aantal = re.subn(r"^allow_origins = \[(.*?)\]", voeg_origin_toe, tekst, count=1, flags=re.M)
if aantal == 0:
    tekst = f'allow_origins = ["{origin}"]\n' + tekst

open(pad, "w", encoding="utf-8").write(tekst)
PY

echo "Testpersonen in de mock-BRP en op de mock-DigiD-pagina zetten"
mkdir -p "${GBA_DIR}/gba-v-responses" "${GBA_DIR}/encrypted-gba-v-responses"
for xml in "${SCRIPT_DIR}"/testpersonen/*.xml; do
	bsn="$(basename "${xml}" .xml)"
	cp "${xml}" "${GBA_DIR}/gba-v-responses/${bsn}.xml"
	cargo run --quiet --manifest-path "${NL_WALLET_DIR}/wallet_core/Cargo.toml" \
		--bin gba_encrypt -- \
		--basename "${bsn}" \
		--output "${GBA_DIR}/encrypted-gba-v-responses" \
		"${GBA_DIR}/gba-v-responses/${bsn}.xml"
done

python3 - "${PID_TOML}" "${SCRIPT_DIR}/testpersonen" <<'PY2'
import glob, os, re, sys

pad, map_ = sys.argv[1:3]
tekst = open(pad, encoding="utf-8").read()

def waarde(xml, nummer):
    gevonden = re.search(r"<ns2:nummer>" + nummer + r"</ns2:nummer>\s*<ns2:waarde>([^<]*)</ns2:waarde>", xml)
    return gevonden.group(1) if gevonden else ""

kop = "[digid.mock_subjects]\n"
if kop not in tekst:
    sys.exit("Geen [digid.mock_subjects] in " + pad)

for bestand in sorted(glob.glob(os.path.join(map_, "*.xml"))):
    xml = open(bestand, encoding="utf-8").read()
    bsn = waarde(xml, "120")
    # Voornamen (210), voorvoegsel (230) en geslachtsnaam (240), zoals de wallet ze toont.
    naam = " ".join(deel for deel in (waarde(xml, "210"), waarde(xml, "230"), waarde(xml, "240")) if deel)
    regel = f'"{bsn}" = "{naam}"'
    # Een eerdere naam voor dit BSN vervangen, anders bovenaan toevoegen.
    tekst, aantal = re.subn(r'^"' + bsn + r'" = .*$', regel, tekst, flags=re.M)
    if aantal == 0:
        tekst = tekst.replace(kop, kop + regel + "\n", 1)

open(pad, "w", encoding="utf-8").write(tekst)
PY2

echo "KVK-bevoegdheid als attestatie inrichten (uitgever KVK Demo)"
ATTESTATIES="${SCRIPT_DIR}/attestaties"
IS_DIR="${NL_WALLET_DIR}/wallet_core/wallet_server/issuance_server"
DEMO_ISSUER_JSON="${NL_WALLET_DIR}/wallet_core/demo/demo_issuer/demo_issuer.json"
KVK_PREFIX="${TARGET_DIR}/demo_issuer/kvk_bevoegdheid"

# Uitgevercertificaat (met organisatiegegevens), statuslijst-certificaat en WRPAC, zoals de
# demo-uitgevers in setup-devenv.sh. Fictief: "KVK Demo" met een verzonnen organisatie-ID.
for type in issuer tsl wrpac; do
	if [[ -z "${NIEUWE_CERTIFICATEN:-}" && -f "${KVK_PREFIX}.${type}.crt.der" ]]; then
		echo "Certificaat ${type} voor KVK Demo bestaat al"
		continue
	fi
	ca="${type}"
	extra=()
	[[ "${type}" == "tsl" ]] && ca="issuer"
	[[ "${type}" == "issuer" ]] && extra=(--issuer-auth-file "${ATTESTATIES}/kvk_issuer_auth.json")
	[[ "${type}" == "wrpac" ]] && extra=(--crl-distribution-point "${CRL_URL}")
	cargo run --quiet --manifest-path "${NL_WALLET_DIR}/wallet_core/Cargo.toml" \
		--bin wallet_ca cert --type "${type}" \
		--ca-key-file "${TARGET_DIR}/ca.${ca}.key.pem" \
		--ca-crt-file "${TARGET_DIR}/ca.${ca}.crt.pem" \
		--common-name "KVK Demo" \
		--organization-name "Kamer van Koophandel (demo)" \
		--organization-id "NTRNL-99876549" \
		--san-uri "https://kvk_bevoegdheid.example.com" \
		"${extra[@]}" \
		--file-prefix "${KVK_PREFIX}.${type}" \
		--force
	openssl x509 -in "${KVK_PREFIX}.${type}.crt.pem" -outform DER -out "${KVK_PREFIX}.${type}.crt.der"
	openssl pkcs8 -topk8 -inform PEM -outform DER -in "${KVK_PREFIX}.${type}.key.pem" -out "${KVK_PREFIX}.${type}.key.der" -nocrypt
done

cp "${ATTESTATIES}/com.example.kvk_bevoegdheid.json" "${IS_DIR}/"

python3 - "${IS_DIR}/issuance_server.toml" "${DEMO_ISSUER_JSON}" "${ATTESTATIES}/bevoegdheden.json" "${KVK_PREFIX}" "${MOZA_JSON}" <<'PY3'
import base64, hashlib, json, os, re, sys
from urllib.parse import urlencode

toml_pad, demo_pad, data_pad, prefix, lokaal_pad = sys.argv[1:6]
VCT = "com.example.kvk_bevoegdheid"
CONFIG_ID = VCT + "_sd_jwt"
PID_BSN = {"credential_type": "urn:eudi:pid:nl:1", "path": ["urn:eudi:pid:nl:1", "bsn"]}
ondernemingen = json.load(open(data_pad, encoding="utf-8"))["ondernemingen"]

def b64(bestand):
    return base64.b64encode(open(bestand, "rb").read()).decode()

def usecase(onderneming):
    return "kvk_bevoegdheid_" + onderneming["id"]

# issuance_server.toml: alle eerdere kvk_bevoegdheid-blokken weg (ook de oude zonder onderneming),
# type-metadata aanmelden, dan per onderneming een eigen uitgifte en één gedeelde credential-configuratie.
tekst = open(toml_pad, encoding="utf-8").read()
for kop in (r"\[\[?disclosure_settings\.kvk_bevoegdheid[a-z_]*[\].]", rf'\[credential_configurations\."{re.escape(CONFIG_ID)}"[\].]'):
    tekst = re.sub(r"\n" + kop + r"(?:(?!\n\[).)*", "", tekst, flags=re.S)

metadata = VCT + ".json"
if f'"{metadata}"' not in tekst:
    tekst, n = re.subn(r"type_metadata = \[\n", f'type_metadata = [\n    "{metadata}",\n', tekst, count=1)
    assert n == 1, "type_metadata niet gevonden"

# De TLS-pinning naar de attestation-server van demo_issuer: dezelfde CA als bij housing.
anker = re.search(r'\[disclosure_settings\.housing\.attestation_url_config\]\nbase_url = "https?://([^/]+)/housing/"\ntrust_anchors = (\[[^\]]*\])', tekst)
assert anker, "housing attestation_url_config niet gevonden"
host, trust_anchors = anker.group(1), anker.group(2)
publish_dir = re.search(r'publish_dir = "([^"]*)"', tekst).group(1)

tekst = tekst.rstrip("\n")
for onderneming in ondernemingen:
    u = usecase(onderneming)
    tekst += f"""

[disclosure_settings.{u}]
private_key_type = "software"
private_key = "{b64(prefix + '.wrpac.key.der')}"
certificate = "{b64(prefix + '.wrpac.crt.der')}"

[[disclosure_settings.{u}.dcql_query.credentials]]
id = "pid_bsn"
format = "mso_mdoc"
meta = {{ doctype_value = "urn:eudi:pid:nl:1" }}
claims = [
    {{ path = ["urn:eudi:pid:nl:1", "bsn"], intent_to_retain = true }}
]

[disclosure_settings.{u}.attestation_url_config]
base_url = "https://{host}/{u}/"
trust_anchors = {trust_anchors}"""

tekst += f"""

[credential_configurations."{CONFIG_ID}"]
format = "dc+sd-jwt"
attestation_type = "{VCT}"
valid_days = 365
private_key_type = "software"
private_key = "{b64(prefix + '.issuer.key.der')}"
certificate = "{b64(prefix + '.issuer.crt.der')}"

[credential_configurations."{CONFIG_ID}".status_list]
group_name = "{CONFIG_ID}"
context_path = "/tsl"
publish_dir = "{publish_dir}"
private_key_type = "software"
private_key = "{b64(prefix + '.tsl.key.der')}"
certificate = "{b64(prefix + '.tsl.crt.der')}"
"""
open(toml_pad, "w", encoding="utf-8").write(tekst)

# demo_issuer.json: per onderneming een usecase met de bevoegdheid voor elke houder (BSN).
client_id = "x509_hash:" + base64.urlsafe_b64encode(hashlib.sha256(open(prefix + ".wrpac.crt.der", "rb").read()).digest()).decode().rstrip("=")
demo = json.load(open(demo_pad, encoding="utf-8"))
for sleutel in [k for k in demo["usecases"] if k.startswith("kvk_bevoegdheid")]:
    del demo["usecases"][sleutel]
VELDEN = ("kvk_nummer", "handelsnaam", "rechtsvorm", "functie", "bevoegdheid")
for onderneming in ondernemingen:
    document = {"format": "dc+sd-jwt", "attestation_type": VCT, "attributes": {k: {"type": "text", "value": onderneming[k]} for k in VELDEN}}
    demo["usecases"][usecase(onderneming)] = {
        "client_id": client_id,
        "disclosed": PID_BSN,
        "data": {bsn: [document] for bsn in onderneming["houders"]},
    }
json.dump(demo, open(demo_pad, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

# Links voor "bevoegdheid toevoegen" per onderneming op de MOZa-pagina.
def link(u, sessie):
    request_uri = f"{demo['issuance_server_url'].rstrip('/')}/disclosure/{u}/request_uri?session_type={sessie}"
    return "walletdebuginteraction://wallet.edi.rijksoverheid.nl/disclosure_based_issuance?" + urlencode(
        {"client_id": client_id, "request_uri": request_uri, "request_uri_method": "post"})

config = {}
try:
    config = json.load(open(lokaal_pad, encoding="utf-8"))
except (OSError, ValueError):
    pass
config.pop("bevoegdheid", None)
config["bevoegdheden"] = [
    {"id": o["id"], "handelsnaam": o["handelsnaam"], "kvkNummer": o["kvk_nummer"], "same_device_ul": link(usecase(o), "same_device"), "cross_device_ul": link(usecase(o), "cross_device")}
    for o in ondernemingen
]
json.dump(config, open(lokaal_pad, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
PY3

echo "MOZa-inrichting klaar"
