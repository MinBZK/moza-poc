// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { antwoord, PERSONAS, startKeten, ruimKetenOp } from "./keten-harnas.js";

/**
 * Twee organisaties met hetzelfde berichtnummer.
 *
 * Elke organisatie deelt haar berichtnummers zelf uit. Het stelsel kan niet afdwingen dat twee
 * losstaande organisaties nooit hetzelfde nummer kiezen, dus een bericht is pas uniek als je erbij
 * zegt van welke organisatie het komt (MinBZK/MijnOverheidZakelijk#1004). De berichtenbox rekent met
 * één id per bericht; dat id moet dus het paar zijn, anders verdringt het ene bericht het andere en
 * opent de ondernemer de brief van de ene organisatie onder de naam van de andere.
 */

const OIN_BELASTINGDIENST = "00000009000000000006";
const OIN_RVO = "00000001001234567890";
const GEDEELD = "3f0c2b1e-9d4a-4c55-8a51-2f1d7e6b9c10";

function berichtVan(magazijnId, afzenderNaam) {
	return { berichtId: GEDEELD, magazijnId: magazijnId, afzenderNaam: afzenderNaam, onderwerp: "Brief van " + afzenderNaam, publicatietijdstip: "2026-02-19T10:00:00Z" };
}

const LIJST_MET_BEIDE = antwoord(200, { berichten: [berichtVan(OIN_BELASTINGDIENST, "Belastingdienst"), berichtVan(OIN_RVO, "RVO")] });

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
	ruimKetenOp();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

async function berichtenVan(stelsel) {
	const keten = await startKeten(stelsel);
	const { berichten } = await window.BerichtenboxKeten.berichten();
	const vanAfzender = (naam) => berichten.find((b) => b.afzender === naam);
	return Object.assign(keten, { berichten, vanAfzender });
}

describe("twee organisaties met hetzelfde berichtnummer", () => {
	it("leveren twee berichten met elk een eigen id", async () => {
		const { berichten, vanAfzender } = await berichtenVan([
			["/api/demo/personas", PERSONAS],
			["/api/v1/berichten?", LIJST_MET_BEIDE],
		]);

		expect(berichten).toHaveLength(2);
		expect(vanAfzender("Belastingdienst").id).not.toBe(vanAfzender("RVO").id);
		expect(vanAfzender("RVO").onderwerp).toBe("Brief van RVO");
	});

	it("vragen de inhoud op bij de organisatie van het geopende bericht", async () => {
		const { aanroepen, vanAfzender } = await berichtenVan([
			["/api/demo/personas", PERSONAS],
			["/api/v1/berichten?", LIJST_MET_BEIDE],
			["/api/v1/berichten/", antwoord(200, { inhoud: "De brief van RVO.", bijlagen: [] })],
		]);

		await window.BerichtenboxKeten.inhoudVan(vanAfzender("RVO").id);

		expect(aanroepen[aanroepen.length - 1].pad).toBe("/api/v1/berichten/" + GEDEELD + "?magazijnId=" + OIN_RVO);
	});

	it("verplaatsen raakt alleen het bericht van die organisatie", async () => {
		const { aanroepen, vanAfzender } = await berichtenVan([
			["/api/demo/personas", PERSONAS],
			["/api/v1/berichten?", LIJST_MET_BEIDE],
			["?magazijnId=", antwoord(200, {})],
		]);
		const gemeld = [];
		window.BerichtenboxKeten.opWijziging((toestand) => gemeld.push(toestand.uitkomst));
		const rvo = vanAfzender("RVO").id;

		expect(await window.BerichtenboxKeten.verplaats(rvo, "archief")).toEqual({});

		const patches = aanroepen.filter((a) => a.methode === "PATCH");
		expect(patches.map((a) => a.pad)).toEqual(["/api/v1/berichten/" + GEDEELD + "?magazijnId=" + OIN_RVO]);
		const daarna = gemeld[gemeld.length - 1].berichten;
		expect(daarna.find((b) => b.afzender === "RVO").plek).toBe("archief");
		expect(daarna.find((b) => b.afzender === "Belastingdienst").plek).toBe("inbox");
	});

	it("splitst het id op de eerste dubbele punt, want alleen de OIN is daar gegarandeerd vrij van", async () => {
		const { aanroepen } = await berichtenVan([
			["/api/demo/personas", PERSONAS],
			["/api/v1/berichten?", LIJST_MET_BEIDE],
			["/api/v1/berichten/", antwoord(200, { inhoud: "x", bijlagen: [] })],
		]);

		await window.BerichtenboxKeten.inhoudVan(OIN_RVO + ":a:b");

		expect(aanroepen[aanroepen.length - 1].pad).toBe("/api/v1/berichten/" + encodeURIComponent("a:b") + "?magazijnId=" + OIN_RVO);
	});
});
