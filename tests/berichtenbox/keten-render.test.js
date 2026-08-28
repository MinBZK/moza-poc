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
	const wachten = new Promise((klaar) => {
		losmaken = klaar;
	});

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
		klaar(u) {
			losmaken(u);
		},
	};
}

const blok = () => document.querySelector("[data-berichtenbox-progress]");

/** De balk komt pas als de ronde langer duurt dan de drempel; korter en niemand ziet iets. */
const naDrempel = () => new Promise((r) => setTimeout(r, 400));
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
		await naDrempel();
		expect(blok().hidden).toBe(false);
	});
});

describe("een ronde die meteen klaar is", () => {
	it("laat de balk helemaal niet zien", async () => {
		// Lokaal duurt een ophaalronde een tiende seconde. Die even laten oplichten leest als een
		// storing, niet als voortgang.
		// Tweede bezoek: geen vroege verberging van de lijst, dus wat hier gebeurt komt alleen van
		// de voortgang.
		bouwPagina([bericht(), bericht()]);
		const keten = zetKeten({});

		await laadBerichtenbox();
		keten.meldVoortgang({ bevraagd: 2, klaar: 0, gevonden: 0 });
		keten.meldVoortgang(null); // klaar, ruim binnen de drempel
		await naDrempel();

		expect(blok().hidden).toBe(true);
		expect(lijst().hidden).toBe(false);
	});
});

describe("echte voortgang van de ophaalronde", () => {
	it("zet de getallen van het stelsel in de balk, niet die van de nabootsing", async () => {
		bouwPagina([bericht(), bericht(), bericht()]);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		const keten = zetKeten({});

		await laadBerichtenbox();
		keten.meldVoortgang({ bevraagd: 7, klaar: 3, gevonden: 12 });
		await naDrempel();

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
		await naDrempel();
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
		await naDrempel();

		const meervoud = document.querySelector('[data-meervoud="data-berichtenbox-progress-total"]');
		expect(meervoud.textContent).toBe("bron");
	});
});

describe("een bron die geen einde meldt", () => {
	const storing = () => {
		const el = document.querySelector("[data-berichtenbox-storing]");
		return el && !el.hidden ? el.textContent.replace(/\s+/g, " ").trim() : null;
	};

	it("geeft de lijst na de wachthond terug en zegt waarom", async () => {
		// Zonder wachthond kijkt de bezoeker naar kolomkoppen en een bevroren balk, zonder een woord
		// erbij en zonder weg terug.
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		bouwPagina([bericht(), bericht()]);
		const keten = zetKeten({});

		await laadBerichtenbox();
		keten.meldVoortgang({ bevraagd: 3, klaar: 1, gevonden: 4 });
		await vi.advanceTimersByTimeAsync(400);
		expect(lijst().hidden).toBe(true);

		await vi.advanceTimersByTimeAsync(46000);

		expect(lijst().hidden).toBe(false);
		expect(blok().hidden).toBe(true);
		expect(storing()).toContain("duurde te lang");
		vi.useRealTimers();
	}, 20000);

	it("trekt die melding in als de ronde alsnog afrondt", async () => {
		// Een tabblad op de achtergrond zet requestAnimationFrame stil; de wachthond gaat dan af
		// terwijl er niets mis is. "Ververs de pagina" hoort niet boven een complete lijst te blijven.
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		bouwPagina([bericht(), bericht()]);
		const keten = zetKeten({});

		await laadBerichtenbox();
		keten.meldVoortgang({ bevraagd: 3, klaar: 1, gevonden: 4 });
		await vi.advanceTimersByTimeAsync(46000);
		expect(storing()).toContain("duurde te lang");

		keten.meldVoortgang(null);
		await vi.advanceTimersByTimeAsync(10);

		expect(storing()).toBe(null);
		expect(lijst().hidden).toBe(false);
		vi.useRealTimers();
	}, 20000);

	it("verbergt de lijst niet opnieuw als die bron daarna nog telt", async () => {
		// Zonder vergrendeling zet een late melding de lijst weer weg, 300 ms na de wachthond, en
		// begint de telling van voren af aan. Het scherm gaat dan heen en weer.
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		bouwPagina([bericht(), bericht()]);
		const keten = zetKeten({});

		await laadBerichtenbox();
		keten.meldVoortgang({ bevraagd: 3, klaar: 1, gevonden: 4 });
		await vi.advanceTimersByTimeAsync(46000);
		expect(lijst().hidden).toBe(false);

		keten.meldVoortgang({ bevraagd: 3, klaar: 2, gevonden: 6 });
		await vi.advanceTimersByTimeAsync(1000);

		expect(lijst().hidden).toBe(false);
		vi.useRealTimers();
	}, 20000);
});

describe("meerdere partijen, één meldingsblok", () => {
	const melding = () => {
		const el = document.querySelector("[data-berichtenbox-storing]");
		return el && !el.hidden ? el.textContent.replace(/\s+/g, " ").trim() : null;
	};

	it("laat de melding van een ander weer zien zodra de wachthond de zijne intrekt", async () => {
		// Twee partijen claimen hetzelfde blok. Zolang tonen ook eigendom overdroeg, wiste de
		// wachthond bij het intrekken de melding van de ander — en wist de bezoeker niet meer dat
		// zijn actie mislukt was.
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		bouwPagina([bericht(), bericht()]);
		const keten = zetKeten({});
		await laadBerichtenbox();

		window.Berichtenbox.meld("Uw wijziging is niet bewaard.", "storing", "opslag");
		expect(melding()).toContain("niet bewaard");

		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		keten.meldVoortgang({ bevraagd: 3, klaar: 1, gevonden: 4 });
		await vi.advanceTimersByTimeAsync(46000);
		expect(melding()).toContain("duurde te lang");

		// De ronde rondt alsnog af; de wachthond trekt zijn eigen melding in.
		keten.meldVoortgang(null);
		await vi.advanceTimersByTimeAsync(10);

		// En dan hoort de melding van de opslag er weer te staan: die is nog steeds waar.
		expect(melding()).toContain("niet bewaard");
		vi.useRealTimers();
	}, 20000);

	it("laat het blok pas verdwijnen als niemand meer iets te melden heeft", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		bouwPagina([bericht(), bericht()]);
		const keten = zetKeten({});
		await laadBerichtenbox();

		keten.meldVoortgang({ bevraagd: 3, klaar: 1, gevonden: 4 });
		await vi.advanceTimersByTimeAsync(46000);
		expect(melding()).toContain("duurde te lang");

		keten.meldVoortgang(null);
		await vi.advanceTimersByTimeAsync(10);

		expect(melding()).toBe(null);
		vi.useRealTimers();
	}, 20000);
});

describe("de keten levert de lijst", () => {
	it("toont de berichten van het stelsel, niet die van de dataset", async () => {
		bouwPagina([bericht({ id: "msg-uit-dataset", onderwerp: "Verzonnen" })]);
		zetKeten({
			uitkomst: {
				berichten: UIT_DE_KETEN,
				magazijnen: [
					{ id: "kvk", naam: "KVK" },
					{ id: "rdw", naam: "RDW" },
				],
			},
		});

		await laadBerichtenbox();
		await laatLaden();

		expect(rijen()).toHaveLength(2);
		expect(rijen()[0].textContent).toContain("Uittreksel");
		expect(document.querySelector("tbody").textContent).not.toContain("Verzonnen");
	});

	it("linkt naar de client-gevulde pagina, want gegenereerde detailpagina's zijn er niet", async () => {
		bouwPagina([bericht()]);
		zetKeten({
			uitkomst: {
				berichten: UIT_DE_KETEN,
				magazijnen: [
					{ id: "kvk", naam: "KVK" },
					{ id: "rdw", naam: "RDW" },
				],
			},
		});

		await laadBerichtenbox();
		await laatLaden();

		const link = rijen()[0].querySelector("a");
		expect(link.getAttribute("href")).toContain("bericht-demo/?id=fbs-1");
	});

	it("speelt de nagebootste ophaalanimatie niet af", async () => {
		// Verzonnen aankomsttijden boven echte berichten: niet van echt te onderscheiden.
		bouwPagina([bericht(), bericht(), bericht()]);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		zetKeten({
			uitkomst: {
				berichten: UIT_DE_KETEN,
				magazijnen: [
					{ id: "kvk", naam: "KVK" },
					{ id: "rdw", naam: "RDW" },
				],
			},
		});

		await laadBerichtenbox();
		await laatLaden();

		expect(blok().hidden).toBe(true);
		expect(lijst().hidden).toBe(false);
		expect(rijen()).toHaveLength(2);
	});
});
