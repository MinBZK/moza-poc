import { describe, it, expect } from "vitest";
import { filterBerichten, sorteerBerichten, paginaVan } from "../../assets/javascript/berichtenbox/lijst.js";

const ALLES = () => true;

function bericht(over = {}) {
	return {
		id: "m1",
		magazijnId: "gemeente",
		afzender: "Gemeente Utrecht",
		onderwerp: "Aanslag",
		datum: "2026-02-12",
		map: null,
		...over,
	};
}

/** Minimale state-dubbel: filterBerichten gebruikt alleen statusVan en mapVan. */
function state({ status = "inbox", map = null } = {}) {
	return {
		statusVan: () => status,
		mapVan: (_id, origineel) => (map === null ? origineel : map),
	};
}

function criteria(over = {}) {
	return {
		view: "inbox",
		zoek: "",
		afzenders: new Set(),
		map: null,
		magazijnToegestaan: ALLES,
		persoonRelevant: ALLES,
		state: state(),
		...over,
	};
}

describe("filterBerichten", () => {
	it("toont in de inbox alleen berichten met status inbox", () => {
		const uit = filterBerichten([bericht()], criteria({ state: state({ status: "archief" }) }));
		expect(uit).toEqual([]);
	});

	it("toont in het archief alleen gearchiveerde berichten", () => {
		const uit = filterBerichten([bericht()], criteria({ view: "archief", state: state({ status: "archief" }) }));
		expect(uit).toHaveLength(1);
	});

	it("zoekt op afzender en onderwerp, hoofdletterongevoelig", () => {
		const berichten = [bericht({ id: "a", onderwerp: "Aanslag" }), bericht({ id: "b", onderwerp: "Subsidie" })];
		expect(filterBerichten(berichten, criteria({ zoek: "aansl" })).map((b) => b.id)).toEqual(["a"]);
		expect(filterBerichten(berichten, criteria({ zoek: "GEMEENTE" }))).toHaveLength(2);
	});

	it("negeert witruimte om de zoekterm", () => {
		const berichten = [bericht({ id: "a", onderwerp: "Aanslag" })];
		expect(filterBerichten(berichten, criteria({ zoek: "  aanslag  " }))).toHaveLength(1);
	});

	it("laat een leeg afzenderfilter alles door", () => {
		const berichten = [bericht({ id: "a" }), bericht({ id: "b", magazijnId: "belastingdienst" })];
		expect(filterBerichten(berichten, criteria())).toHaveLength(2);
	});

	it("filtert op de gekozen afzenders", () => {
		const berichten = [bericht({ id: "a" }), bericht({ id: "b", magazijnId: "belastingdienst" })];
		const uit = filterBerichten(berichten, criteria({ afzenders: new Set(["belastingdienst"]) }));
		expect(uit.map((b) => b.id)).toEqual(["b"]);
	});

	it("respecteert een geblokkeerd magazijn", () => {
		const berichten = [bericht({ id: "a", magazijnId: "geblokkeerd" })];
		const uit = filterBerichten(berichten, criteria({ magazijnToegestaan: (id) => id !== "geblokkeerd" }));
		expect(uit).toEqual([]);
	});

	it("respecteert persona-relevantie", () => {
		const berichten = [bericht({ id: "a" }), bericht({ id: "b" })];
		const uit = filterBerichten(berichten, criteria({ persoonRelevant: (b) => b.id === "b" }));
		expect(uit.map((b) => b.id)).toEqual(["b"]);
	});

	it("gebruikt de map-override uit de state, niet de map van het bericht", () => {
		const berichten = [bericht({ id: "a", map: "Subsidies" })];
		const uit = filterBerichten(berichten, criteria({
			map: "Belastingen 2025",
			state: state({ map: "Belastingen 2025" }),
		}));
		expect(uit.map((b) => b.id)).toEqual(["a"]);
	});

	it("filtert op de map van het bericht als er geen override is", () => {
		const berichten = [bericht({ id: "a", map: "Subsidies" }), bericht({ id: "b", map: null })];
		expect(filterBerichten(berichten, criteria({ map: "Subsidies" })).map((b) => b.id)).toEqual(["a"]);
	});

	it("overleeft een null tussen de berichten", () => {
		expect(filterBerichten([null, bericht()], criteria())).toHaveLength(1);
	});

	it("houdt de volgorde van de bron aan", () => {
		const berichten = [bericht({ id: "c" }), bericht({ id: "a" }), bericht({ id: "b" })];
		expect(filterBerichten(berichten, criteria()).map((b) => b.id)).toEqual(["c", "a", "b"]);
	});
});

describe("sorteerBerichten", () => {
	it("sorteert op datum zonder de invoer te muteren", () => {
		const berichten = [bericht({ id: "a", datum: "2026-01-01" }), bericht({ id: "b", datum: "2026-03-01" })];
		expect(sorteerBerichten(berichten, "datum", false).map((b) => b.id)).toEqual(["b", "a"]);
		expect(berichten.map((b) => b.id)).toEqual(["a", "b"]);
	});

	it("sorteert afzenders in Nederlandse volgorde", () => {
		const berichten = [bericht({ id: "a", afzender: "Zorginstituut" }), bericht({ id: "b", afzender: "Belastingdienst" })];
		expect(sorteerBerichten(berichten, "afzender", true).map((b) => b.id)).toEqual(["b", "a"]);
	});

	it("sorteert nummers in een onderwerp op waarde, niet op teken", () => {
		const berichten = [bericht({ id: "a", onderwerp: "Brief 10" }), bericht({ id: "b", onderwerp: "Brief 9" })];
		expect(sorteerBerichten(berichten, "onderwerp", true).map((b) => b.id)).toEqual(["b", "a"]);
	});

	it("zet een ontbrekend veld vooraan bij oplopend sorteren", () => {
		const berichten = [bericht({ id: "a", map: "Subsidies" }), bericht({ id: "b", map: null })];
		expect(sorteerBerichten(berichten, "map", true).map((b) => b.id)).toEqual(["b", "a"]);
	});
});

describe("paginaVan", () => {
	const vijfentwintig = Array.from({ length: 25 }, (_, i) => bericht({ id: "m" + i }));

	it("geeft het venster van de gevraagde pagina", () => {
		expect(paginaVan(vijfentwintig, 2, 10).items.map((b) => b.id))
			.toEqual(["m10", "m11", "m12", "m13", "m14", "m15", "m16", "m17", "m18", "m19"]);
	});

	it("klemt een te hoge pagina naar de laatste", () => {
		const uit = paginaVan(vijfentwintig, 99, 10);
		expect(uit.pagina).toBe(3);
		expect(uit.items).toHaveLength(5);
	});

	it("klemt een te lage pagina naar de eerste", () => {
		expect(paginaVan(vijfentwintig, 0, 10).pagina).toBe(1);
	});

	it("geeft één pagina terug als er geen paginagrootte is", () => {
		const uit = paginaVan(vijfentwintig, 1, Infinity);
		expect(uit.totaalPaginas).toBe(1);
		expect(uit.items).toHaveLength(25);
	});

	it("houdt een lege lijst op één pagina", () => {
		const uit = paginaVan([], 1, 10);
		expect(uit.totaalPaginas).toBe(1);
		expect(uit.items).toEqual([]);
	});
});
