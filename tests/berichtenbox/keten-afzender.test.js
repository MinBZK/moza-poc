// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { antwoord, PERSONAS, rondeMetLijst, sseVan, startKeten, ruimKetenOp } from "./keten-harnas.js";

/**
 * Wie het bericht stuurde, en waar die naam vandaan komt.
 *
 * De berichtenlijst van de uitvraag draagt per bericht de weergavenaam van de afzendende
 * organisatie (`afzenderNaam`, verplicht en nooit leeg). Daarvóór stond daar hetzelfde
 * twintigcijferige nummer als in `magazijnId` en kwam de naam uitsluitend uit de gebeurtenissen van
 * de ophaalronde — die daarom per zitting bewaard werden. Dat de lijst zelfdragend is, is hier het
 * gedrag dat vastgehouden moet worden: het scheelt niet alleen boekhouding, het bepaalt ook wat een
 * pagina kan tonen die de sessie van een andere pagina gebruikt en die ronde dus nooit zag.
 */

const OIN_BELASTINGDIENST = "00000009000000000006";
const OIN_RVO = "00000001001234567890";

function berichtVan(id, magazijnId, afzenderNaam) {
	const bericht = { berichtId: id, magazijnId: magazijnId, onderwerp: "Een besluit", publicatietijdstip: "2026-02-19T10:00:00Z" };
	if (afzenderNaam) bericht.afzenderNaam = afzenderNaam;
	return bericht;
}

/** De lijst met deze berichten, in één pagina. */
function lijstMet(berichten) {
	return antwoord(200, { berichten: berichten });
}

/** De ronde langs deze organisaties; `aantal` is wat elk van hen had liggen. */
function rondeLangs(organisaties) {
	const gebeurtenissen = organisaties.map(([magazijnId, naam, aantal]) => ({
		event: "magazijn-bevraging-voltooid",
		magazijnId: magazijnId,
		naam: naam,
		status: "OK",
		aantalBerichten: aantal,
	}));
	const totaal = organisaties.reduce((som, [, , aantal]) => som + aantal, 0);
	gebeurtenissen.push({ event: "ophalen-gereed", totaalBerichten: totaal, geslaagd: organisaties.length, mislukt: 0, totaalMagazijnen: organisaties.length });
	return () => sseVan(gebeurtenissen);
}

/** Het stelsel met deze lijst en deze ronde; zonder ronde bestaat de sessie al. */
function stelsel(lijst, ronde) {
	if (!ronde) return [["/api/demo/personas", PERSONAS], ["/api/v1/berichten?", lijst]];
	return [["/api/demo/personas", PERSONAS], ...rondeMetLijst(lijst, ronde)];
}

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

describe("de naam van de afzender", () => {
	it("komt uit de lijst, ook zonder ophaalronde", async () => {
		// De sessie is van de ontvanger en niet van deze pagina: het archief of een detailpagina komt
		// binnen op een sessie die de inbox vulde. Die pagina zag de ronde nooit, en toch hoort er
		// "Belastingdienst" te staan en geen twintig cijfers — die leest een schermlezer cijfer voor
		// cijfer voor.
		const { aanroepen } = await startKeten(stelsel(lijstMet([berichtVan("m1", OIN_BELASTINGDIENST, "Belastingdienst")])));

		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.berichten[0].afzender).toBe("Belastingdienst");
		expect(aanroepen.some((a) => a.pad.indexOf("_ophalen") !== -1)).toBe(false);
	});

	it("hoort bij het bericht, niet bij de lijst", async () => {
		// Met één organisatie in de lijst is "geeft de enige naam terug" niet te onderscheiden van
		// "kiest de juiste naam per bericht". Twee organisaties maken dat verschil zichtbaar.
		const lijst = lijstMet([berichtVan("m1", OIN_BELASTINGDIENST, "Belastingdienst"), berichtVan("m2", OIN_RVO, "RVO")]);

		await startKeten(stelsel(lijst));
		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.berichten.map((b) => b.afzender)).toEqual(["Belastingdienst", "RVO"]);
	});

	it("valt terug op het nummer zolang een uitvraag hem nog niet levert", async () => {
		// Een uitvraag van vóór deze wijziging zet geen `afzenderNaam` in de lijst. Het nummer is dan
		// het enige wat er over de afzender in staat: onleesbaar, maar waar — en een verzonnen naam
		// zou dat niet zijn.
		await startKeten(stelsel(lijstMet([berichtVan("m1", OIN_BELASTINGDIENST, null)])));

		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.berichten[0].afzender).toBe(OIN_BELASTINGDIENST);
	});
});

describe("het organisatiefilter boven de lijst", () => {
	it("blijft leeg als er niets is opgehaald", async () => {
		await startKeten(stelsel(lijstMet([])));

		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.magazijnen).toEqual([]);
	});

	it("noemt elke organisatie die in de lijst staat", async () => {
		const lijst = lijstMet([berichtVan("m1", OIN_BELASTINGDIENST, "Belastingdienst"), berichtVan("m2", OIN_RVO, "RVO"), berichtVan("m3", OIN_RVO, "RVO")]);

		await startKeten(stelsel(lijst));
		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.magazijnen).toEqual([
			{ id: OIN_BELASTINGDIENST, naam: "Belastingdienst", type: "instantie" },
			{ id: OIN_RVO, naam: "RVO", type: "instantie" },
		]);
	});

	it("noemt ook een organisatie die pas ná de ronde leverde", async () => {
		// Het gat dat het filter uit de ronde had: een bericht kan in de sessie komen zonder dat de
		// organisatie in die ronde meedeed. Kwam ze alleen in de ronde voor, dan stond haar bericht
		// wél in de lijst maar zijzelf niet in het filter — en dan filtert de bezoeker haar post weg
		// zonder dat er iets te kiezen valt.
		const lijst = lijstMet([berichtVan("m1", OIN_BELASTINGDIENST, "Belastingdienst"), berichtVan("m2", OIN_RVO, "RVO")]);

		await startKeten(stelsel(lijst, rondeLangs([[OIN_BELASTINGDIENST, "Belastingdienst", 1]])));
		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.magazijnen.map((m) => m.id)).toEqual([OIN_BELASTINGDIENST, OIN_RVO]);
	});

	it("houdt een bevraagde organisatie zonder post erin staan", async () => {
		// Wie antwoordde maar niets te leveren had, hoort in het filter thuis: dan ziet de bezoeker
		// dat er bij die organisatie niets ligt, in plaats van dat zij ontbreekt.
		const lijst = lijstMet([berichtVan("m1", OIN_BELASTINGDIENST, "Belastingdienst")]);

		await startKeten(stelsel(lijst, rondeLangs([[OIN_BELASTINGDIENST, "Belastingdienst", 1], [OIN_RVO, "RVO", 0]])));
		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.magazijnen).toEqual([
			{ id: OIN_BELASTINGDIENST, naam: "Belastingdienst", type: "instantie" },
			{ id: OIN_RVO, naam: "RVO", type: "instantie" },
		]);
	});
});
