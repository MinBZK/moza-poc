// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bericht, bouwPagina, laadBerichtenbox, laatLaden, rijen } from "./dom.js";

/**
 * De keten op het scherm: echte berichten, en echte voortgang.
 *
 * De dataset-bron bootst een ophaalronde na met verzonnen aankomsttijden. Draait het Federatief
 * Berichtenstelsel, dan zijn er echte getallen — hoeveel organisaties bevraagd zijn, hoeveel er
 * antwoordden, hoeveel berichten dat opleverde. Een nagebootste balk boven echte berichten is
 * dezelfde soort onwaarheid als een vooraf gerenderde lijst.
 */

const UIT_DE_KETEN = [
	{ id: "fbs-1", magazijnId: "kvk", afzender: "KVK", onderwerp: "Uittreksel", datum: "2026-04-01", isOngelezen: true, map: null, inhoud: "", uitKeten: true },
	{ id: "fbs-2", magazijnId: "rdw", afzender: "RDW", onderwerp: "Kenteken", datum: "2026-03-02", isOngelezen: false, map: null, inhoud: "", uitKeten: true },
];

/** Een dubbel voor berichtenbox-keten.js, met de knoppen die de bron indrukt. */
function zetKeten({ bezig = true, aangesloten = true, uitkomst, voortgang = null } = {}) {
	const kijkers = [];
	let losmaken;
	const wachten = new Promise((klaar) => { losmaken = klaar; });

	window.BerichtenboxKeten = {
		bezig,
		aangesloten,
		melding: null,
		voortgang,
		berichten: () => (uitkomst === undefined ? wachten : Promise.resolve(uitkomst)),
		opWijziging: (kijker) => kijkers.push(kijker),
		meldVerwerkingsfout: vi.fn(),
	};

	return {
		meldVoortgang(v) {
			window.BerichtenboxKeten.voortgang = v;
			kijkers.forEach((k) => k({ melding: null, voortgang: v, uitkomst: null }));
		},
		klaar(u) { losmaken(u); },
	};
}

const blok = () => document.querySelector("[data-berichtenbox-progress]");
const slot = (naam) => document.querySelector("[data-berichtenbox-progress-" + naam + "]").textContent;
const lijst = () => document.querySelector("[data-berichtenbox-list]");

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	delete window.BerichtenboxKeten;
	vi.restoreAllMocks();
});

describe("zolang de bron nog niets weet", () => {
	it("toont geen balk op nul boven een lege pagina", async () => {
		// De ronde begint met een vraag aan de demo-console: kent de keten deze persona? Zolang die
		// niet beantwoord is, valt er niets te melden. Een balk op "0 van 14 bronnen" is dan geen
		// voortgang maar een bewering over bronnen die nooit bevraagd zijn — en staat er geen
		// backend, dan staat hij daar seconden.
		bouwPagina([bericht(), bericht()]);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		zetKeten({}); // de ronde lost nooit op

		await laadBerichtenbox();
		await laatLaden();

		expect(blok().hidden).toBe(true);
	});

	it("houdt de lijst wel weg, zodat de koppen niet even verschijnen", async () => {
		bouwPagina([bericht(), bericht()]);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		zetKeten({});

		await laadBerichtenbox();
		await laatLaden();

		expect(lijst().hidden).toBe(true);
	});

	it("laat de balk verschijnen zodra er wél een getal is", async () => {
		bouwPagina([bericht(), bericht()]);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		const keten = zetKeten({});

		await laadBerichtenbox();
		expect(blok().hidden).toBe(true);

		keten.meldVoortgang({ bevraagd: 3, klaar: 1, gevonden: 4 });
		expect(blok().hidden).toBe(false);
	});
});

describe("echte voortgang van de ophaalronde", () => {
	it("zet de getallen van het stelsel in de balk, niet die van de nabootsing", async () => {
		bouwPagina([bericht(), bericht(), bericht()]);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		const keten = zetKeten({});

		await laadBerichtenbox();
		keten.meldVoortgang({ bevraagd: 7, klaar: 3, gevonden: 12 });

		expect(slot("total")).toBe("7");
		expect(slot("source")).toBe("3");
		expect(slot("found")).toBe("12");
		expect(blok().hidden).toBe(false);
		expect(lijst().hidden).toBe(true);
	});

	it("volgt de ronde terwijl die loopt, dus vóór de bron gekozen is", async () => {
		// geldtVoor wacht de ronde af. Zou de render-laag zich pas ná de keuze abonneren, dan was de
		// voortgang allang voorbij en bleef de balk op nul staan.
		bouwPagina([bericht()]);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		const keten = zetKeten({});

		await laadBerichtenbox();
		keten.meldVoortgang({ bevraagd: 4, klaar: 1, gevonden: 2 });
		expect(slot("source")).toBe("1");

		keten.meldVoortgang({ bevraagd: 4, klaar: 4, gevonden: 9 });
		expect(slot("source")).toBe("4");
		expect(slot("found")).toBe("9");
	});

	it("houdt de meervoudsvormen bij", async () => {
		bouwPagina([bericht()]);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		const keten = zetKeten({});

		await laadBerichtenbox();
		keten.meldVoortgang({ bevraagd: 1, klaar: 1, gevonden: 1 });

		const meervoud = document.querySelector('[data-meervoud="data-berichtenbox-progress-total"]');
		expect(meervoud.textContent).toBe("bron");
	});
});

describe("de keten levert de lijst", () => {
	it("toont de berichten van het stelsel, niet die van de dataset", async () => {
		bouwPagina([bericht({ id: "msg-uit-dataset", onderwerp: "Verzonnen" })]);
		zetKeten({ uitkomst: { berichten: UIT_DE_KETEN, magazijnen: [{ id: "kvk", naam: "KVK" }, { id: "rdw", naam: "RDW" }] } });

		await laadBerichtenbox();
		await laatLaden();

		expect(rijen()).toHaveLength(2);
		expect(rijen()[0].textContent).toContain("Uittreksel");
		expect(document.querySelector("tbody").textContent).not.toContain("Verzonnen");
	});

	it("linkt naar de client-gevulde pagina, want gegenereerde detailpagina's zijn er niet", async () => {
		bouwPagina([bericht()]);
		zetKeten({ uitkomst: { berichten: UIT_DE_KETEN, magazijnen: [{ id: "kvk", naam: "KVK" }, { id: "rdw", naam: "RDW" }] } });

		await laadBerichtenbox();
		await laatLaden();

		const link = rijen()[0].querySelector("a");
		expect(link.getAttribute("href")).toContain("bericht-demo/?id=fbs-1");
	});

	it("speelt de nagebootste ophaalanimatie niet af", async () => {
		// Verzonnen aankomsttijden boven echte berichten: niet van echt te onderscheiden.
		bouwPagina([bericht(), bericht(), bericht()]);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		zetKeten({ uitkomst: { berichten: UIT_DE_KETEN, magazijnen: [{ id: "kvk", naam: "KVK" }, { id: "rdw", naam: "RDW" }] } });

		await laadBerichtenbox();
		await laatLaden();

		expect(blok().hidden).toBe(true);
		expect(lijst().hidden).toBe(false);
		expect(rijen()).toHaveLength(2);
	});
});
