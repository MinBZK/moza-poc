// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { antwoord, PERSONAS, rondeMetLijst, startKeten, ruimKetenOp } from "./keten-harnas.js";

/**
 * De berichtenlijst komt per pagina van honderd; wie meer post heeft, heeft meer pagina's.
 *
 * Het stelsel kapt een grotere `paginaGrootte` af op honderd, dus meer in één keer vragen bestaat
 * niet. Eerder vroeg de client om tweehonderd en toonde hij er honderd zonder dat iemand dat merkte:
 * de mededeling "er worden maximaal ... getoond" ging over een grens die zo nooit geraakt werd. Een
 * demonstratie hoort de hele berichtenbox te tonen, dus blijft de client bladeren zolang het
 * antwoord een volgende pagina noemt.
 *
 * Let op: die afkap op honderd is een eigenschap van het stelsel, gemeten tegen de test-omgeving.
 * Deze tests kunnen hem niet aantonen — het harnas antwoordt wat het meekrijgt, en de client vraagt
 * nooit meer dan honderd. Een groene suite bewijst dat dus niet.
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
		afzenderNaam: "Belastingdienst",
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

/** De ronde met een eigen berichtenlijst; `gevonden` is wat de ophaalronde zelf telde. */
function ronde(lijst, gevonden = 0) {
	return [["/api/demo/personas", PERSONAS], ...rondeMetLijst(lijst, gevonden)];
}

/** De adressen waarmee de lijst opgevraagd werd, op volgorde. */
function lijstAanroepen(aanroepen) {
	return aanroepen.filter((a) => a.pad.indexOf("/api/v1/berichten?") === 0).map((a) => a.pad);
}

/**
 * Hetzelfde, zonder de eerste aanroep.
 *
 * Elke ronde begint met een vraag aan het stelsel: staat de lijst van een andere berichtenbox-pagina
 * er al? Hier niet — die aanroep krijgt een 409 en dan draait de ronde alsnog. Het bladeren begint
 * daarna, en daar gaan deze tests over.
 */
function bladeraanroepen(aanroepen) {
	return lijstAanroepen(aanroepen).slice(1);
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
		expect(bladeraanroepen(aanroepen)).toEqual(["/api/v1/berichten?pagina=0&paginaGrootte=100", "/api/v1/berichten?pagina=1&paginaGrootte=100", "/api/v1/berichten?pagina=2&paginaGrootte=100"]);
	});

	it("vraagt één pagina op wanneer dat de hele lijst is", async () => {
		const { aanroepen } = await startKeten(ronde(lijstVan([berichtenVan(0, 20)])));

		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.berichten).toHaveLength(20);
		expect(bladeraanroepen(aanroepen)).toEqual(["/api/v1/berichten?pagina=0&paginaGrootte=100"]);
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
		expect(bladeraanroepen(aanroepen)).toHaveLength(2);
	});

	it("houdt op bij de bovengrens en zegt dat er meer kan zijn", async () => {
		// Een stelsel dat blijft doorwijzen mag deze pagina niet eindeloos laten ophalen. Wat er dan
		// staat klopt nog, maar het is niet alles — en dat hoort de bezoeker te lezen. Eén bericht per
		// pagina: het gaat hier om de grens aan het aantal pagina's, niet om wat erin zit.
		const blijftWijzen = (pad) => antwoord(200, { berichten: berichtenVan(paginaVan(pad), 1), _links: volgende(paginaVan(pad)) });
		const { aanroepen } = await startKeten(ronde(blijftWijzen));

		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(bladeraanroepen(aanroepen)).toHaveLength(100);
		expect(uitkomst.berichten).toHaveLength(100);
		// Het aantal dat er staat, niet de bovengrens van de client: die zou hier honderd keer te
		// hoog zijn en de bezoeker een getal laten lezen dat nergens op het scherm terugkomt.
		expect(window.BerichtenboxKeten.melding).toEqual({
			soort: "mededeling",
			tekst: "Er worden 100 berichten getoond. Mogelijk heeft u er meer dan hier staan.",
		});
	});

	it("stopt bij een `next` in een vorm die we niet kennen, en zegt dat in de console", async () => {
		// Een kale string in plaats van `{ href }` is geen "er is meer" die wij kunnen volgen. Stoppen
		// mag, maar dan moet er wel ergens staan dat de lijst daar ophield.
		const vreemdeVorm = (pad) => antwoord(200, { berichten: berichtenVan(paginaVan(pad), 100), _links: { next: "/api/v1/berichten?pagina=1" } });
		const { aanroepen } = await startKeten(ronde(vreemdeVorm));

		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.berichten).toHaveLength(100);
		expect(bladeraanroepen(aanroepen)).toHaveLength(1);
		expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("onbekende vorm"), expect.anything());
	});
});

describe("berichtenbox-keten.js — als het bladeren halverwege misgaat", () => {
	it("laat de halve lijst vallen als een pagina niet binnenkomt", async () => {
		// De pagina's die er al waren mogen niet als volledige berichtenbox op het scherm komen: aan
		// een lijst is niet te zien dat er een derde van mist.
		const stuktOpTwee = (pad) => (paginaVan(pad) === 2 ? antwoord(500, {}) : antwoord(200, { berichten: berichtenVan(paginaVan(pad), 100), _links: volgende(paginaVan(pad)) }));
		await startKeten(ronde(stuktOpTwee));

		expect(await window.BerichtenboxKeten.berichten()).toBe(null);
	});

	it("zegt daarbij niets over de bronnen, want die hebben geleverd", async () => {
		// De ophaalronde was klaar en twee pagina's kwamen gewoon binnen. "De bronnen reageren niet
		// meer" zou hier een onwaar verhaal vertellen over organisaties die niets misdeden.
		const stuktOpTwee = (pad) => (paginaVan(pad) === 2 ? antwoord(500, {}) : antwoord(200, { berichten: berichtenVan(paginaVan(pad), 100), _links: volgende(paginaVan(pad)) }));
		await startKeten(ronde(stuktOpTwee));
		await window.BerichtenboxKeten.berichten();

		expect(window.BerichtenboxKeten.melding).toEqual({
			soort: "storing",
			tekst: "Wij konden uw berichtenlijst niet helemaal ophalen. Ververs de pagina om het opnieuw te proberen.",
		});
	});

	it("houdt op de eerste pagina de gewone storingstekst", async () => {
		// Daar is er nog niets opgehaald, dus dan gáát het wél over het ophalen bij de bronnen.
		await startKeten(ronde(() => antwoord(500, {})));
		await window.BerichtenboxKeten.berichten();

		expect(window.BerichtenboxKeten.melding).toEqual({
			soort: "storing",
			tekst: "Er gaat iets mis met het ophalen van uw berichten bij de bronnen. Ververs de pagina om het opnieuw te proberen.",
		});
	});

	it("houdt een verlopen sessie halverwege een verlopen sessie", async () => {
		// De 409 blijft `geenSessie`, want daar hangt het herstel aan vast: opnieuw ophalen zet de
		// sessie terug. Zou die reden hier verdwijnen, dan verdwijnt ook de weg terug.
		const sessieWegOpTwee = (pad) => (paginaVan(pad) === 2 ? antwoord(409, {}) : antwoord(200, { berichten: berichtenVan(paginaVan(pad), 100), _links: volgende(paginaVan(pad)) }));
		await startKeten(ronde(sessieWegOpTwee));
		await window.BerichtenboxKeten.berichten();

		expect(window.BerichtenboxKeten.melding).toEqual({
			soort: "storing",
			tekst: "Uw berichten zijn niet meer klaargezet bij het stelsel. Ververs de pagina; dan halen wij ze opnieuw op.",
		});
	});

	it("behandelt een pagina zonder berichten-array als fout, niet als einde", async () => {
		// Als einde behandelen gaf twee pagina's met `afgekapt: false`: een halve postbus die zich
		// voordoet als een hele, met alleen een regel in de console.
		const zonderArray = (pad) => (paginaVan(pad) === 2 ? antwoord(200, { _links: volgende(2) }) : antwoord(200, { berichten: berichtenVan(paginaVan(pad), 100), _links: volgende(paginaVan(pad)) }));
		await startKeten(ronde(zonderArray));

		expect(await window.BerichtenboxKeten.berichten()).toBe(null);
		expect(window.BerichtenboxKeten.melding).toEqual({
			soort: "storing",
			tekst: "Wij konden uw berichtenlijst niet goed lezen. Ververs de pagina om het opnieuw te proberen.",
		});
	});

	it("houdt op als de hele reeks te lang duurt", async () => {
		// Elke pagina heeft een eigen tijdslimiet, maar honderd trage pagina's zouden samen drie
		// kwartier duren. De klok schuift hier per aanroep een halve minuut op.
		let klok = 1_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => {
			klok += 30_000;
			return klok;
		});
		const altijdMeer = (pad) => antwoord(200, { berichten: berichtenVan(paginaVan(pad), 100), _links: volgende(paginaVan(pad)) });
		const { aanroepen } = await startKeten(ronde(altijdMeer));

		expect(await window.BerichtenboxKeten.berichten()).toBe(null);
		expect(bladeraanroepen(aanroepen).length).toBeLessThan(10);
		expect(window.BerichtenboxKeten.melding).toEqual({
			soort: "storing",
			tekst: "Wij konden uw berichtenlijst niet helemaal ophalen. Ververs de pagina om het opnieuw te proberen.",
		});
	});
});

describe("berichtenbox-keten.js — berichten die op twee pagina's staan", () => {
	it("levert ze één keer", async () => {
		// De sessie kan groeien terwijl wij bladeren: dan schuift een bericht over de paginagrens en
		// zien we het twee keer. Dubbel doorgeven telt het mee in de ongelezen-teller.
		const overlappend = (pad) => {
			const nummer = paginaVan(pad);
			return antwoord(200, { berichten: nummer === 0 ? berichtenVan(0, 100) : berichtenVan(0, 20).concat(berichtenVan(1, 30)), _links: nummer === 0 ? volgende(0) : {} });
		};
		await startKeten(ronde(overlappend));

		const uitkomst = await window.BerichtenboxKeten.berichten();

		expect(uitkomst.berichten).toHaveLength(130);
		expect(new Set(uitkomst.berichten.map((b) => b.id)).size).toBe(130);
		expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("op twee pagina's"));
	});
});

describe("berichtenbox-keten.js — de vergelijking met wat de ronde telde", () => {
	it("meldt niets als alle getelde berichten ook opgehaald zijn", async () => {
		// De regressie die deze wijziging opheft: de ronde telde er 220, de client haalde er 100 op en
		// zei "er zijn er 100 opgehaald van 220". Nu klopt de lijst en hoort die melding weg te zijn.
		await startKeten(ronde(lijstVan([berichtenVan(0, 100), berichtenVan(1, 100), berichtenVan(2, 20)]), 220));
		await window.BerichtenboxKeten.berichten();

		expect(window.BerichtenboxKeten.melding).toBe(null);
	});

	it("meldt het nog steeds als er wél berichten missen", async () => {
		await startKeten(ronde(lijstVan([berichtenVan(0, 100)]), 220));
		await window.BerichtenboxKeten.berichten();

		expect(window.BerichtenboxKeten.melding).toEqual({
			soort: "mededeling",
			tekst: "De bronnen vonden 220 berichten, maar er zijn er 100 opgehaald. Ververs de pagina om de rest op te halen.",
		});
	});
});
