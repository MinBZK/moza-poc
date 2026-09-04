// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { antwoord, sseAntwoord, PERSONAS, startKeten, ruimKetenOp } from "./keten-harnas.js";

/**
 * De berichtenlijst komt per pagina van honderd; wie meer post heeft, heeft meer pagina's.
 *
 * Het stelsel kapt een grotere `paginaGrootte` af op honderd, dus meer in één keer vragen bestaat
 * niet. Eerder vroeg de client om tweehonderd en toonde hij er honderd zonder dat iemand dat merkte:
 * de mededeling "er worden maximaal ... getoond" ging over een grens die zo nooit geraakt werd. Een
 * demonstratie hoort de hele berichtenbox te tonen, dus blijft de client bladeren zolang het
 * antwoord een volgende pagina noemt.
 */

/** Het opgevraagde paginanummer uit een adres. */
function paginaVan(pad) {
	return Number(new URLSearchParams(pad.slice(pad.indexOf("?"))).get("pagina"));
}

/** Eén pagina berichten, met herkenbare id's zodat een test kan tellen wat er samengevoegd is. */
function berichtenVan(paginanummer, aantal) {
	return Array.from({ length: aantal }, (_, i) => ({
		berichtId: "p" + paginanummer + "-b" + i,
		onderwerp: "Bericht",
		publicatietijdstip: "2026-09-03T11:19:38.351205Z",
		magazijnId: "00000009000000000006",
		afzender: "00000009000000000006",
	}));
}

/** Verwijst naar de pagina hierna, zoals het stelsel dat doet. */
function volgende(nummer) {
	return { next: { href: "/api/v1/berichten?pagina=" + (nummer + 1) + "&paginaGrootte=100" } };
}

/** Antwoordt per opgevraagde pagina uit een vaste rij; de laatste pagina noemt geen `next`. */
function lijstVan(paginas) {
	return (pad) => {
		const nummer = paginaVan(pad);
		const laatste = nummer >= paginas.length - 1;
		return antwoord(200, { berichten: paginas[nummer] || [], _links: laatste ? {} : volgende(nummer) });
	};
}

/** De ronde met een eigen berichtenlijst. */
function ronde(lijst) {
	return [
		["/api/demo/personas", PERSONAS],
		["_ophalen", sseAntwoord()],
		["/api/v1/berichten?", lijst],
	];
}

/** De adressen waarmee de lijst opgevraagd werd, op volgorde. */
function lijstAanroepen(aanroepen) {
	return aanroepen.filter((a) => a.pad.indexOf("/api/v1/berichten?") === 0).map((a) => a.pad);
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	ruimKetenOp();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("berichtenbox-keten.js — de berichtenlijst per pagina", () => {
	it("bladert door zolang het stelsel een volgende pagina noemt", async () => {
		const { aanroepen } = await startKeten(ronde(lijstVan([berichtenVan(0, 100), berichtenVan(1, 100), berichtenVan(2, 20)])));

		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.berichten).toHaveLength(220);
		expect(lijstAanroepen(aanroepen)).toEqual([
			"/api/v1/berichten?pagina=0&paginaGrootte=100",
			"/api/v1/berichten?pagina=1&paginaGrootte=100",
			"/api/v1/berichten?pagina=2&paginaGrootte=100",
		]);
	});

	it("vraagt één pagina op wanneer dat de hele lijst is", async () => {
		const { aanroepen } = await startKeten(ronde(lijstVan([berichtenVan(0, 20)])));

		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.berichten).toHaveLength(20);
		expect(lijstAanroepen(aanroepen)).toEqual(["/api/v1/berichten?pagina=0&paginaGrootte=100"]);
	});

	it("meldt niets over een maximum zolang de lijst compleet is", async () => {
		await startKeten(ronde(lijstVan([berichtenVan(0, 100), berichtenVan(1, 100)])));
		await window.BerichtenboxKeten.berichten();

		expect(window.BerichtenboxKeten.melding).toBe(null);
	});

	it("stopt bij een lege pagina, ook als daar nog een volgende naast staat", async () => {
		// Zonder die stop zou een `next` boven een lege pagina honderd keer opgevraagd worden.
		const legeVervolgen = (pad) => antwoord(200, { berichten: paginaVan(pad) === 0 ? berichtenVan(0, 100) : [], _links: volgende(paginaVan(pad)) });
		const { aanroepen } = await startKeten(ronde(legeVervolgen));

		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.berichten).toHaveLength(100);
		expect(lijstAanroepen(aanroepen)).toHaveLength(2);
	});

	it("houdt op bij de bovengrens en zegt dat er meer kan zijn", async () => {
		// Een stelsel dat blijft doorwijzen mag deze pagina niet eindeloos laten ophalen. Wat er dan
		// staat klopt nog, maar het is niet alles — en dat hoort de bezoeker te lezen. Eén bericht per
		// pagina: het gaat hier om de grens aan het aantal pagina's, niet om wat erin zit.
		const blijftWijzen = (pad) => antwoord(200, { berichten: berichtenVan(paginaVan(pad), 1), _links: volgende(paginaVan(pad)) });
		const { aanroepen } = await startKeten(ronde(blijftWijzen));

		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(lijstAanroepen(aanroepen)).toHaveLength(100);
		expect(uitkomst.berichten).toHaveLength(100);
		expect(window.BerichtenboxKeten.melding).toEqual({
			soort: "mededeling",
			tekst: "Er worden maximaal 10000 berichten getoond. Mogelijk heeft u meer berichten dan hier staan.",
		});
	});
});
