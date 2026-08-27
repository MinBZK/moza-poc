import { describe, it, expect, vi, afterEach } from "vitest";
import { datasetBron } from "../../assets/javascript/berichtenbox/dataset-bron.js";

const DATA = {
	berichten: [{ id: "msg-1", magazijnId: "gem", afzender: "Gemeente" }],
	magazijnen: [{ id: "gem", naam: "Gemeente" }],
	mappen: [{ naam: "Subsidies", slug: "subsidies" }],
};

function nepState(nieuweBerichten = []) {
	return {
		ruw: { nieuweBerichten },
		// Standaard geslaagd: een fake die `undefined` teruggeeft laat elke test draaien tegen een
		// opslag die zegt dat hij faalde, en dat zou niemand opvallen.
		bewaar: vi.fn(() => true),
	};
}

function metVlag(aan) {
	const opslag = { "feature:Dynamische berichten": aan ? "true" : "false" };
	vi.stubGlobal("localStorage", {
		getItem: (k) => (k in opslag ? opslag[k] : null),
		setItem: () => {},
	});
}

afterEach(() => {
	// Ook als een test halverwege omvalt: blijvende fake timers laten de volgende test vastlopen
	// op setTimeout, en dan lijkt díe de schuldige.
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("datasetBron — laden", () => {
	it("is altijd van toepassing", async () => {
		expect(await datasetBron(DATA).geldtVoor({ id: "wie dan ook" })).toBe(true);
	});

	it("levert kopieën, zodat de render-laag de dataset niet muteert", async () => {
		const bron = datasetBron(DATA);
		const uit = await bron.laad();
		uit.berichten.push({ id: "erbij" });
		expect(DATA.berichten).toHaveLength(1);
	});

	it("overleeft een dataset zonder velden", async () => {
		const uit = await datasetBron({}).laad();
		expect(uit).toEqual({ berichten: [], magazijnen: [], mappen: [] });
	});

	it("ruimt eerder binnengedruppelde berichten op als de vlag uit staat", async () => {
		metVlag(false);
		const state = nepState([{ id: "msg-live-1", magazijnId: "gem" }]);
		const uit = await datasetBron(DATA, { state }).laad();
		expect(uit.berichten.map((b) => b.id)).toEqual(["msg-1"]);
		expect(state.ruw.nieuweBerichten).toEqual([]);
		expect(state.bewaar).toHaveBeenCalled();
	});

	it("herstelt eerder binnengedruppelde berichten als de vlag aan staat", async () => {
		metVlag(true);
		const state = nepState([{ id: "msg-live-1", magazijnId: "gem" }]);
		const uit = await datasetBron(DATA, { state }).laad();
		expect(uit.berichten.map((b) => b.id)).toEqual(["msg-live-1", "msg-1"]);
	});

	it("herstelt geen bericht dat al in de dataset staat", async () => {
		metVlag(true);
		const state = nepState([{ id: "msg-1", magazijnId: "gem" }]);
		const uit = await datasetBron(DATA, { state }).laad();
		expect(uit.berichten.map((b) => b.id)).toEqual(["msg-1"]);
	});
});

describe("datasetBron — binnendruppelende berichten", () => {
	it("meldt dat de demo uitgespeeld is in plaats van door te blijven tikken", () => {
		metVlag(true);
		vi.useFakeTimers();
		vi.stubGlobal("location", { search: "?poll=5" });
		const stoppen = vi.spyOn(globalThis, "clearInterval");
		const state = nepState();
		datasetBron(DATA, { state, limiet: 1 }).start(vi.fn());
		vi.advanceTimersByTime(5000 * 3);
		expect(state.ruw.nieuweBerichten).toHaveLength(1);
		expect(stoppen).toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("meldt het als er geen magazijnen zijn om van te ontvangen", () => {
		metVlag(true);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const meldStoring = vi.fn();
		datasetBron({ berichten: [], magazijnen: [], mappen: [] }, { state: nepState(), meldStoring }).start(vi.fn());
		expect(meldStoring).toHaveBeenCalledWith(expect.stringContaining("geen bronnen"), "info");
	});

	it("zegt het als de demo uitgespeeld is", () => {
		metVlag(true);
		vi.useFakeTimers();
		vi.stubGlobal("location", { search: "?poll=5" });
		const meldStoring = vi.fn();
		datasetBron(DATA, { state: nepState(), limiet: 1, meldStoring }).start(vi.fn());
		vi.advanceTimersByTime(5000 * 3);
		expect(meldStoring).toHaveBeenCalledWith(expect.stringContaining("Alle demo-berichten"), "info");
		vi.useRealTimers();
	});

	it("zegt het als een binnengekomen bericht niet getoond kon worden", () => {
		metVlag(true);
		vi.useFakeTimers();
		vi.stubGlobal("location", { search: "?poll=5" });
		vi.spyOn(console, "error").mockImplementation(() => {});
		const meldStoring = vi.fn();
		datasetBron(DATA, { state: nepState(), limiet: 5, meldStoring }).start(() => [new Error("niet te tonen")]);
		vi.advanceTimersByTime(5000);
		expect(meldStoring).toHaveBeenCalledWith(expect.stringContaining("niet worden getoond"));
		vi.useRealTimers();
	});

	it("herstelt geen bericht van een magazijn dat de bron niet kent", async () => {
		metVlag(true);
		const state = nepState([{ id: "msg-live-1", magazijnId: "verdwenen" }]);
		const uit = await datasetBron(DATA, { state }).laad();
		expect(uit.berichten.map((b) => b.id)).toEqual(["msg-1"]);
	});

	it("start niet als de vlag uit staat", () => {
		metVlag(false);
		vi.useFakeTimers();
		const meld = vi.fn();
		datasetBron(DATA, { state: nepState() }).start(meld);
		vi.advanceTimersByTime(120000);
		expect(meld).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("start niet op een pagina die er niet om vraagt", () => {
		metVlag(true);
		vi.useFakeTimers();
		const meld = vi.fn();
		datasetBron(DATA, { state: nepState(), magOphalen: () => false }).start(meld);
		vi.advanceTimersByTime(120000);
		expect(meld).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("meldt één nieuw bericht per tik", () => {
		metVlag(true);
		vi.useFakeTimers();
		vi.stubGlobal("location", { search: "?poll=5" });
		const state = nepState();
		const meld = vi.fn();
		datasetBron(DATA, { state, limiet: 5 }).start(meld);
		vi.advanceTimersByTime(5000);
		expect(meld).toHaveBeenCalledOnce();
		expect(meld.mock.calls[0][0].nieuwBericht.afzender).toBe("Gemeente");
		expect(state.ruw.nieuweBerichten).toHaveLength(1);
		vi.useRealTimers();
	});

	it("stopt bij de limiet", () => {
		metVlag(true);
		vi.useFakeTimers();
		vi.stubGlobal("location", { search: "?poll=5" });
		const state = nepState();
		const meld = vi.fn();
		datasetBron(DATA, { state, limiet: 2 }).start(meld);
		vi.advanceTimersByTime(5000 * 5);
		expect(meld).toHaveBeenCalledTimes(2);
		vi.useRealTimers();
	});

	it("stopt als een nieuw bericht niet getoond kon worden", () => {
		metVlag(true);
		vi.useFakeTimers();
		vi.stubGlobal("location", { search: "?poll=5" });
		vi.spyOn(console, "error").mockImplementation(() => {});
		const meld = vi.fn(() => [new Error("niet te tonen")]);
		datasetBron(DATA, { state: nepState(), limiet: 5 }).start(meld);
		vi.advanceTimersByTime(5000 * 4);
		expect(meld).toHaveBeenCalledOnce();
		vi.useRealTimers();
	});

	it("houdt een ondergrens aan voor de tussenpoos", () => {
		metVlag(true);
		vi.useFakeTimers();
		vi.stubGlobal("location", { search: "?poll=1" });
		const meld = vi.fn();
		datasetBron(DATA, { state: nepState(), limiet: 5 }).start(meld);
		vi.advanceTimersByTime(1000);
		expect(meld).not.toHaveBeenCalled();
		vi.advanceTimersByTime(4000);
		expect(meld).toHaveBeenCalledOnce();
		vi.useRealTimers();
	});

	it("start niet zonder magazijnen", () => {
		metVlag(true);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.useFakeTimers();
		const meld = vi.fn();
		datasetBron({ berichten: [], magazijnen: [], mappen: [] }, { state: nepState() }).start(meld);
		vi.advanceTimersByTime(120000);
		expect(meld).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});

describe("datasetBron — als er niets bewaard kan worden", () => {
	it("stopt met binnendruppelen en zegt dat", () => {
		metVlag(true);
		vi.useFakeTimers();
		vi.stubGlobal("location", { search: "?poll=5" });
		vi.spyOn(console, "error").mockImplementation(() => {});
		const state = nepState();
		state.bewaar = vi.fn(() => false);
		const meldStoring = vi.fn();
		const meld = vi.fn(() => []);

		datasetBron(DATA, { state, limiet: 5, meldStoring }).start(meld);
		vi.advanceTimersByTime(5000 * 4);

		expect(meld).not.toHaveBeenCalled();
		expect(state.ruw.nieuweBerichten).toHaveLength(0);
		expect(meldStoring).toHaveBeenCalledWith(expect.stringContaining("niet worden bewaard"));
		vi.useRealTimers();
	});

	it("zet eerder ontvangen berichten terug als opruimen niet bewaard kan worden", async () => {
		metVlag(false);
		const state = nepState([{ id: "msg-live-1", magazijnId: "gem" }]);
		state.bewaar = vi.fn(() => false);
		const meldStoring = vi.fn();

		await datasetBron(DATA, { state, meldStoring }).laad();

		expect(state.ruw.nieuweBerichten).toHaveLength(1);
		expect(meldStoring).toHaveBeenCalledWith(expect.stringContaining("niet worden opgeruimd"), "info");
	});
});
