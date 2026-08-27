import { describe, it, expect, vi, afterEach } from "vitest";
import { maakState, LS_KEY, NIEUWE_BERICHTEN_LIMIET } from "../../assets/javascript/berichtenbox/state.js";

function nepOpslag(inhoud = {}) {
	const kluis = { ...inhoud };
	return {
		getItem: (sleutel) => (sleutel in kluis ? kluis[sleutel] : null),
		setItem: (sleutel, waarde) => { kluis[sleutel] = String(waarde); },
		_kluis: kluis,
	};
}

function metState(state) {
	return nepOpslag({ [LS_KEY]: JSON.stringify(state) });
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("maakState — inlezen", () => {
	it("valt terug op de default-state als er niets bewaard is", () => {
		const state = maakState(nepOpslag());
		expect(state.statusVan("msg-1")).toBe("inbox");
		expect(state.ruw.eigenMappen).toEqual([]);
		expect(state.ruw.eersteBezoekGehad).toBe(false);
	});

	it("meldt zich onleesbaar bij corrupte JSON, en weigert erover te schrijven", () => {
		// Doorgaan met een lege state mag; hem wegschrijven niet. Dan is wat de bezoeker had
		// gearchiveerd, weggegooid of in mappen gezet onherstelbaar weg in plaats van tijdelijk
		// onbereikbaar.
		const fout = vi.spyOn(console, "error").mockImplementation(() => {});
		const opslag = nepOpslag({ [LS_KEY]: "{niet json" });
		const state = maakState(opslag);

		expect(state.statusVan("msg-1")).toBe("inbox");
		expect(state.onleesbaar).toBe(true);
		expect(state.bewaar()).toBe(false);
		expect(opslag._kluis[LS_KEY]).toBe("{niet json");
		expect(fout).toHaveBeenCalled();
	});

	it("weigert een bewaarde array als state, en schrijft er niet overheen", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const opslag = nepOpslag({ [LS_KEY]: "[1,2,3]" });
		const state = maakState(opslag);

		expect(state.ruw.gelezen).toEqual({});
		expect(state.onleesbaar).toBe(true);
		state.bewaar();
		expect(opslag._kluis[LS_KEY]).toBe("[1,2,3]");
	});

	it("noemt de reden waarom er niet bewaard kon worden", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const vol = nepOpslag();
		vol.setItem = () => { const e = new Error("vol"); e.name = "QuotaExceededError"; throw e; };
		const state = maakState(vol);
		state.bewaar();
		expect(state.waaromNietBewaard()).toBe("vol");

		const geweigerd = nepOpslag();
		geweigerd.setItem = () => { const e = new Error("nee"); e.name = "SecurityError"; throw e; };
		const tweede = maakState(geweigerd);
		tweede.bewaar();
		expect(tweede.waaromNietBewaard()).toBe("geweigerd");
	});

	it("normaliseert een sleutel die geen object is", () => {
		const state = maakState(metState({ gearchiveerd: "kapot", mapOverride: [] }));
		expect(state.ruw.gearchiveerd).toEqual({});
		expect(state.ruw.mapOverride).toEqual({});
	});

	it("normaliseert eigenMappen dat geen array is", () => {
		const state = maakState(metState({ eigenMappen: "Belastingen" }));
		expect(state.ruw.eigenMappen).toEqual([]);
	});
});

describe("maakState — vragen over een bericht", () => {
	it("geeft prullenbak voorrang op archief", () => {
		const state = maakState(metState({
			gearchiveerd: { "msg-1": true },
			verwijderd: { "msg-1": true },
		}));
		expect(state.statusVan("msg-1")).toBe("prullenbak");
	});

	it("laat een gelezen bericht niet meer als ongelezen tellen", () => {
		const state = maakState(metState({ gelezen: { "msg-1": true } }));
		expect(state.isOngelezen("msg-1", true)).toBe(false);
	});

	it("laat handmatig op ongelezen zetten winnen van gelezen", () => {
		const state = maakState(metState({
			gelezen: { "msg-1": true },
			ongelezenToegevoegd: { "msg-1": true },
		}));
		expect(state.isOngelezen("msg-1", false)).toBe(true);
	});

	it("valt zonder uitspraak terug op de waarde uit het bericht", () => {
		const state = maakState(nepOpslag());
		expect(state.isOngelezen("msg-1", true)).toBe(true);
		expect(state.mapVan("msg-1", "Subsidies")).toBe("Subsidies");
		expect(state.isGemarkeerd("msg-1", true)).toBe(true);
	});

	it("laat een map-override van null de map van het bericht wissen", () => {
		const state = maakState(metState({ mapOverride: { "msg-1": null } }));
		expect(state.mapVan("msg-1", "Subsidies")).toBe(null);
	});

	it("laat een markering expliciet uitzetten", () => {
		const state = maakState(metState({ gemarkeerd: { "msg-1": false } }));
		expect(state.isGemarkeerd("msg-1", true)).toBe(false);
	});
});

describe("maakState — binnengedruppelde berichten", () => {
	it("houdt bij het inlezen nog alle magazijnen aan", () => {
		// Bij het inlezen is nog niet bekend welke bron gekozen wordt. Hier al wegfilteren tegen de
		// verkeerde lijst is onomkeerbaar: beperkTot kan alleen verder inperken, nooit herstellen.
		const state = maakState(metState({
			nieuweBerichten: [
				{ id: "a", magazijnId: "van-een-andere-bron" },
				{ id: "b", magazijnId: "blijft" },
			],
		}));
		expect(state.ruw.nieuweBerichten.map((b) => b.id)).toEqual(["a", "b"]);
	});

	it("gooit berichten van onbekende magazijnen weg zodra de bron bekend is", () => {
		const waarschuwing = vi.spyOn(console, "warn").mockImplementation(() => {});
		const state = maakState(metState({
			nieuweBerichten: [
				{ id: "a", magazijnId: "weg" },
				{ id: "b", magazijnId: "blijft" },
			],
		}));
		state.beperkTot(["blijft"]);
		expect(state.ruw.nieuweBerichten.map((b) => b.id)).toEqual(["b"]);
		expect(waarschuwing).toHaveBeenCalled();
	});

	it("kapt af op de limiet en houdt de nieuwste", () => {
		const teveel = Array.from({ length: NIEUWE_BERICHTEN_LIMIET + 3 }, (_, i) => ({
			id: "m" + i,
			magazijnId: "blijft",
		}));
		const state = maakState(metState({ nieuweBerichten: teveel }));
		expect(state.ruw.nieuweBerichten).toHaveLength(NIEUWE_BERICHTEN_LIMIET);
		expect(state.ruw.nieuweBerichten.at(-1).id).toBe("m" + (NIEUWE_BERICHTEN_LIMIET + 2));
	});

	it("overleeft een null tussen de bewaarde berichten", () => {
		const state = maakState(metState({
			nieuweBerichten: [null, { id: "b", magazijnId: "blijft" }],
		}));
		expect(state.ruw.nieuweBerichten.map((b) => b.id)).toEqual(["b"]);
	});
});

describe("maakState — bewaren", () => {
	it("schrijft de state terug naar de opslag", () => {
		const opslag = nepOpslag();
		const state = maakState(opslag);
		state.ruw.gearchiveerd["msg-1"] = true;
		state.bewaar();
		expect(JSON.parse(opslag._kluis[LS_KEY]).gearchiveerd).toEqual({ "msg-1": true });
	});

	it("zegt dat het bewaren niet lukte, in plaats van het stil te slikken", () => {
		// De aanroeper moet dit kunnen weten: anders ziet de bezoeker zijn bericht verdwijnen en
		// staat het na het verversen gewoon weer in de inbox.
		const opslag = nepOpslag();
		opslag.setItem = () => { throw new Error("QuotaExceededError"); };
		const fout = vi.spyOn(console, "error").mockImplementation(() => {});
		const state = maakState(opslag);
		expect(state.bewaar()).toBe(false);
		expect(fout).toHaveBeenCalled();
	});

	it("bevestigt een geslaagde schrijfactie", () => {
		expect(maakState(nepOpslag()).bewaar()).toBe(true);
	});

	it("kapt bij het bewaren opnieuw af op de limiet", () => {
		const opslag = nepOpslag();
		const state = maakState(opslag);
		state.ruw.nieuweBerichten = Array.from({ length: NIEUWE_BERICHTEN_LIMIET + 2 }, (_, i) => ({ id: "m" + i }));
		state.bewaar();
		expect(JSON.parse(opslag._kluis[LS_KEY]).nieuweBerichten).toHaveLength(NIEUWE_BERICHTEN_LIMIET);
	});
});
