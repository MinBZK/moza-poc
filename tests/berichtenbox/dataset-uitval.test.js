// @vitest-environment jsdom
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

/** Een verse kopie per test: de luisteraar schrijft erin, en dat mag niet lekken. */
function versDATA() {
	return {
		berichten: DATA.berichten.map((b) => ({ ...b })),
		magazijnen: DATA.magazijnen.map((m) => ({ ...m })),
		mappen: [],
	};
}

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
/**
 * Bootst de luisteraar uit de render-laag na — inclusief het terugschrijven in `data.berichten`.
 *
 * Dat terugschrijven is geen detail: het is precies wat de bron zijn eigen voorraad afnam. Een
 * nep-meld die het weglaat, laat een kapotte "Opnieuw proberen" groen door de test heen.
 */
function echteLuisteraar(data, gemeld) {
	return (wijziging) => {
		gemeld.push(wijziging);
		data.berichten = wijziging.berichten;
		return [];
	};
}

function metScenario(naam, opties = {}) {
	const volgorde = { een: 0, geen: 1, later: 2 };
	vi.spyOn(Math, "random").mockReturnValue(volgorde[naam] / 3 + 0.01);

	// `sessie` apart houden: het is een fabriek in het contract, en meespreiden zou hem hier door het
	// opslagobject zelf vervangen.
	const { sessie = nepSessie(), data = versDATA(), ...rest } = opties;
	const bron = datasetBron(data, { vlagAan: () => true, sessie: () => sessie, ...rest });
	bron._data = data;
	return bron;
}

beforeEach(() => {
	vi.spyOn(console, "info").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	window.localStorage.clear();
});
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
	it("laat binnengedruppelde berichten van andere bronnen staan", async () => {
		// Die staan in de bewaarde staat en niet in de dataset. Bouwde de uitval zijn lijst uit de
		// momentopname, dan verdwenen ze allemaal — ook die van een heel andere organisatie dan de
		// bron die net uitviel, terwijl de melding ernaast die ene bron noemt.
		// De binnengedruppelde berichten worden alleen hersteld als de vlag aan staat; zonder jsdom
		// bestaat localStorage niet en ruimt de bron ze juist op.
		window.localStorage.setItem("feature:Dynamische berichten", "true");
		vi.useFakeTimers();
		const sessie = nepSessie();
		const state = {
			ruw: {
				eersteBezoekGehad: true,
				nieuweBerichten: [{ id: "msg-live-1", magazijnId: "kvk", afzender: "KVK", datum: "2026-04-02" }],
			},
			bewaar: () => true,
			waaromNietBewaard: () => null,
		};
		const bron = metScenario("later", { sessie, state, magAnimeren: () => false });

		const gemeld = [];
		const luisteraar = echteLuisteraar(bron._data, gemeld);
		luisteraar(await bron.laad());
		expect(bron._data.berichten.map((b) => b.id)).toContain("msg-live-1");

		bron.start(luisteraar);
		await vi.advanceTimersByTimeAsync(13000);

		const weggevallen = gemeld.at(-1).uitval.uitgevallen;
		if (weggevallen.id !== "kvk") {
			expect(gemeld.at(-1).berichten.map((b) => b.id)).toContain("msg-live-1");
		}
		vi.useRealTimers();
	}, 20000);

	it("meldt een nieuwe lijst zonder die berichten", async () => {
		vi.useFakeTimers();
		const sessie = nepSessie();
		const bron = metScenario("later", { sessie, magAnimeren: () => false });
		await bron.laad();

		const gemeld = [];
		bron.start(echteLuisteraar(bron._data, gemeld));

		await vi.advanceTimersByTimeAsync(13000);

		expect(gemeld).toHaveLength(1);
		const weggevallen = gemeld[0].uitval.uitgevallen;
		expect(weggevallen).toBeTruthy();

		// De volledige verwachte lijst, niet alleen "wat weg is". `every` op een lijst waar te veel uit
		// is, is triviaal waar — bij een lege lijst zelfs per definitie.
		const verwacht = DATA.berichten.filter((b) => b.magazijnId !== weggevallen.id).map((b) => b.id);
		expect(gemeld[0].berichten.map((b) => b.id).sort()).toEqual(verwacht.sort());
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

		// En een tweede bron in dezelfde zitting — de detailpagina — leert het via zijn eigen lading.
		// Bewust niet via een losse uitval()-functie: die zou daar een eigen scenario dobbelen, en dan
		// weten de inbox en de detailpagina iets anders.
		const detail = datasetBron(DATA, { vlagAan: () => true, sessie: () => sessie });
		vi.spyOn(Math, "random").mockReturnValue(2 / 3 + 0.01);
		const inhoud = await detail.laad();
		expect(inhoud.uitval.uitgevallen).toBeTruthy();
		vi.useRealTimers();
	}, 20000);
});

describe("het scenario hoort bij de zitting", () => {
	it("blijft hetzelfde op een volgende pagina, ook al zou de dobbelsteen anders vallen", async () => {
		// Rolde elke pagina opnieuw, dan zei de inbox "deze bron is onbereikbaar" en toonde de
		// detailpagina het bericht gewoon — twee van de drie keer.
		const sessie = nepSessie();
		vi.spyOn(Math, "random").mockReturnValue(0.01); // "een"
		const inbox = datasetBron(versDATA(), { vlagAan: () => true, sessie: () => sessie });
		expect((await inbox.laad()).uitval.scenario).toBe("een");

		// Een tweede pagina in dezelfde zitting; de dobbelsteen zou nu "geen" zeggen.
		vi.spyOn(Math, "random").mockReturnValue(0.34);
		const detail = datasetBron(versDATA(), { vlagAan: () => true, sessie: () => sessie });
		expect((await detail.laad()).uitval.scenario).toBe("een");
	});

	it("kiest opnieuw nadat de vlag is omgezet", async () => {
		const sessie = nepSessie();
		vi.spyOn(Math, "random").mockReturnValue(0.01);
		const bron = datasetBron(versDATA(), { vlagAan: () => true, sessie: () => sessie });
		expect((await bron.laad()).uitval.scenario).toBe("een");

		await bron.vergeetUitval();
		vi.spyOn(Math, "random").mockReturnValue(0.34);
		expect((await bron.laad()).uitval.scenario).toBe("geen");
	});
});

describe("de bezoeker herstelt de bronnen", () => {
	it("levert daarna weer alles", async () => {
		const bron = metScenario("een");
		expect((await bron.laad()).berichten).toHaveLength(2);

		await bron.herstelBronnen();

		const na = await bron.laad();
		expect(na.berichten).toHaveLength(4);
		expect(na.uitval).toBe(null);
	});

	it("levert de weggelaten berichten opnieuw, niet alleen de melding weg", async () => {
		// De bron liet ze weg, dus alleen de bron kan ze teruggeven. Zonder deze levering houdt de
		// bezoeker een kortere lijst over én is de melding die dat verklaarde net verdwenen — bij het
		// scenario "geen" zelfs een lege postbus met "u heeft geen berichten".
		const bron = metScenario("een");
		const gemeld = [];
		const luisteraar = echteLuisteraar(bron._data, gemeld);

		// De echte volgorde: laden, en de uitkomst door de luisteraar laten gaan — die schrijft de
		// ingekorte lijst terug in data.berichten. Zonder die stap toetst deze test niets.
		luisteraar(await bron.laad());
		expect(bron._data.berichten).toHaveLength(2);
		gemeld.length = 0;

		bron.start(luisteraar);
		await bron.herstelBronnen();

		expect(gemeld).toHaveLength(1);
		expect(gemeld[0].berichten).toHaveLength(4);
		expect(gemeld[0].uitval).toBe(null);
	}, 20000);

	it("meldt het als die hernieuwde levering niet te tonen was", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const meldStoring = vi.fn();
		const bron = metScenario("een", { meldStoring });
		await bron.laad();
		bron.start(() => [new Error("rij niet te bouwen")]);

		await bron.herstelBronnen();

		expect(meldStoring).toHaveBeenCalledWith(expect.stringContaining("niet opnieuw tonen"));
	}, 20000);

	it("past de storing weer toe als de vlag opnieuw aangaat", async () => {
		// De bron laat de berichten weg bij het laden, dus alleen opnieuw leveren brengt de storing
		// terug. Zonder dat is de vlag binnen één paginalading nog maar één keer uit te zetten.
		let vlag = true;
		const gemeld = [];
		const data = versDATA();
		vi.spyOn(Math, "random").mockReturnValue(0.01); // scenario "een"
		const bron = datasetBron(data, { vlagAan: () => vlag, sessie: () => nepSessie() });
		const luisteraar = echteLuisteraar(data, gemeld);

		luisteraar(await bron.laad());
		expect(data.berichten).toHaveLength(2);
		bron.start(luisteraar);

		vlag = false;
		await bron.vergeetUitval();
		expect(data.berichten).toHaveLength(4);

		vlag = true;
		await bron.vergeetUitval();
		expect(data.berichten).toHaveLength(2);
	}, 20000);

	it("meldt het als er niemand is om de herstelde lijst aan te melden", async () => {
		// start() wordt overgeslagen na een getoonde laadfout. Stil teruggaan zou de knop dood laten
		// lijken terwijl de melding die het gemis verklaarde net is weggehaald.
		vi.spyOn(console, "error").mockImplementation(() => {});
		const meldStoring = vi.fn();
		const bron = metScenario("een", { meldStoring });
		await bron.laad();

		await bron.herstelBronnen();

		expect(meldStoring).toHaveBeenCalledWith(expect.stringContaining("niet opnieuw ophalen"));
	}, 20000);

	it("vergeet de uitval als de vlag uitgaat", async () => {
		const sessie = nepSessie({ "berichtenbox-bron-uitval": JSON.stringify({ id: "rdw", naam: "RDW" }) });
		const bron = metScenario("later", { sessie });

		bron.vergeetUitval();

		expect(sessie._kluis["berichtenbox-bron-uitval"]).toBeUndefined();
	});
});
