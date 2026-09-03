// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { antwoord, personasVoor, ruimKetenOp, sseAntwoord, startKeten } from "./keten-harnas.js";

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

/** De aanroepen die elke ophaalronde doet, met een verse stroom per ronde. */
function ronde(extra = []) {
	return [...extra, ["_ophalen", () => sseAntwoord()], ["/api/v1/berichten?", () => LEEG()]];
}

/** Antwoorden op de berichtenlijst, één per aanroep; het laatste blijft gelden. */
function lijstReeks(...antwoorden) {
	let beurt = 0;
	return () => antwoorden[Math.min(beurt++, antwoorden.length - 1)];
}

const LEEG = () => antwoord(200, { berichten: [] });
const EEN_BERICHT = () => antwoord(200, { berichten: [apiBericht("b-1")] });
const GEEN_SESSIE = () => antwoord(409, { title: "Conflict" });

/**
 * Elk exemplaar van het keten-script blijft in dit document bestaan, ook nadat de test klaar is: een
 * geparkeerd exemplaar wordt door een `pageshow` van een latere test weer wakker en gebruikt dan
 * dezelfde nagebootste fetch. Een eigen kvk-nummer per test maakt zichtbaar van wie een aanroep is.
 */
let bezoeker = 90000010;

async function startPollKeten(perAdres, pad) {
	bezoeker += 1;
	const kvkNummer = String(bezoeker);
	const gestart = await startKeten([["/api/demo/personas", personasVoor(kvkNummer)], ...perAdres], pad, kvkNummer);
	return { ...gestart, ontvanger: "KVK:" + kvkNummer };
}

/** Hoe vaak déze bezoeker de berichtenlijst opvroeg, en hoe vaak er een ophaalronde langs de bronnen ging. */
function tellingen(aanroepen, ontvanger) {
	const vanDeze = aanroepen.filter((aanroep) => !ontvanger || !aanroep.headers["X-Ontvanger"] || aanroep.headers["X-Ontvanger"] === ontvanger);
	return {
		lijst: vanDeze.filter((aanroep) => aanroep.pad.indexOf("/api/v1/berichten?") !== -1).length,
		rondes: vanDeze.filter((aanroep) => aanroep.pad.indexOf("_ophalen") !== -1).length,
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
		const { aanroepen, ontvanger } = await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG(), EEN_BERICHT())]]));
		const na = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(15000);

		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst + 1);
		expect(tellingen(aanroepen, ontvanger).rondes).toBe(na.rondes);
	});

	it("meldt de berichten die erbij gekomen zijn", async () => {
		await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG(), EEN_BERICHT())]]));
		const gemeld = [];
		window.BerichtenboxKeten.opWijziging((toestand) => gemeld.push(toestand.uitkomst));

		await vi.advanceTimersByTimeAsync(15000);

		const laatste = gemeld[gemeld.length - 1];
		expect(laatste.berichten.map((bericht) => bericht.id)).toEqual(["b-1"]);
	});

	it("meldt niets als de lijst niet veranderd is", async () => {
		await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(EEN_BERICHT())]]));
		const gemeld = [];
		window.BerichtenboxKeten.opWijziging((toestand) => gemeld.push(toestand.uitkomst));

		await vi.advanceTimersByTimeAsync(45000);

		expect(gemeld).toEqual([]);
	});
});

describe("het pollritme is in te stellen", () => {
	it("volgt het interval uit de URL", async () => {
		const { aanroepen, ontvanger } = await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG())]]), "/moza/berichtenbox/?poll=30");
		const na = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(15000);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst);

		await vi.advanceTimersByTimeAsync(15000);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst + 1);
	});

	it("volgt het interval uit localStorage", async () => {
		localStorage.setItem("setting:berichtenbox-poll", "30");
		const { aanroepen, ontvanger } = await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG())]]));
		const na = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(15000);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst);

		await vi.advanceTimersByTimeAsync(15000);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst + 1);
	});

	it("houdt een ondergrens aan, ook als er om een korter interval gevraagd wordt", async () => {
		// Elke seconde de lijst opvragen is voor de demonstratie geen winst en voor het stelsel wel
		// verkeer.
		const { aanroepen, ontvanger } = await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG())]]), "/moza/berichtenbox/?poll=1");
		const na = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(1000);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst);

		await vi.advanceTimersByTimeAsync(4000);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst + 1);
	});

	it("pollt niet als het uitgezet is", async () => {
		const { aanroepen, ontvanger } = await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG())]]), "/moza/berichtenbox/?poll=0");
		const na = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(600000);

		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst);
	});
});

describe("een tabblad dat niemand voor zich heeft", () => {
	it("pollt trager zolang het tabblad niet zichtbaar is", async () => {
		// Niet helemaal stoppen: de sessie bij het stelsel heeft een schuivende vervaltijd, en een
		// berichtenbox die openstaat hoort hem in stand te houden.
		const { aanroepen, ontvanger } = await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG())]]));
		zetZichtbaarheid("hidden");
		const na = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(15000);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst);

		await vi.advanceTimersByTimeAsync(45000);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst + 1);
	});

	it("haalt meteen op zodra het tabblad weer zichtbaar is", async () => {
		// Wie terugkomt hoort niet nog een interval te wachten op berichten die er al zijn.
		const { aanroepen, ontvanger } = await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG())]]));
		zetZichtbaarheid("hidden");
		await vi.advanceTimersByTimeAsync(5000);
		const na = tellingen(aanroepen, ontvanger);

		zetZichtbaarheid("visible");
		await vi.advanceTimersByTimeAsync(0);

		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst + 1);
	});
});

describe("een sessie die tijdens het kijken verloopt", () => {
	it("draait een nieuwe ophaalronde als de sessie weg is", async () => {
		// Een 409 betekent dat de sessie met opgehaalde berichten niet meer bestaat. Alleen een
		// nieuwe ronde langs de organisaties vult hem opnieuw; blijven pollen levert niets op.
		const { aanroepen, ontvanger } = await startPollKeten([
			["_ophalen", () => sseAntwoord()],
			["/api/v1/berichten?", lijstReeks(LEEG(), GEEN_SESSIE(), EEN_BERICHT())],
		]);
		const na = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(15000);

		expect(tellingen(aanroepen, ontvanger).rondes).toBe(na.rondes + 1);
	});

	it("meldt het stoppen als mededeling, niet als storing", async () => {
		// De lijst die er staat klopt nog; alleen het bijwerken is opgehouden. Een storing zou zeggen
		// dat er iets mis is met wat de bezoeker voor zich heeft.
		await startPollKeten([
			["_ophalen", () => sseAntwoord()],
			["/api/v1/berichten?", lijstReeks(LEEG(), GEEN_SESSIE(), LEEG(), GEEN_SESSIE(), LEEG(), GEEN_SESSIE())],
		]);

		await vi.advanceTimersByTimeAsync(600000);

		expect(window.BerichtenboxKeten.melding.soort).toBe("mededeling");
	});

	it("stopt met herstellen als de sessie meteen weer weg is", async () => {
		// Anders bevraagt een sessie die korter leeft dan het pollinterval bij elke tik alle
		// organisaties opnieuw. Elke ronde slaagt hier; het is de sessie die er telkens weer uit ligt
		// tegen de tijd dat de volgende tik komt.
		const { aanroepen, ontvanger } = await startPollKeten([
			["_ophalen", () => sseAntwoord()],
			[
				"/api/v1/berichten?",
				// Om en om: elke ronde levert een lijst, elke tik daarna vindt de sessie weer weg.
				lijstReeks(LEEG(), GEEN_SESSIE(), LEEG(), GEEN_SESSIE(), LEEG(), GEEN_SESSIE()),
			],
		]);
		const na = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(600000);

		expect(tellingen(aanroepen, ontvanger).rondes).toBe(na.rondes + 2);
		expect(window.BerichtenboxKeten.melding).not.toBe(null);
	});
});

describe("een hik in het netwerk", () => {
	it("meldt niets na één mislukte poging", async () => {
		// Eén mislukte poll is geen storing: de volgende tik komt zo. Meteen melden zou de bezoeker
		// een probleem tonen dat vanzelf overgaat.
		let beurt = 0;
		await startPollKeten(
			ronde([
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
		await startPollKeten(
			ronde([
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
		// Een mededeling en geen storing: de berichten die er staan kloppen nog, alleen het bijwerken
		// is opgehouden.
		expect(window.BerichtenboxKeten.melding.soort).toBe("mededeling");
	});
});

describe("een pagina die weggaat en terugkomt", () => {
	/** `pagehide` met `persisted`: de browser bewaart deze pagina in de bfcache. */
	function bewaardWeg() {
		const gebeurtenis = new Event("pagehide");
		Object.defineProperty(gebeurtenis, "persisted", { value: true });
		window.dispatchEvent(gebeurtenis);
	}

	it("pollt weer zodra de pagina uit de bfcache terugkomt", async () => {
		// Van de inbox naar een bericht en met de terugknop terug is de meest gelopen route in een
		// berichtenbox. Firefox en Safari geven dan hetzelfde document terug zonder het script
		// opnieuw te draaien: bleef het pollen dan uit, dan werkt die berichtenbox zich nooit meer bij.
		const { aanroepen, ontvanger } = await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG())]]));
		bewaardWeg();
		await vi.advanceTimersByTimeAsync(60000);
		const na = tellingen(aanroepen, ontvanger);

		window.dispatchEvent(new Event("pageshow"));
		await vi.advanceTimersByTimeAsync(0);

		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst + 1);
	});

	it("houdt zich stil als de pagina weg is terwijl er nog een tik onderweg is", async () => {
		// Anders staat er bij terugkomst een storingsmelding over een verzoek dat mislukte toen er
		// niemand meer keek.
		let losmaken;
		await startPollKeten(
			ronde([
				[
					"/api/v1/berichten?",
					(() => {
						let eerste = true;
						return () => {
							if (eerste) {
								eerste = false;
								return antwoord(200, { berichten: [] });
							}
							return new Promise((_, weiger) => {
								losmaken = () => weiger(new TypeError("Failed to fetch"));
							});
						};
					})(),
				],
			])
		);
		const gemeld = [];
		window.BerichtenboxKeten.opWijziging((toestand) => gemeld.push(toestand));

		await vi.advanceTimersByTimeAsync(15000);
		window.dispatchEvent(new Event("pagehide"));
		losmaken();
		await vi.advanceTimersByTimeAsync(60000);

		expect(window.BerichtenboxKeten.melding).toBe(null);
	});
});

describe("een antwoord dat te laat komt", () => {
	it("legt een verouderde lijst niet over een nieuwere heen", async () => {
		// De tik loopt nog terwijl een ophaalronde een nieuwere lijst aflevert. Zou het late antwoord
		// alsnog binnenkomen, dan verdwijnt het zojuist getoonde bericht weer van het scherm.
		let losmaken;
		let beurt = 0;
		await startPollKeten([
			["_ophalen", () => sseAntwoord()],
			[
				"/api/v1/berichten?",
				() => {
					beurt += 1;
					if (beurt === 1) return antwoord(200, { berichten: [] });
					// De tik blijft hangen tot de ronde klaar is.
					if (beurt === 2) {
						return new Promise((klaar) => {
							losmaken = () => klaar(antwoord(200, { berichten: [] }));
						});
					}
					return antwoord(200, { berichten: [apiBericht("b-1")] });
				},
			],
		]);
		const gemeld = [];
		window.BerichtenboxKeten.opWijziging((toestand) => gemeld.push(toestand.uitkomst));

		await vi.advanceTimersByTimeAsync(15000);
		window.BerichtenboxKeten.opnieuw();
		await vi.advanceTimersByTimeAsync(0);
		losmaken();
		await vi.advanceTimersByTimeAsync(0);

		const laatste = gemeld.filter(Boolean).pop();
		expect(laatste.berichten.map((bericht) => bericht.id)).toEqual(["b-1"]);
	});
});

describe("een antwoord in een vorm die we niet kennen", () => {
	it("meldt het na drie keer, in plaats van stil te blijven wachten", async () => {
		// Een lijst zonder `berichten`-array laat de bezoeker anders naar een bevroren berichtenbox
		// kijken die er compleet uitziet.
		await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG(), antwoord(200, { items: [] }))]]));

		await vi.advanceTimersByTimeAsync(45000);

		expect(window.BerichtenboxKeten.melding).not.toBe(null);
		expect(window.BerichtenboxKeten.melding.tekst).toContain("niet meer kijken of er nieuwe berichten zijn");
	});
});

describe("de naam van de organisatie", () => {
	/** Een ophaalronde die één organisatie bij naam noemt. */
	function sseMetNaam() {
		const stroom = new ReadableStream({
			start(regelaar) {
				const noem = { event: "magazijn-bevraging-voltooid", magazijnId: "00000001000000000000", naam: "Belastingdienst", status: "OK", aantalBerichten: 0 };
				const gereed = { event: "ophalen-gereed", totaalBerichten: 0, geslaagd: 1, mislukt: 0, totaalMagazijnen: 1 };
				regelaar.enqueue(new TextEncoder().encode("data:" + JSON.stringify(noem) + "\n\ndata:" + JSON.stringify(gereed) + "\n\n"));
				regelaar.close();
			},
		});
		return { ok: true, status: 200, body: stroom, headers: { get: () => "text/event-stream" } };
	}

	it("draagt de naam uit de ophaalronde over op een bericht dat later binnenkomt", async () => {
		// De berichtenlijst geeft per bericht alleen het nummer van de organisatie. Zonder de namen
		// van de ronde toont de rij twintig cijfers — en leest een schermlezer die voor.
		await startPollKeten([
			["_ophalen", () => sseMetNaam()],
			["/api/v1/berichten?", lijstReeks(LEEG(), EEN_BERICHT())],
		]);
		const gemeld = [];
		window.BerichtenboxKeten.opWijziging((toestand) => gemeld.push(toestand.uitkomst));

		await vi.advanceTimersByTimeAsync(15000);

		expect(gemeld.filter(Boolean).pop().berichten[0].afzender).toBe("Belastingdienst");
	});
});

describe("een tabblad dat pauzeert in plaats van trager pollen", () => {
	it("wacht met pollen tot het tabblad terug is", async () => {
		// `pollVerborgen=0` is een pauze en geen uitschakelaar: zichtbaar hoort het gewoon door te gaan.
		const { aanroepen, ontvanger } = await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG())]]), "/moza/berichtenbox/?pollVerborgen=0");
		zetZichtbaarheid("hidden");
		const na = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(600000);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst);

		zetZichtbaarheid("visible");
		await vi.advanceTimersByTimeAsync(0);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst + 1);
	});
});

describe("de pagina komt terug nadat de browser niets beloofde", () => {
	it("pollt weer als `pagehide` niets over bewaren zei", async () => {
		// Safari en iOS melden bij `pagehide` niet betrouwbaar dát de pagina bewaard wordt; `pageshow`
		// doet dat wél. Wie op het eerste afgaat, zet het pollen uit op pagina's die gewoon terugkomen.
		const { aanroepen, ontvanger } = await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG())]]));
		window.dispatchEvent(new Event("pagehide"));
		await vi.advanceTimersByTimeAsync(60000);
		const na = tellingen(aanroepen, ontvanger);

		const terug = new Event("pageshow");
		Object.defineProperty(terug, "persisted", { value: true });
		window.dispatchEvent(terug);
		await vi.advanceTimersByTimeAsync(0);

		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst + 1);
	});

	it("telt een tik die onderweg was toen de pagina wegging niet als storing", async () => {
		// Drie keer heen en weer met de terugknop op een gezonde verbinding zou anders het pollen
		// blijvend stilleggen: de browser breekt zo'n verzoek af, en dat is geen storing bij het stelsel.
		let losmaken;
		let beurt = 0;
		await startPollKeten(
			ronde([
				[
					"/api/v1/berichten?",
					() => {
						beurt += 1;
						if (beurt === 1) return antwoord(200, { berichten: [] });
						if (beurt === 2) {
							return new Promise((_, weiger) => {
								losmaken = () => weiger(new TypeError("Failed to fetch"));
							});
						}
						// Daarna hikt het netwerk nog twee keer. Telt de afgebroken tik van de weggelegde
						// pagina mee, dan zijn dat er drie en stopt het pollen met een melding.
						throw new TypeError("Failed to fetch");
					},
				],
			])
		);

		await vi.advanceTimersByTimeAsync(15000);
		window.dispatchEvent(new Event("pagehide"));

		const terug = new Event("pageshow");
		Object.defineProperty(terug, "persisted", { value: true });
		window.dispatchEvent(terug);
		// Pas nu breekt de browser het verzoek van de weggelegde pagina af. De pagina is dan alweer
		// terug, dus alleen een generatie-onderscheid houdt deze fout buiten de reeks.
		losmaken();
		// Twee zichtbare hikken. Met de afgebroken tik erbij zouden het er drie zijn, en dan stopt het.
		await vi.advanceTimersByTimeAsync(20000);

		expect(window.BerichtenboxKeten.melding).toBe(null);
	});
});

describe("terwijl er een herstelronde loopt", () => {
	it("vraagt een tabwissel niet alsnog om een tweede ophaalronde", async () => {
		// Twee rondes tegelijk voor één ontvanger antwoordt het stelsel met 409 "bezig", en dan gaat
		// deze pagina drie kwartier lang wachten op een ronde die zij zelf blokkeert.
		let rondes = 0;
		let losmaken;
		const { aanroepen, ontvanger } = await startPollKeten([
			[
				"_ophalen",
				() => {
					rondes += 1;
					// De eerste ronde is die van het laden; de tweede is het herstel en die blijft hangen.
					if (rondes === 1) return sseAntwoord();
					return new Promise((klaar) => {
						losmaken = () => klaar(sseAntwoord());
					});
				},
			],
			["/api/v1/berichten?", lijstReeks(LEEG(), GEEN_SESSIE(), GEEN_SESSIE(), LEEG())],
		]);

		await vi.advanceTimersByTimeAsync(15000);
		const na = tellingen(aanroepen, ontvanger);

		// Voorbij de ondergrens, zodat een tabwissel wél meteen zou willen ophalen.
		await vi.advanceTimersByTimeAsync(6000);
		zetZichtbaarheid("hidden");
		zetZichtbaarheid("visible");
		await vi.advanceTimersByTimeAsync(0);

		expect(tellingen(aanroepen, ontvanger).rondes).toBe(na.rondes);
		losmaken();
		await vi.advanceTimersByTimeAsync(0);
	});
});

describe("het pollen stilzetten van buitenaf", () => {
	it("houdt op zodra de render-laag zegt dat er niemand meekijkt", async () => {
		// Mislukt de eerste lading, dan slaat de render-laag het gedrag van de bron over: er is dan
		// geen luisteraar meer. Doorpollen kost verkeer en zet meldingen die niemand uitleest.
		const { aanroepen, ontvanger } = await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG())]]));

		window.BerichtenboxKeten.stopPollen();
		const na = tellingen(aanroepen, ontvanger);
		await vi.advanceTimersByTimeAsync(600000);

		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst);
	});
});

describe("een lijst met berichten die nergens heen kunnen", () => {
	it("meldt dat de lijst onvolledig is", async () => {
		// Een bericht zonder `berichtId` valt weg: geen sleutel, geen detailpagina. Stil weglaten
		// presenteert een kortere postbus als een volledige.
		await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG(), antwoord(200, { berichten: [apiBericht("b-1"), { onderwerp: "Zonder id" }] }))]]));

		await vi.advanceTimersByTimeAsync(15000);

		expect(window.BerichtenboxKeten.melding).not.toBe(null);
		expect(window.BerichtenboxKeten.melding.tekst).toContain("opgehaald");
	});
});

describe("de teksten bij het opgeven", () => {
	it("zegt bij een verlopen sessie iets anders dan bij mislukte pogingen", async () => {
		// Alleen bij de sessie klopt "dan halen wij ze opnieuw op": verversen draait dan een nieuwe
		// ophaalronde. Bij mislukte pogingen is dat een belofte die niemand waarmaakt.
		await startPollKeten([
			["_ophalen", () => sseAntwoord()],
			["/api/v1/berichten?", lijstReeks(LEEG(), GEEN_SESSIE(), LEEG(), GEEN_SESSIE(), LEEG(), GEEN_SESSIE())],
		]);

		await vi.advanceTimersByTimeAsync(600000);

		expect(window.BerichtenboxKeten.melding.tekst).toContain("niet meer vanzelf");
	});
});

describe("instellingen die geen ritme zijn", () => {
	it("leest een negatief getal als uit", async () => {
		const { aanroepen, ontvanger } = await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG())]]), "/moza/berichtenbox/?poll=-5");
		const na = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(600000);

		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst);
	});

	it("maakt van heen-en-weer schakelen geen reeks verzoeken", async () => {
		// De ondergrens staat er juist om dat te voorkomen; zonder rem levert elke tabwissel er één op.
		const { aanroepen, ontvanger } = await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG())]]));
		const na = tellingen(aanroepen, ontvanger);

		for (let keer = 0; keer < 5; keer += 1) {
			zetZichtbaarheid("hidden");
			zetZichtbaarheid("visible");
			await vi.advanceTimersByTimeAsync(0);
		}

		expect(tellingen(aanroepen, ontvanger).lijst).toBeLessThanOrEqual(na.lijst + 1);
	});
});

describe("een lijst die de bron niet kon tonen", () => {
	it("wordt bij de volgende tik opnieuw aangeboden", async () => {
		// Het transport meldt een ongewijzigde lijst niet nog een keer. Kon de bron haar niet tonen,
		// dan moet die stilte doorbroken worden — anders komt dat bericht pas terug als er toevallig
		// iets anders binnenkomt.
		await startPollKeten(ronde([["/api/v1/berichten?", lijstReeks(LEEG(), EEN_BERICHT())]]));
		// Op identiteit tellen: elke melding van de keten — ook die over de verwerkingsfout — geeft
		// dezelfde uitkomst opnieuw door. Alleen een nieuw aanbod is een nieuw object.
		const aangeboden = new Set();
		window.BerichtenboxKeten.opWijziging((toestand) => {
			if (toestand.uitkomst && toestand.uitkomst.berichten.length === 1) aangeboden.add(toestand.uitkomst);
		});

		await vi.advanceTimersByTimeAsync(15000);
		window.BerichtenboxKeten.meldVerwerkingsfout();
		await vi.advanceTimersByTimeAsync(15000);

		expect(aangeboden.size).toBe(2);
	});
});
