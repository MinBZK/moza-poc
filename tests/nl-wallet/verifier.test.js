import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

/**
 * Inloggen met NL Wallet: de server-kant die met de verification_server praat.
 *
 * MOZa vraagt voornaam, achternaam en de bevoegdheid voor een onderneming, en geeft alleen die
 * terug aan de browser.
 * Een sessietoken komt uit de browser en belandt in een URL-pad richting de
 * verification_server; alles wat geen gewoon token is, gaat daar niet heen.
 */
const require = createRequire(import.meta.url);
const { maakConfig, geldigToken, startSessie, haalStatusOp, haalGegevensOp, inlogUitGegevens, inlogQuery } = require("../../server/nl-wallet/verifier.js");

const TOKEN = "UbGVHMKhupFHDHsNplXp4zlTtXPa3UWD";

function antwoord(status, body) {
	return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

describe("configuratie", () => {
	it("gebruikt de lokale ontwikkelomgeving als standaard", () => {
		const config = maakConfig({});
		expect(config.intern).toBe("http://localhost:3012");
		expect(config.publiek).toBe("http://localhost:3011");
		expect(config.usecase).toBe("moza_inloggen");
		expect(config.returnUrlTemplate).toBe("http://localhost:8095/inloggen/nl-wallet/terug/?session_token={session_token}");
	});

	it("laat een slash aan het eind van een adres weg", () => {
		const config = maakConfig({ NL_WALLET_VS_INTERNAL: "https://vs.intern/", MOZA_PUBLIC_URL: "https://proef.moza.rijksapp.dev/" });
		expect(config.intern).toBe("https://vs.intern");
		expect(config.returnUrlTemplate.startsWith("https://proef.moza.rijksapp.dev/inloggen/")).toBe(true);
	});
});

describe("sessietoken", () => {
	it("accepteert een gewoon token", () => {
		expect(geldigToken(TOKEN)).toBe(true);
	});

	it.each(["../../internal", "abc", TOKEN + "/x", "", null, undefined, 42])("weigert %s", (token) => {
		expect(geldigToken(token)).toBe(false);
	});
});

describe("sessie starten", () => {
	it("vraagt alleen voornaam en achternaam uit de PID", () => {
		const pid = inlogQuery().credentials.find((c) => c.id === "pid");
		expect(pid.claims.map((c) => c.path.at(-1))).toEqual(["given_name", "family_name"]);
	});

	it("vraagt de bevoegdheid als SD-JWT van het demo-type", () => {
		const bevoegdheid = inlogQuery().credentials.find((c) => c.id === "bevoegdheid");
		expect(bevoegdheid.meta.vct_values).toEqual(["com.example.kvk_bevoegdheid"]);
		expect(bevoegdheid.claims.map((c) => c.path[0])).toEqual(["kvk_nummer", "handelsnaam", "functie", "bevoegdheid"]);
	});

	it("vraagt alles in één formaat, want NL Wallet weigert een mix van mdoc en SD-JWT", () => {
		expect(new Set(inlogQuery().credentials.map((c) => c.format))).toEqual(new Set(["dc+sd-jwt"]));
	});

	it("gebruikt geen credential_sets, want NL Wallet weigert die", () => {
		expect(inlogQuery().credential_sets).toBeUndefined();
	});

	it("start bij de interne API en geeft het publieke statusadres terug", async () => {
		const config = maakConfig({ NL_WALLET_API_KEY: "geheim" });
		const doeFetch = vi.fn().mockResolvedValue(antwoord(200, { session_token: TOKEN }));

		const sessie = await startSessie(config, doeFetch);

		expect(sessie).toEqual({ status_url: "http://localhost:3011/disclosure/sessions/" + TOKEN, session_token: TOKEN });
		const [url, opties] = doeFetch.mock.calls[0];
		expect(url).toBe("http://localhost:3012/disclosure/sessions");
		expect(opties.headers.Authorization).toBe("Bearer geheim");
		expect(JSON.parse(opties.body).usecase).toBe("moza_inloggen");
	});

	it("werpt als de verification_server weigert", async () => {
		const doeFetch = vi.fn().mockResolvedValue(antwoord(500, {}));
		await expect(startSessie(maakConfig({}), doeFetch)).rejects.toThrow("HTTP 500");
	});

	it("werpt bij een onverwacht token in het antwoord", async () => {
		const doeFetch = vi.fn().mockResolvedValue(antwoord(200, { session_token: "../x" }));
		await expect(startSessie(maakConfig({}), doeFetch)).rejects.toThrow("onverwacht sessietoken");
	});
});

describe("status volgen", () => {
	it("vraagt de status op bij de publieke API, zoals de knop van NL Wallet", async () => {
		const doeFetch = vi.fn().mockResolvedValue(antwoord(200, { status: "DONE" }));
		expect(await haalStatusOp(maakConfig({}), TOKEN, doeFetch)).toBe("DONE");
		expect(doeFetch.mock.calls[0][0]).toBe("http://localhost:3011/disclosure/sessions/" + TOKEN + "?session_type=cross_device");
	});

	it("vraagt een ongeldig token niet op", async () => {
		const doeFetch = vi.fn();
		await expect(haalStatusOp(maakConfig({}), "../x", doeFetch)).rejects.toThrow("Ongeldig sessietoken");
		expect(doeFetch).not.toHaveBeenCalled();
	});
});

describe("gegevens ophalen", () => {
	it("stuurt de nonce mee bij een sessie op dezelfde telefoon", async () => {
		const doeFetch = vi.fn().mockResolvedValue(antwoord(200, []));
		await haalGegevensOp(maakConfig({}), TOKEN, "n0nce", doeFetch);
		expect(doeFetch.mock.calls[0][0]).toBe("http://localhost:3012/disclosure/sessions/" + TOKEN + "/disclosed_attributes?nonce=n0nce");
	});

	it("vraagt een ongeldig token niet op", async () => {
		const doeFetch = vi.fn();
		await expect(haalGegevensOp(maakConfig({}), "../internal", null, doeFetch)).rejects.toThrow("Ongeldig sessietoken");
		expect(doeFetch).not.toHaveBeenCalled();
	});
});

const PID_MDOC = { attestation_type: "urn:eudi:pid:nl:1", attributes: { "urn:eudi:pid:nl:1": { given_name: "Claudia", family_name: "van Dam" } } };
const BEVOEGDHEID = {
	attestation_type: "com.example.kvk_bevoegdheid",
	attributes: { kvk_nummer: "85234567", handelsnaam: "Koffiezaak Noon", functie: "Eigenaar", bevoegdheid: "Volledig bevoegd", rechtsvorm: "Eenmanszaak" },
};

// Het echte antwoord van de lokale verification_server na inloggen met Claudia van Dam (17 september
// 2026), zonder issuer_uri, ca, validity en revocation: attributen zijn { type, value }.
const ECHT_ANTWOORD = [
	{
		id: "pid",
		attestations: [
			{
				attestation_type: "urn:eudi:pid:nl:1",
				format: "dc+sd-jwt",
				attributes: { given_name: { type: "text", value: "Claudia" }, family_name: { type: "text", value: "van Dam" } },
				attestation_qualification: "QEAA",
			},
		],
	},
	{
		id: "bevoegdheid",
		attestations: [
			{
				attestation_type: "com.example.kvk_bevoegdheid",
				format: "dc+sd-jwt",
				attributes: {
					functie: { type: "text", value: "Eigenaar" },
					kvk_nummer: { type: "text", value: "85234567" },
					bevoegdheid: { type: "text", value: "Volledig bevoegd" },
					handelsnaam: { type: "text", value: "Koffiezaak Noon" },
				},
				attestation_qualification: "EAA",
			},
		],
	},
];

describe("inlog uit de gedeelde gegevens", () => {
	it("leest naam en bevoegdheid uit het echte antwoord met getypeerde attributen", () => {
		expect(inlogUitGegevens(ECHT_ANTWOORD)).toEqual({
			voornaam: "Claudia",
			achternaam: "van Dam",
			bevoegdheid: { kvkNummer: "85234567", handelsnaam: "Koffiezaak Noon", functie: "Eigenaar", bevoegdheid: "Volledig bevoegd" },
		});
	});

	it("leest naam en bevoegdheid uit twee attestaties", () => {
		const gedeeld = [
			{ id: "pid", attestations: [PID_MDOC] },
			{ id: "bevoegdheid", attestations: [BEVOEGDHEID] },
		];
		expect(inlogUitGegevens(gedeeld)).toEqual({
			voornaam: "Claudia",
			achternaam: "van Dam",
			bevoegdheid: { kvkNummer: "85234567", handelsnaam: "Koffiezaak Noon", functie: "Eigenaar", bevoegdheid: "Volledig bevoegd" },
		});
	});

	it("geeft geen rechtsvorm of andere velden door die MOZa niet gebruikt", () => {
		const inlog = inlogUitGegevens([
			{ id: "pid", attestations: [PID_MDOC] },
			{ id: "bevoegdheid", attestations: [BEVOEGDHEID] },
		]);
		expect(Object.keys(inlog.bevoegdheid)).toEqual(["kvkNummer", "handelsnaam", "functie", "bevoegdheid"]);
	});

	it("leest de naam ook uit een SD-JWT-PID, zonder namespace", () => {
		const gedeeld = [{ id: "pid", attestations: [{ attestation_type: "urn:eudi:pid:nl:1", attributes: { given_name: "Linda", family_name: "Strijps" } }] }];
		expect(inlogUitGegevens(gedeeld)).toEqual({ voornaam: "Linda", achternaam: "Strijps", bevoegdheid: null });
	});

	it("negeert een attestatie van een ander type met dezelfde velden", () => {
		const nep = { attestation_type: "com.example.degree", attributes: { given_name: "Neppe", family_name: "Naam", kvk_nummer: "1" } };
		expect(inlogUitGegevens([{ id: "x", attestations: [nep] }])).toBeNull();
	});

	it("geeft null bij een onverwachte vorm", () => {
		expect(inlogUitGegevens(null)).toBeNull();
		expect(inlogUitGegevens({})).toBeNull();
	});
});
