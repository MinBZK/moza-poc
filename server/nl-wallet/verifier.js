/**
 * verifier.js
 *
 * Praat met de verification_server van NL Wallet: een disclosure-sessie starten
 * en na afloop de gedeelde gegevens ophalen. Geen Express, geen DOM, zodat de
 * logica los te testen is (tests/nl-wallet/).
 *
 * Inloggen vraagt twee dingen: voornaam en achternaam uit de PID, en de bevoegdheid
 * voor een onderneming (demo-attestatie van "KVK Demo", zie attestaties/). Meer gebruikt
 * het prototype niet, dus meer vragen we ook niet. Beide zijn verplicht: NL Wallet kent
 * geen optionele onderdelen in een verzoek (DCQL credential_sets worden geweigerd), en
 * ook geen mix van formaten; daarom vragen we de PID als SD-JWT, net als de bevoegdheid.
 */

"use strict";

const PID_DOCTYPE = "urn:eudi:pid:nl:1";
const BEVOEGDHEID_VCT = "com.example.kvk_bevoegdheid";

function inlogQuery() {
	return {
		credentials: [
			// Allebei SD-JWT: NL Wallet weigert een verzoek dat mdoc en SD-JWT mengt.
			{
				id: "pid",
				format: "dc+sd-jwt",
				meta: { vct_values: [PID_DOCTYPE] },
				claims: [{ path: ["given_name"] }, { path: ["family_name"] }],
			},
			{
				id: "bevoegdheid",
				format: "dc+sd-jwt",
				meta: { vct_values: [BEVOEGDHEID_VCT] },
				claims: [{ path: ["kvk_nummer"] }, { path: ["handelsnaam"] }, { path: ["functie"] }, { path: ["bevoegdheid"] }],
			},
		],
	};
}

function maakConfig(env) {
	const publiek = (env.MOZA_PUBLIC_URL || "http://localhost:8095").replace(/\/$/, "");
	return {
		intern: (env.NL_WALLET_VS_INTERNAL || "http://localhost:3012").replace(/\/$/, ""),
		publiek: (env.NL_WALLET_VS_PUBLIC || "http://localhost:3011").replace(/\/$/, ""),
		usecase: env.NL_WALLET_USECASE || "moza_inloggen",
		apiKey: env.NL_WALLET_API_KEY || "",
		returnUrlTemplate: publiek + "/inloggen/nl-wallet/terug/?session_token={session_token}",
	};
}

function headers(config, extra) {
	const h = Object.assign({ Accept: "application/json" }, extra);
	if (config.apiKey) h.Authorization = "Bearer " + config.apiKey;
	return h;
}

// Een sessietoken komt terug in een URL-pad; alleen letters en cijfers, zodat
// een aangepast token geen ander pad op de verification_server kan raken.
function geldigToken(token) {
	return typeof token === "string" && /^[A-Za-z0-9]{16,128}$/.test(token);
}

async function startSessie(config, doeFetch) {
	const antwoord = await doeFetch(config.intern + "/disclosure/sessions", {
		method: "POST",
		headers: headers(config, { "Content-Type": "application/json" }),
		body: JSON.stringify({
			usecase: config.usecase,
			dcql_query: inlogQuery(),
			return_url_template: config.returnUrlTemplate,
		}),
	});
	if (!antwoord.ok) throw new Error("Sessie starten mislukt: HTTP " + antwoord.status);

	const { session_token } = await antwoord.json();
	if (!geldigToken(session_token)) throw new Error("Sessie starten mislukt: onverwacht sessietoken");

	return {
		status_url: config.publiek + "/disclosure/sessions/" + session_token,
		session_token,
	};
}

// Status van een sessie zoals de wallet_web-knop die ook opvraagt: CREATED, WAITING_FOR_RESPONSE,
// DONE, FAILED, CANCELLED of EXPIRED.
async function haalStatusOp(config, token, doeFetch) {
	if (!geldigToken(token)) throw new Error("Ongeldig sessietoken");
	const antwoord = await doeFetch(config.publiek + "/disclosure/sessions/" + token + "?session_type=cross_device", { headers: headers(config) });
	if (!antwoord.ok) throw new Error("Status ophalen mislukt: HTTP " + antwoord.status);
	const { status } = await antwoord.json();
	return status;
}

async function haalGegevensOp(config, token, nonce, doeFetch) {
	if (!geldigToken(token)) throw new Error("Ongeldig sessietoken");

	const url = new URL(config.intern + "/disclosure/sessions/" + token + "/disclosed_attributes");
	if (nonce) url.searchParams.set("nonce", nonce);

	const antwoord = await doeFetch(url.toString(), { headers: headers(config) });
	if (!antwoord.ok) throw new Error("Gegevens ophalen mislukt: HTTP " + antwoord.status);

	return antwoord.json();
}

// De verification_server geeft [{ id, attestations: [{ attestation_type, attributes }] }], met elk
// attribuut als { type: "text", value: "…" }. Bij een mdoc staan de attributen onder de namespace;
// bij SD-JWT direct. Zoek daarom op sleutelnaam, ongeacht hoe diep die zit.
function zoekWaarde(object, sleutel) {
	if (!object || typeof object !== "object") return undefined;
	const kandidaat = object[sleutel];
	if (typeof kandidaat === "string") return kandidaat;
	if (kandidaat && typeof kandidaat === "object" && typeof kandidaat.value === "string") return kandidaat.value;
	for (const waarde of Object.values(object)) {
		const gevonden = zoekWaarde(waarde, sleutel);
		if (gevonden !== undefined) return gevonden;
	}
	return undefined;
}

function attestaties(gedeeld, type) {
	const lijsten = Array.isArray(gedeeld) ? gedeeld : [];
	return lijsten.flatMap((lijst) => (lijst && lijst.attestations) || []).filter((attestatie) => attestatie.attestation_type === type);
}

// { voornaam, achternaam, bevoegdheid: { kvkNummer, handelsnaam, functie, bevoegdheid } | null },
// of null zonder naam: zonder naam is er niemand ingelogd.
function inlogUitGegevens(gedeeld) {
	const pid = attestaties(gedeeld, PID_DOCTYPE).find((a) => zoekWaarde(a.attributes, "given_name") && zoekWaarde(a.attributes, "family_name"));
	if (!pid) return null;

	const bron = attestaties(gedeeld, BEVOEGDHEID_VCT).find((a) => zoekWaarde(a.attributes, "kvk_nummer"));
	const bevoegdheid = bron
		? {
				kvkNummer: zoekWaarde(bron.attributes, "kvk_nummer"),
				handelsnaam: zoekWaarde(bron.attributes, "handelsnaam") || "",
				functie: zoekWaarde(bron.attributes, "functie") || "",
				bevoegdheid: zoekWaarde(bron.attributes, "bevoegdheid") || "",
			}
		: null;

	return {
		voornaam: zoekWaarde(pid.attributes, "given_name"),
		achternaam: zoekWaarde(pid.attributes, "family_name"),
		bevoegdheid,
	};
}

module.exports = { PID_DOCTYPE, BEVOEGDHEID_VCT, inlogQuery, maakConfig, geldigToken, startSessie, haalStatusOp, haalGegevensOp, inlogUitGegevens };
