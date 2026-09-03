// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { antwoord, PERSONAS, ruimKetenOp, sseAntwoord, standaardRonde, startKeten } from "./keten-harnas.js";

/**
 * De pollcyclus van `berichtenbox-keten.js`: nieuwe berichten die verschijnen terwijl de
 * berichtenbox openstaat.
 *
 * Wat hier op het spel staat, is dat het pollen de organisaties niet opnieuw bevraagt. De
 * ophaalronde gaat langs alle magazijnen van een ontvanger; de lijst leest alleen de sessie die
 * die ronde gevuld heeft. Dat verschil is voor de bezoeker onzichtbaar en voor het stelsel niet.
 *
 * En dat een verlopen sessie wél een nieuwe ronde krijgt: zonder sessie is er niets te lezen, en
 * dan is stil blijven pollen hetzelfde als niets doen.
 */

/** Eén bericht in de vorm die de berichtenuitvraag teruggeeft. */
function apiBericht(id) {
	return {
		berichtId: id,
		magazijnId: "00000001000000000000",
		onderwerp: "Bericht " + id,
		publicatietijdstip: "2026-09-03T09:00:00Z",
		status: "ongelezen",
	};
}

/** Antwoorden op de berichtenlijst, één per aanroep; het laatste blijft gelden. */
function lijstReeks(...antwoorden) {
	let beurt = 0;
	return () => antwoorden[Math.min(beurt++, antwoorden.length - 1)];
}

const LEEG = () => antwoord(200, { berichten: [] });
const EEN_BERICHT = () => antwoord(200, { berichten: [apiBericht("b-1")] });
const GEEN_SESSIE = () => antwoord(409, { title: "Conflict" });

/** Hoe vaak de berichtenlijst is opgevraagd, en hoe vaak er een ophaalronde langs de bronnen ging. */
function tellingen(aanroepen) {
	return {
		lijst: aanroepen.filter((aanroep) => aanroep.pad.indexOf("/api/v1/berichten?") !== -1).length,
		rondes: aanroepen.filter((aanroep) => aanroep.pad.indexOf("_ophalen") !== -1).length,
	};
}

function zetZichtbaarheid(staat) {
	Object.defineProperty(document, "visibilityState", { configurable: true, get: () => staat });
	document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
	vi.useFakeTimers();
	sessionStorage.clear();
	localStorage.clear();
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	// Elke test draait zijn eigen exemplaar van het script. Zonder dit blijft het vorige exemplaar
	// pollen — het houdt zijn eigen sluiting vast — en telt zijn verkeer mee in de volgende test.
	window.dispatchEvent(new Event("pagehide"));
	ruimKetenOp();
	zetZichtbaarheid("visible");
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("de pollcyclus haalt op zonder de organisaties te bevragen", () => {
	it("vraagt na het interval alleen de berichtenlijst opnieuw op", async () => {
		const { aanroepen } = await startKeten(standaardRonde([["/api/v1/berichten?", lijstReeks(LEEG(), EEN_BERICHT())]]));
		const na = tellingen(aanroepen);

		await vi.advanceTimersByTimeAsync(15000);

		expect(tellingen(aanroepen).lijst).toBe(na.lijst + 1);
		expect(tellingen(aanroepen).rondes).toBe(na.rondes);
	});

	it("meldt de berichten die erbij gekomen zijn", async () => {
		await startKeten(standaardRonde([["/api/v1/berichten?", lijstReeks(LEEG(), EEN_BERICHT())]]));
		const gemeld = [];
		window.BerichtenboxKeten.opWijziging((toestand) => gemeld.push(toestand.uitkomst));

		await vi.advanceTimersByTimeAsync(15000);

		const laatste = gemeld[gemeld.length - 1];
		expect(laatste.berichten.map((bericht) => bericht.id)).toEqual(["b-1"]);
	});

	it("meldt niets als de lijst niet veranderd is", async () => {
		await startKeten(standaardRonde([["/api/v1/berichten?", lijstReeks(EEN_BERICHT())]]));
		const gemeld = [];
		window.BerichtenboxKeten.opWijziging((toestand) => gemeld.push(toestand.uitkomst));

		await vi.advanceTimersByTimeAsync(45000);

		expect(gemeld).toEqual([]);
	});
});

describe("het pollritme is in te stellen", () => {
	it("volgt het interval uit de URL", async () => {
		const { aanroepen } = await startKeten(standaardRonde([["/api/v1/berichten?", lijstReeks(LEEG())]]), "/moza/berichtenbox/?poll=30");
		const na = tellingen(aanroepen);

		await vi.advanceTimersByTimeAsync(15000);
		expect(tellingen(aanroepen).lijst).toBe(na.lijst);

		await vi.advanceTimersByTimeAsync(15000);
		expect(tellingen(aanroepen).lijst).toBe(na.lijst + 1);
	});

	it("volgt het interval uit de instellingen van het Flags-paneel", async () => {
		localStorage.setItem("setting:berichtenbox-poll", "30");
		const { aanroepen } = await startKeten(standaardRonde([["/api/v1/berichten?", lijstReeks(LEEG())]]));
		const na = tellingen(aanroepen);

		await vi.advanceTimersByTimeAsync(15000);
		expect(tellingen(aanroepen).lijst).toBe(na.lijst);

		await vi.advanceTimersByTimeAsync(15000);
		expect(tellingen(aanroepen).lijst).toBe(na.lijst + 1);
	});

	it("houdt een ondergrens aan, ook als er om een korter interval gevraagd wordt", async () => {
		// Elke seconde de lijst opvragen is voor de demonstratie geen winst en voor het stelsel wel
		// verkeer.
		const { aanroepen } = await startKeten(standaardRonde([["/api/v1/berichten?", lijstReeks(LEEG())]]), "/moza/berichtenbox/?poll=1");
		const na = tellingen(aanroepen);

		await vi.advanceTimersByTimeAsync(1000);
		expect(tellingen(aanroepen).lijst).toBe(na.lijst);

		await vi.advanceTimersByTimeAsync(4000);
		expect(tellingen(aanroepen).lijst).toBe(na.lijst + 1);
	});

	it("pollt niet als het uitgezet is", async () => {
		const { aanroepen } = await startKeten(standaardRonde([["/api/v1/berichten?", lijstReeks(LEEG())]]), "/moza/berichtenbox/?poll=0");
		const na = tellingen(aanroepen);

		await vi.advanceTimersByTimeAsync(600000);

		expect(tellingen(aanroepen).lijst).toBe(na.lijst);
	});
});

describe("een tabblad dat niemand voor zich heeft", () => {
	it("pollt trager zolang het tabblad niet zichtbaar is", async () => {
		// Niet helemaal stoppen: de sessie bij het stelsel heeft een schuivende vervaltijd, en een
		// berichtenbox die openstaat hoort hem in stand te houden.
		const { aanroepen } = await startKeten(standaardRonde([["/api/v1/berichten?", lijstReeks(LEEG())]]));
		zetZichtbaarheid("hidden");
		const na = tellingen(aanroepen);

		await vi.advanceTimersByTimeAsync(15000);
		expect(tellingen(aanroepen).lijst).toBe(na.lijst);

		await vi.advanceTimersByTimeAsync(45000);
		expect(tellingen(aanroepen).lijst).toBe(na.lijst + 1);
	});

	it("haalt meteen op zodra het tabblad weer zichtbaar is", async () => {
		// Wie terugkomt hoort niet nog een interval te wachten op berichten die er al zijn.
		const { aanroepen } = await startKeten(standaardRonde([["/api/v1/berichten?", lijstReeks(LEEG())]]));
		zetZichtbaarheid("hidden");
		await vi.advanceTimersByTimeAsync(5000);
		const na = tellingen(aanroepen);

		zetZichtbaarheid("visible");
		await vi.advanceTimersByTimeAsync(0);

		expect(tellingen(aanroepen).lijst).toBe(na.lijst + 1);
	});
});

describe("een sessie die tijdens het kijken verloopt", () => {
	it("draait een nieuwe ophaalronde als de sessie weg is", async () => {
		// Een 409 betekent dat de sessie met opgehaalde berichten niet meer bestaat. Alleen een
		// nieuwe ronde langs de organisaties vult hem opnieuw; blijven pollen levert niets op.
		const { aanroepen } = await startKeten([
			["/api/demo/personas", PERSONAS],
			["_ophalen", () => sseAntwoord()],
			["/api/v1/berichten?", lijstReeks(LEEG(), GEEN_SESSIE(), EEN_BERICHT())],
		]);
		const na = tellingen(aanroepen);

		await vi.advanceTimersByTimeAsync(15000);

		expect(tellingen(aanroepen).rondes).toBe(na.rondes + 1);
	});

	it("stopt met herstellen als de sessie meteen weer weg is", async () => {
		// Anders bevraagt een sessie die korter leeft dan het pollinterval bij elke tik alle
		// organisaties opnieuw. Elke ronde slaagt hier; het is de sessie die er telkens weer uit ligt
		// tegen de tijd dat de volgende tik komt.
		const { aanroepen } = await startKeten([
			["/api/demo/personas", PERSONAS],
			["_ophalen", () => sseAntwoord()],
			[
				"/api/v1/berichten?",
				// Om en om: elke ronde levert een lijst, elke tik daarna vindt de sessie weer weg.
				lijstReeks(LEEG(), GEEN_SESSIE(), LEEG(), GEEN_SESSIE(), LEEG(), GEEN_SESSIE()),
			],
		]);
		const na = tellingen(aanroepen);

		await vi.advanceTimersByTimeAsync(600000);

		expect(tellingen(aanroepen).rondes).toBe(na.rondes + 2);
		expect(window.BerichtenboxKeten.melding).not.toBe(null);
	});
});

describe("een hik in het netwerk", () => {
	it("meldt niets na één mislukte poging", async () => {
		// Eén mislukte poll is geen storing: de volgende tik komt zo. Meteen melden zou de bezoeker
		// een probleem tonen dat vanzelf overgaat.
		let beurt = 0;
		await startKeten(
			standaardRonde([
				[
					"/api/v1/berichten?",
					() => {
						beurt += 1;
						if (beurt === 1) return antwoord(200, { berichten: [] });
						throw new TypeError("Failed to fetch");
					},
				],
			])
		);

		await vi.advanceTimersByTimeAsync(15000);

		expect(window.BerichtenboxKeten.melding).toBe(null);
	});

	it("meldt het na drie mislukte pogingen op rij", async () => {
		let beurt = 0;
		await startKeten(
			standaardRonde([
				[
					"/api/v1/berichten?",
					() => {
						beurt += 1;
						if (beurt === 1) return antwoord(200, { berichten: [] });
						throw new TypeError("Failed to fetch");
					},
				],
			])
		);

		await vi.advanceTimersByTimeAsync(45000);

		expect(window.BerichtenboxKeten.melding).not.toBe(null);
		expect(window.BerichtenboxKeten.melding.soort).toBe("storing");
	});
});
