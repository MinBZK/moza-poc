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
		bewaar: vi.fn(),
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
		vi.useFakeTimers();
		const meld = vi.fn();
		datasetBron({ berichten: [], magazijnen: [], mappen: [] }, { state: nepState() }).start(meld);
		vi.advanceTimersByTime(120000);
		expect(meld).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});
