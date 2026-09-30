// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { antwoord, PERSONAS, rondeMetLijst, sseVan, startKeten, ruimKetenOp } from "./keten-harnas.js";

/**
 * Een ronde die niet alles leverde, en hoe de berichtenbox dat zegt.
 *
 * Het stelsel onderscheidt drie gevallen, en de berichtenbox hoort dat ook te doen:
 * - `FOUT` of `TIMEOUT`: de organisatie was niet bereikbaar;
 * - `NIET_OPGEHAALD`: het stelsel had het te druk en heeft haar niet bevraagd. Daar is niets mis,
 *   dus "niet bereikbaar" is hier onwaar;
 * - `OK` met `afgekapt: true`: de organisatie leverde, maar niet alles.
 * Een status die de client niet kent telt als niet geleverd, nooit als geslaagd.
 */

const BD = "00000001003214345000";
const RVO = "00000001001234567890";
const KVK = "00000001009876543210";

function voltooid(magazijnId, naam, status, extra = {}) {
	return { event: "magazijn-bevraging-voltooid", magazijnId, naam, status, ...extra };
}

/**
 * Een ronde met deze uitkomsten per organisatie, en een lijst met precies wat zij leverden. Minder
 * in de lijst dan de ronde telde is een ander verhaal ("onderweg kwijtgeraakt"), en dat zou de
 * melding die hier getoetst wordt verdringen.
 */
async function rondeMet(uitkomsten) {
	const berichten = uitkomsten.flatMap((u) => Array.from({ length: u.aantalBerichten || 0 }, (_, i) => ({ berichtId: u.magazijnId + "-" + i, magazijnId: u.magazijnId, afzenderNaam: u.naam, onderwerp: "Bericht", publicatietijdstip: "2026-09-30T10:00:00Z" })));
	const gebeurtenissen = [...uitkomsten, { event: "ophalen-gereed", totaalBerichten: berichten.length, geslaagd: 0, mislukt: 0, nietOpgehaald: 0, totaalMagazijnen: uitkomsten.length }];
	await startKeten([["/api/demo/personas", PERSONAS], ...rondeMetLijst(antwoord(200, { berichten }), () => sseVan(gebeurtenissen))]);
	return window.BerichtenboxKeten.melding;
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	ruimKetenOp();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("berichtenbox-keten.js — een onvolledige ronde", () => {
	it("meldt niets als elke organisatie alles leverde", async () => {
		expect(await rondeMet([voltooid(BD, "Belastingdienst", "OK", { aantalBerichten: 0, afgekapt: false })])).toBe(null);
	});

	it.each([["FOUT"], ["TIMEOUT"]])("noemt een organisatie met %s niet bereikbaar", async (status) => {
		const melding = await rondeMet([voltooid(BD, "Belastingdienst", status, { foutmelding: "x" })]);

		expect(melding.soort).toBe("mededeling");
		expect(melding.tekst).toContain("Belastingdienst was tijdens het ophalen niet bereikbaar");
	});

	it("noemt NIET_OPGEHAALD niet onbereikbaar, maar niet opgehaald", async () => {
		const melding = await rondeMet([voltooid(RVO, "RVO", "NIET_OPGEHAALD", { foutmelding: "x" })]);

		expect(melding.soort).toBe("mededeling");
		expect(melding.tekst).toContain("Bij RVO zijn uw berichten deze keer niet opgehaald");
		expect(melding.tekst).not.toContain("niet bereikbaar");
	});

	it("telt een status die het niet kent als niet opgehaald, niet als geslaagd en niet als storing", async () => {
		const melding = await rondeMet([voltooid(RVO, "RVO", "ONDERHOUD")]);

		expect(melding.tekst).toContain("Bij RVO zijn uw berichten deze keer niet opgehaald");
		expect(melding.tekst).not.toContain("niet bereikbaar");
	});

	it("noemt een afgekapte organisatie met de aantallen die zij meldde", async () => {
		const melding = await rondeMet([voltooid(BD, "Belastingdienst", "OK", { aantalBerichten: 200, afgekapt: true, totaalBeschikbaar: 350 })]);

		expect(melding.soort).toBe("mededeling");
		expect(melding.tekst).toContain("Van Belastingdienst zijn 200 van uw 350 berichten opgehaald.");
		expect(melding.tekst).not.toContain("niet bereikbaar");
	});

	it("noemt een afgekapte organisatie ook zonder totaal, zonder een getal te verzinnen", async () => {
		const melding = await rondeMet([voltooid(BD, "Belastingdienst", "OK", { aantalBerichten: 200, afgekapt: true })]);

		expect(melding.tekst).toContain("Van Belastingdienst zijn niet al uw berichten opgehaald.");
		expect(melding.tekst).not.toMatch(/\d+ van uw/);
	});

	it("noemt meerdere organisaties per groep bij naam", async () => {
		const melding = await rondeMet([voltooid(BD, "Belastingdienst", "OK", { aantalBerichten: 200, afgekapt: true, totaalBeschikbaar: 350 }), voltooid(KVK, "KVK", "OK", { aantalBerichten: 200, afgekapt: true }), voltooid(RVO, "RVO", "NIET_OPGEHAALD"), voltooid("00000001000000000001", "RDW", "NIET_OPGEHAALD")]);

		expect(melding.tekst).toContain("Bij deze organisaties zijn uw berichten deze keer niet opgehaald, omdat het op dat moment te druk was: RVO, RDW.");
		expect(melding.tekst).toContain("Van deze organisaties zijn niet al uw berichten opgehaald: Belastingdienst (200 van 350), KVK.");
	});

	it("zet alle drie de oorzaken naast elkaar, elk met een eigen zin", async () => {
		const melding = await rondeMet([voltooid(KVK, "KVK", "TIMEOUT"), voltooid(RVO, "RVO", "NIET_OPGEHAALD"), voltooid(BD, "Belastingdienst", "OK", { aantalBerichten: 200, afgekapt: true, totaalBeschikbaar: 350 })]);

		const tekst = melding.tekst;
		expect(tekst.indexOf("KVK was tijdens het ophalen niet bereikbaar")).toBeGreaterThanOrEqual(0);
		expect(tekst.indexOf("Bij RVO zijn uw berichten")).toBeGreaterThan(tekst.indexOf("KVK was"));
		expect(tekst.indexOf("Van Belastingdienst zijn 200 van uw 350")).toBeGreaterThan(tekst.indexOf("Bij RVO"));
	});

	it("belooft geen verversen, want dat draait geen nieuwe ronde zolang de sessie leeft", async () => {
		const melding = await rondeMet([voltooid(RVO, "RVO", "NIET_OPGEHAALD"), voltooid(BD, "Belastingdienst", "OK", { aantalBerichten: 1, afgekapt: true })]);

		expect(melding.tekst).not.toMatch(/[Vv]ervers/);
	});
});

describe("berichtenbox-keten.js — het tijdstip van een bericht", () => {
	it("gaat volledig mee, zodat sorteren op datum ook binnen een dag klopt", async () => {
		const lijst = antwoord(200, {
			berichten: [{ berichtId: "b1", magazijnId: BD, afzenderNaam: "Belastingdienst", onderwerp: "Aanslag", publicatietijdstip: "2026-09-30T14:05:00Z" }],
		});
		await startKeten([
			["/api/demo/personas", PERSONAS],
			["/api/v1/berichten?", lijst],
		]);

		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.berichten[0].datum).toBe("2026-09-30");
		expect(uitkomst.berichten[0].tijdstip).toBe("2026-09-30T14:05:00Z");
	});
});
