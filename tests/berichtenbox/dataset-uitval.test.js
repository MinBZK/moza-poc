import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { datasetBron } from "../../assets/javascript/berichtenbox/dataset-bron.js";

/**
 * De nagebootste bronuitval, nu eigendom van de dataset-bron.
 *
 * Het punt: een bron die niet antwoordt levert geen berichten. Voorheen filterde de render-laag ze
 * weg, en dan is een gesimuleerde storing iets anders dan een echte — terwijl ze voor de bezoeker
 * hetzelfde horen te zijn.
 */

const bericht = (id, magazijnId) => ({ id, magazijnId, afzender: magazijnId.toUpperCase(), onderwerp: id, datum: "2026-04-01" });

const DATA = {
	berichten: [bericht("m1", "rdw"), bericht("m2", "rdw"), bericht("m3", "kvk"), bericht("m4", "belastingdienst")],
	magazijnen: [{ id: "rdw" }, { id: "kvk" }, { id: "belastingdienst" }],
	mappen: [],
};

function nepSessie(begin = {}) {
	const kluis = { ...begin };
	return {
		getItem: (k) => (k in kluis ? kluis[k] : null),
		setItem: (k, v) => {
			kluis[k] = String(v);
		},
		removeItem: (k) => {
			delete kluis[k];
		},
		_kluis: kluis,
	};
}

/** Dwingt één scenario af; de bron kiest anders willekeurig. */
function metScenario(naam, opties = {}) {
	const volgorde = { een: 0, geen: 1, later: 2 };
	vi.spyOn(Math, "random").mockReturnValue(volgorde[naam] / 3 + 0.01);

	// `sessie` apart houden: het is een fabriek in het contract, en meespreiden zou hem hier door het
	// opslagobject zelf vervangen.
	const { sessie = nepSessie(), ...rest } = opties;
	return datasetBron(DATA, { vlagAan: () => true, sessie: () => sessie, ...rest });
}

beforeEach(() => vi.spyOn(console, "info").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("een magazijn dat niet antwoordt", () => {
	it("levert geen berichten, in plaats van ze te laten wegfilteren", async () => {
		const inhoud = await metScenario("een").laad();

		expect(inhoud.berichten.map((b) => b.id)).toEqual(["m3", "m4"]);
		expect(inhoud.uitval).toEqual({ scenario: "een", uitgevallen: null });
	});

	it("levert bij 'geen' helemaal niets", async () => {
		const inhoud = await metScenario("geen").laad();

		expect(inhoud.berichten).toEqual([]);
		expect(inhoud.uitval.scenario).toBe("geen");
	});

	it("levert bij 'later' eerst alles", async () => {
		const inhoud = await metScenario("later").laad();

		expect(inhoud.berichten).toHaveLength(4);
		// Er is nog niets uitgevallen, dus valt er ook niets te melden.
		expect(inhoud.uitval).toBe(null);
	});

	it("levert alles zodra de vlag uit staat", async () => {
		const inhoud = await datasetBron(DATA, { vlagAan: () => false }).laad();

		expect(inhoud.berichten).toHaveLength(4);
		expect(inhoud.uitval).toBe(null);
	});
});

describe("een bron die onderweg wegvalt", () => {
	it("meldt een nieuwe lijst zonder die berichten", async () => {
		vi.useFakeTimers();
		const sessie = nepSessie();
		const bron = metScenario("later", { sessie, magAnimeren: () => false });
		await bron.laad();

		const gemeld = [];
		bron.start((wijziging) => {
			gemeld.push(wijziging);
			return [];
		});

		await vi.advanceTimersByTimeAsync(13000);

		expect(gemeld).toHaveLength(1);
		const weggevallen = gemeld[0].uitval.uitgevallen;
		expect(weggevallen).toBeTruthy();
		expect(gemeld[0].berichten.every((b) => b.magazijnId !== weggevallen.id)).toBe(true);
		vi.useRealTimers();
	}, 20000);

	it("onthoudt dat in de zitting, zodat de detailpagina het ook weet", async () => {
		vi.useFakeTimers();
		const sessie = nepSessie();
		const bron = metScenario("later", { sessie, magAnimeren: () => false });
		await bron.laad();
		bron.start(() => []);
		await vi.advanceTimersByTimeAsync(13000);

		expect(sessie._kluis["berichtenbox-bron-uitval"]).toBeTruthy();
		// En een tweede bron in dezelfde zitting leest dezelfde stand.
		const detail = datasetBron(DATA, { vlagAan: () => true, sessie: () => sessie });
		vi.spyOn(Math, "random").mockReturnValue(2 / 3 + 0.01);
		expect(detail.uitval().uitgevallen).toBeTruthy();
		vi.useRealTimers();
	}, 20000);
});

describe("de bezoeker herstelt de bronnen", () => {
	it("levert daarna weer alles", async () => {
		const bron = metScenario("een");
		expect((await bron.laad()).berichten).toHaveLength(2);

		bron.herstelBronnen();

		expect((await bron.laad()).berichten).toHaveLength(4);
		expect(bron.uitval()).toBe(null);
	});

	it("vergeet de uitval als de vlag uitgaat", async () => {
		const sessie = nepSessie({ "berichtenbox-bron-uitval": JSON.stringify({ id: "rdw", naam: "RDW" }) });
		const bron = metScenario("later", { sessie });

		bron.vergeetUitval();

		expect(sessie._kluis["berichtenbox-bron-uitval"]).toBeUndefined();
	});
});
