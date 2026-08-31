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
		expect(inhoud.uitval).toEqual({ scenario: "een", uitgevallen: null, bronnen: ["RDW"] });
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

describe("het scenario en de bewaarde uitval", () => {
	it("laat een bewaarde uitval gelden, wat de dobbelsteen ook zegt", async () => {
		// Een weggevallen bron staat in de zitting; die is daarmee een feit. Werd hij nog eens
		// getoetst aan een nieuwe worp, dan zei de inbox "deze bron is onbereikbaar" terwijl de
		// detailpagina het bericht twee van de drie keer gewoon toonde — en dát was de reden dat
		// het scenario zelf bewaard moest worden. De bewaarde uitval is nu zelfstandig, zoals op
		// main, en dan hoeft de worp niet mee te reizen.
		const sessie = nepSessie({ "berichtenbox-bron-uitval": JSON.stringify({ id: "rdw", naam: "RDW" }) });

		// De dobbelsteen zou hier "geen" zeggen; de bewaarde uitval hoort te winnen.
		vi.spyOn(Math, "random").mockReturnValue(0.34);
		const inhoud = await datasetBron(versDATA(), { vlagAan: () => true, sessie: () => sessie }).laad();

		expect(inhoud.uitval.scenario).toBe("later");
		expect(inhoud.uitval.uitgevallen.id).toBe("rdw");
		expect(inhoud.berichten.map((b) => b.id)).toEqual(["m3", "m4"]);
	});

	it("loot per paginalading opnieuw", async () => {
		// De persona's zonder stelsel zijn er om snel vormgeving te bekijken: verversen hoort een
		// ander scenario te geven. Het scenario in de zitting bewaren maakte daar één worp van,
		// die pas losliet als je het tabblad sloot.
		const sessie = nepSessie();
		const gezien = new Set();

		for (const worp of [0.01, 0.34, 0.67]) {
			vi.spyOn(Math, "random").mockReturnValue(worp);
			const inhoud = await datasetBron(versDATA(), { vlagAan: () => true, sessie: () => sessie }).laad();
			gezien.add(inhoud.uitval ? inhoud.uitval.scenario : "later");
		}

		expect([...gezien].sort()).toEqual(["een", "geen", "later"]);
		// En niets over het scenario in de zitting achtergelaten.
		expect(sessie._kluis["berichtenbox-uitval-scenario"]).toBeUndefined();
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

/**
 * De invariant, in plaats van nog een los geval.
 *
 * Vier reviewrondes vonden telkens een andere combinatie van vlag, scenario, bewaarde uitval en
 * pagina waarin de melding iets anders zei dan de lijst liet zien. Elk geval apart dichtzetten
 * leverde een volgende op. Dit is de regel waar ze allemaal onder vallen: `uitval` beschrijft
 * precies het verschil tussen wat er is en wat er geleverd wordt — niet meer en niet minder.
 */
describe("wat de bron zegt en wat hij levert", () => {
	const ALLE = ["m1", "m2", "m3", "m4"];

	/** Elke combinatie van de invoeren die eerder los van elkaar gelezen werden. */
	const gevallen = [];
	["een", "geen", "later"].forEach((scenario) => {
		[true, false].forEach((vlag) => {
			[null, "rdw", "kvk"].forEach((bewaard) => {
				gevallen.push({ scenario, vlag, bewaard });
			});
		});
	});

	gevallen.forEach(({ scenario, vlag, bewaard }) => {
		it(`klopt bij scenario ${scenario}, vlag ${vlag ? "aan" : "uit"}, bewaarde uitval ${bewaard || "geen"}`, async () => {
			const sessie = nepSessie(bewaard ? { "berichtenbox-bron-uitval": JSON.stringify({ id: bewaard, naam: bewaard.toUpperCase() }) } : {});
			const bron = metScenario(scenario, { sessie, vlagAan: () => vlag });

			const inhoud = await bron.laad();
			const geleverd = inhoud.berichten.map((b) => b.id);
			const gemist = ALLE.filter((id) => !geleverd.includes(id));

			if (!inhoud.uitval) {
				// Zwijgt de bron, dan mag er niets ontbreken. Hier viel eerder een bewaarde uitval
				// met de vlag uit doorheen: berichten weg, melding null.
				expect(gemist).toEqual([]);
				return;
			}

			// Meldt de bron iets, dan moet er ook echt iets weg zijn — en exact van de genoemde
			// afzenders. Hier viel eerder "X is zojuist onbereikbaar geworden" doorheen terwijl er
			// niets verdween.
			expect(gemist.length).toBeGreaterThan(0);

			const afzenderVan = (id) => DATA.berichten.find((b) => b.id === id).afzender;
			expect([...new Set(gemist.map(afzenderVan))].sort()).toEqual(inhoud.uitval.bronnen.slice().sort());
		});
	});

	it("laat het archief van de bezoeker staan als diens bron uitvalt", async () => {
		// m1 en m2 zijn allebei van de RDW; m1 heeft de bezoeker zelf gearchiveerd. Valt de RDW uit,
		// dan verdwijnt m2 uit de inbox — maar m1 is al binnen en blijft van hem. Zonder deze
		// zichtbaarheidscheck leegt een gesimuleerde storing ook het archief.
		const bron = metScenario("een", {
			zichtbaarheid: { statusVan: (id) => (id === "m1" ? "archief" : "inbox") },
		});

		const inhoud = await bron.laad();

		expect(inhoud.berichten.map((b) => b.id)).toEqual(["m1", "m3", "m4"]);
		expect(inhoud.uitval.bronnen).toEqual(["RDW"]);
	});
});

describe("de wekker van een geplande uitval", () => {
	it("blijft niet lopen nadat de vlag omging", async () => {
		vi.useFakeTimers();
		try {
			const bron = metScenario("later");
			await bron.laad();
			bron.start(echteLuisteraar(bron._data, []));

			const metEen = vi.getTimerCount();
			expect(metEen).toBeGreaterThan(0);

			// Elke keer dat de vlag omgaat, plant vergeetUitval() een nieuwe wekker. Wordt de oude
			// niet afgezet, dan stapelen ze op: na drie keer togglen lopen er vier, die elk op hun
			// eigen moment een magazijn omleggen. Het vlaggetje `uitvalGepland` wissen doet daar
			// niets aan — een setTimeout stopt niet omdat je een variabele op false zet.
			await bron.vergeetUitval();
			await bron.vergeetUitval();
			await bron.vergeetUitval();

			expect(vi.getTimerCount()).toBe(metEen);
		} finally {
			vi.useRealTimers();
		}
	});

	it("is weg zodra de bezoeker de bron zelf herstelt", async () => {
		vi.useFakeTimers();
		try {
			const bron = metScenario("later");
			await bron.laad();
			bron.start(echteLuisteraar(bron._data, []));
			expect(vi.getTimerCount()).toBeGreaterThan(0);

			await bron.herstelBronnen();

			// Niets meer te wachten: de bezoeker heeft gezegd dat het weer moet werken.
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("de bron laat alleen weg wat de bezoeker ook zou zien", () => {
	it("valt niet uit voor een bericht dat het org-filter al tegenhoudt", async () => {
		// Alleen de Belastingdienst staat aan. Een RDW-bericht staat dus toch al niet in de lijst;
		// de RDW laten uitvallen zou "De RDW is momenteel niet bereikbaar" opleveren boven een lijst
		// waar niets uit weg is.
		const bron = metScenario("een", {
			zichtbaarheid: { magazijnDoorOrgFilter: (id) => id === "belastingdienst" },
		});

		const inhoud = await bron.laad();

		expect(inhoud.berichten.map((b) => b.id)).toEqual(["m1", "m2", "m3", "m4"]);
		expect(inhoud.uitval).toBeNull();
	});

	it("valt niet uit voor een bericht dat niet voor deze persona is", async () => {
		const bron = metScenario("een", {
			zichtbaarheid: { persoonRelevant: (bericht) => bericht.magazijnId !== "rdw" },
		});

		const inhoud = await bron.laad();

		expect(inhoud.uitval).toBeNull();
	});

	it("kiest geen magazijn dat door het org-filter valt", async () => {
		vi.useFakeTimers();
		try {
			// Alleen de KVK staat aan — en die staat níet vooraan in de dataset, waar de RDW zit.
			// Dat onderscheid is het hele punt: koos de wekker uit de rauwe lijst, dan wees hij de
			// RDW aan, viel er niets weg (die berichten stonden er toch al niet) en bleef het bij
			// een storingsmelding zonder gevolgen. Met een fixture waarin de zichtbare bron
			// toevallig ook de eerste is, is dat verschil niet te zien.
			const bron = metScenario("later", {
				zichtbaarheid: { magazijnDoorOrgFilter: (id) => id === "kvk" },
			});
			const gemeld = [];
			await bron.laad();
			bron.start(echteLuisteraar(bron._data, gemeld));

			await vi.advanceTimersByTimeAsync(20000);

			// Eerst dát er een uitval kwam: zonder deze regel is de test leeg zodra de wekker een
			// magazijn kiest waarvan niets zichtbaar is, want dan valt er ook niets weg te laten.
			const uitval = gemeld.map((w) => w.uitval).filter(Boolean);
			expect(uitval.length).toBeGreaterThan(0);
			uitval.forEach((u) => expect(u.bronnen).toEqual(["KVK"]));
		} finally {
			vi.useRealTimers();
		}
	});

	it("laat niets weg op een pagina die het scenario niet kan uitleggen", async () => {
		// Een detailpagina heeft geen waarschuwingsblokken voor "geen". Zou de bron daar tóch alles
		// weglaten, dan staat de bezoeker voor een lege pagina zonder één woord erover — en zakt de
		// ongelezen-teller mee, op elke ándere pagina zichtbaar als een badge die niet klopt.
		const bron = metScenario("geen", { kanUitleggen: (scenario) => scenario === "later" });

		const inhoud = await bron.laad();

		expect(inhoud.berichten.map((b) => b.id)).toEqual(["m1", "m2", "m3", "m4"]);
		expect(inhoud.uitval).toBeNull();
	});
});
