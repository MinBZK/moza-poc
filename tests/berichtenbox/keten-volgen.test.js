// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { antwoord, personasVoor, ruimKetenOp, sseAntwoord, startKeten } from "./keten-harnas.js";
import { ketenBron } from "../../assets/javascript/berichtenbox/keten-bron.js";

/**
 * Het volgen van `berichtenbox-keten.js`: een verbinding waarop het stelsel zelf meldt dat er een
 * bericht bij is (`GET /api/v1/berichten/_volgen`), in plaats van dat de berichtenbox blijft
 * navragen.
 *
 * Wat hier op het spel staat: na elke (her)verbinding is de lijst compleet, zonder dubbele
 * berichten; en komt de verbinding niet tot stand, dan werkt de berichtenbox gewoon verder op het
 * periodiek navragen, zonder dat de bezoeker een melding krijgt die hem tegenhoudt.
 */

function apiBericht(id, extra = {}) {
	return {
		berichtId: id,
		magazijnId: "00000001000000000000",
		afzenderNaam: "Belastingdienst",
		onderwerp: "Bericht " + id,
		publicatietijdstip: "2026-09-21T09:00:00Z",
		aantalBijlagen: 0,
		status: "ongelezen",
		...extra,
	};
}

const lijstMet = (...ids) => antwoord(200, { berichten: ids.map((id) => apiBericht(id)) });
const GEEN_SESSIE = () => antwoord(409, {});

/** Antwoorden op de berichtenlijst, één per aanroep; het laatste blijft gelden. */
function lijstReeks(...antwoorden) {
	let beurt = 0;
	return () => {
		const volgende = antwoorden[Math.min(beurt++, antwoorden.length - 1)];
		return typeof volgende === "function" ? volgende() : volgende;
	};
}

/**
 * Een SSE-stroom die de test zelf voedt.
 *
 * Breekt de client de verbinding af — de waakhond, `pagehide`, een persona-wissel — dan faalt het
 * lezen, zoals een echte fetch dat doet. `afgebroken` laat zien of dat gebeurd is.
 */
function maakStroom(signaal) {
	let regelaar;
	const stroom = {
		afgebroken: false,
		stuur(gebeurtenis) {
			regelaar.enqueue(new TextEncoder().encode("data:" + JSON.stringify(gebeurtenis) + "\n\n"));
		},
		stuurRauw(tekst) {
			regelaar.enqueue(new TextEncoder().encode(tekst));
		},
		sluit() {
			regelaar.close();
		},
		breek() {
			regelaar.error(new TypeError("network error"));
		},
	};
	const body = new ReadableStream({
		start(r) {
			regelaar = r;
		},
	});
	if (signaal) {
		signaal.addEventListener("abort", () => {
			stroom.afgebroken = true;
			try {
				regelaar.error(new DOMException("afgebroken", "AbortError"));
			} catch {
				/* al dicht */
			}
		});
	}
	stroom.respons = { ok: true, status: 200, body: body, headers: { get: () => "text/event-stream" } };
	return stroom;
}

/**
 * Het adres `_volgen`: elke verbinding krijgt een eigen stroom, of het antwoord dat de test voor die
 * poging opgeeft. `stromen` houdt ze in volgorde bij.
 */
function volgAdres(...antwoorden) {
	const stromen = [];
	let beurt = 0;
	const geef = (pad, opties) => {
		const vast = antwoorden[beurt++];
		if (vast) return typeof vast === "function" ? vast(opties) : vast;
		const stroom = maakStroom(opties && opties.signal);
		stromen.push(stroom);
		return stroom.respons;
	};
	return { stromen, adres: ["_volgen", geef] };
}

let bezoeker = 90000500;

async function startVolgKeten(perAdres, pad) {
	bezoeker += 1;
	const kvkNummer = String(bezoeker);
	const gestart = await startKeten([["/api/demo/personas", personasVoor(kvkNummer)], ...perAdres, ["_ophalen", () => sseAntwoord()]], pad, kvkNummer);
	// De stroom opent na de ronde, in een volgende microtaak.
	await vi.advanceTimersByTimeAsync(0);
	return { ...gestart, ontvanger: "KVK:" + kvkNummer };
}

function tellingen(aanroepen, ontvanger) {
	const vanDeze = aanroepen.filter((aanroep) => aanroep.headers["X-Ontvanger"] === ontvanger);
	const telling = (stuk) => vanDeze.filter((aanroep) => aanroep.pad.indexOf(stuk) !== -1).length;
	return { lijst: telling("/api/v1/berichten?"), volgen: telling("_volgen"), rondes: telling("_ophalen") };
}

/** Wat de keten als laatste lijst aan zijn kijkers meldde. */
function volgGemeld() {
	const gemeld = [];
	window.BerichtenboxKeten.opWijziging((toestand) => {
		if (toestand.uitkomst) gemeld.push(toestand.uitkomst);
	});
	return () => gemeld[gemeld.length - 1];
}

const ids = (uitkomst) => uitkomst.berichten.map((bericht) => bericht.id);

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
	vi.spyOn(console, "info").mockImplementation(() => {});
	// Geen spreiding op de tussenpozen, zodat de tijden hieronder vastliggen.
	vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
	window.dispatchEvent(new Event("pagehide"));
	ruimKetenOp();
	zetZichtbaarheid("visible");
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("de stroom opent na de ronde", () => {
	it("stuurt de ontvanger mee en vraagt om een SSE-stroom", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);

		const verbinding = aanroepen.find((aanroep) => aanroep.pad.indexOf("_volgen") !== -1 && aanroep.headers["X-Ontvanger"] === ontvanger);
		expect(verbinding).toBeTruthy();
		expect(verbinding.headers.Accept).toBe("text/event-stream");
	});

	it("haalt bij `volgen-gestart` één keer de lijst, en daarna niet meer periodiek", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		const voor = tellingen(aanroepen, ontvanger);

		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(voor.lijst + 1);

		for (let seconde = 20; seconde <= 120; seconde += 20) {
			volg.stromen[0].stuur({ event: "hartslag" });
			await vi.advanceTimersByTimeAsync(20000);
		}
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(voor.lijst + 1);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(1);
	});

	it("zet een `bericht-bijgekomen` bovenaan de lijst, met de naam van de afzender", async () => {
		const volg = volgAdres();
		await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet("b-1")]]);
		const laatste = volgGemeld();

		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		volg.stromen[0].stuur({ event: "bericht-bijgekomen", bericht: apiBericht("b-2", { magazijnId: "00000002000000000000", afzenderNaam: "RVO" }) });
		await vi.advanceTimersByTimeAsync(0);

		expect(ids(laatste())).toEqual(["b-2", "b-1"]);
		expect(laatste().berichten[0].afzender).toBe("RVO");
		expect(laatste().magazijnen.map((magazijn) => magazijn.naam)).toContain("RVO");
	});

	it("negeert een gebeurtenis die het niet kent", async () => {
		const volg = volgAdres();
		await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet("b-1")]]);

		volg.stromen[0].stuur({ event: "volgen-gestart" });
		volg.stromen[0].stuur({ event: "iets-nieuws", wat: 1 });
		await vi.advanceTimersByTimeAsync(5000);

		// Ook niet stil geëindigd en opnieuw verbonden: dan was er een tweede stroom.
		expect(volg.stromen.length).toBe(1);
		expect(volg.stromen[0].afgebroken).toBe(false);
		expect(window.BerichtenboxKeten.melding).toBe(null);
	});

	it("slaat een melding over die het niet kan verwerken, en blijft verbonden", async () => {
		// Een fout in één bericht is geen weggevallen verbinding. Nam die fout de stroom mee, dan
		// verbond de berichtenbox opnieuw en hield het bijwerken na drie rondes op.
		const volg = volgAdres();
		// De lijst na het overgeslagen bericht bevat b-2 al: het stelsel zet elk bericht eerst in de
		// sessie en meldt het dan pas.
		await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet("b-1"), lijstMet("b-1"), lijstMet("b-2", "b-1"))]]);
		const laatste = volgGemeld();

		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		volg.stromen[0].stuur(null);
		volg.stromen[0].stuur({ event: "bericht-bijgekomen", bericht: apiBericht("b-kapot", { publicatietijdstip: 20260921 }) });
		volg.stromen[0].stuur({ event: "bericht-bijgekomen", bericht: apiBericht("b-2") });
		await vi.advanceTimersByTimeAsync(5000);

		expect(volg.stromen.length).toBe(1);
		expect(volg.stromen[0].afgebroken).toBe(false);
		expect(ids(laatste())).toEqual(["b-2", "b-1"]);
		expect(console.error).toHaveBeenCalled();
	});

	it("slaat een melding over die geen JSON is, en blijft verbonden", async () => {
		const volg = volgAdres();
		await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet("b-1")]]);
		const laatste = volgGemeld();

		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		volg.stromen[0].stuurRauw("data:{kapot\n\n");
		volg.stromen[0].stuur({ event: "bericht-bijgekomen", bericht: apiBericht("b-2") });
		await vi.advanceTimersByTimeAsync(5000);

		expect(volg.stromen.length).toBe(1);
		expect(ids(laatste())).toEqual(["b-2", "b-1"]);
	});
});

describe("ontdubbelen", () => {
	it("toont een bericht één keer als het via de lijst én via de stroom komt", async () => {
		const volg = volgAdres();
		await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet(), lijstMet("b-1"))]]);
		const laatste = volgGemeld();

		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		volg.stromen[0].stuur({ event: "bericht-bijgekomen", bericht: apiBericht("b-1") });
		await vi.advanceTimersByTimeAsync(0);

		expect(ids(laatste())).toEqual(["b-1"]);
	});

	it("houdt een bericht vast dat binnenkwam terwijl de lijst onderweg was", async () => {
		// De lijst is van vóór het bericht. Zonder dit legt hij zich over het bericht heen, ziet de bron
		// het "verdwijnen" en haalt hij het weer van het scherm.
		let geefLijst;
		const volg = volgAdres();
		await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet("b-1"), () => new Promise((klaar) => (geefLijst = () => klaar(lijstMet("b-1")))))]]);
		const laatste = volgGemeld();

		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		volg.stromen[0].stuur({ event: "bericht-bijgekomen", bericht: apiBericht("b-2") });
		await vi.advanceTimersByTimeAsync(0);
		geefLijst();
		await vi.advanceTimersByTimeAsync(0);

		expect(ids(laatste())).toEqual(["b-2", "b-1"]);
	});
});

describe("de waakhond", () => {
	it("verbindt opnieuw als het 45 seconden stil blijft", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });

		await vi.advanceTimersByTimeAsync(44000);
		expect(volg.stromen[0].afgebroken).toBe(false);
		await vi.advanceTimersByTimeAsync(1000);
		expect(volg.stromen[0].afgebroken).toBe(true);

		// Eerste tussenpoos: een seconde; de spreiding staat in deze tests op nul, 1500 ms is marge.
		await vi.advanceTimersByTimeAsync(1500);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(2);
	});

	it("laat een verbinding met een hartslag staan", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });

		for (let keer = 0; keer < 6; keer++) {
			await vi.advanceTimersByTimeAsync(20000);
			volg.stromen[0].stuur({ event: "hartslag" });
		}

		expect(volg.stromen[0].afgebroken).toBe(false);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(1);
	});
});

describe("opnieuw verbinden", () => {
	it("maakt de lijst na een afgebroken stroom weer compleet", async () => {
		// Tijdens de onderbreking kwam b-2 binnen. De stroom meldde het niet, maar de lijst na de
		// nieuwe `volgen-gestart` heeft het wél.
		const volg = volgAdres();
		await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet("b-1"), lijstMet("b-1"), lijstMet("b-2", "b-1"))]]);
		const laatste = volgGemeld();
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);

		volg.stromen[0].breek();
		await vi.advanceTimersByTimeAsync(1500);
		expect(volg.stromen.length).toBe(2);

		volg.stromen[1].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);

		expect(ids(laatste())).toEqual(["b-2", "b-1"]);
	});

	it("verbindt opnieuw als de stroom na een uur netjes eindigt", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		volg.stromen[0].stuur({ event: "hartslag" });
		await vi.advanceTimersByTimeAsync(0);

		volg.stromen[0].sluit();
		await vi.advanceTimersByTimeAsync(1500);

		expect(tellingen(aanroepen, ontvanger).volgen).toBe(2);
	});

	it("wacht steeds langer, en begint na de eerste hartslag weer van voren", async () => {
		// Een gezonde stroom breekt, dan twee pogingen die mislukken: 1, 2 en 5 seconden. Na een
		// nieuwe hartslag wacht de volgende breuk weer één seconde, geen tien.
		const volg = volgAdres(null, antwoord(500, {}), antwoord(500, {}));
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		volg.stromen[0].stuur({ event: "hartslag" });
		await vi.advanceTimersByTimeAsync(0);
		volg.stromen[0].breek();

		await vi.advanceTimersByTimeAsync(1100);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(2);
		await vi.advanceTimersByTimeAsync(1800);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(2);
		await vi.advanceTimersByTimeAsync(200);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(3);
		await vi.advanceTimersByTimeAsync(4800);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(3);
		await vi.advanceTimersByTimeAsync(200);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(4);

		volg.stromen[1].stuur({ event: "volgen-gestart" });
		volg.stromen[1].stuur({ event: "hartslag" });
		await vi.advanceTimersByTimeAsync(0);
		volg.stromen[1].breek();
		await vi.advanceTimersByTimeAsync(1100);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(5);
	});

	it("geeft een stroom die telkens na de start wegvalt op, in plaats van eindeloos opnieuw te verbinden", async () => {
		// Een tussenlaag die de stroom na `volgen-gestart` sluit, vóór de eerste hartslag. Telde
		// `volgen-gestart` als gezond, dan verbond de berichtenbox elke seconde opnieuw en haalde
		// hij elke keer de lijst op, zonder ooit op te geven.
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);

		for (let keer = 0; keer < 3; keer++) {
			volg.stromen[keer].stuur({ event: "volgen-gestart" });
			await vi.advanceTimersByTimeAsync(0);
			volg.stromen[keer].sluit();
			await vi.advanceTimersByTimeAsync(6000);
		}
		const na = tellingen(aanroepen, ontvanger);
		await vi.advanceTimersByTimeAsync(60000);

		expect(na.volgen).toBe(3);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(3);
		expect(window.BerichtenboxKeten.melding).toBe(null);
	});
});

describe("een verlopen sessie", () => {
	it("draait na `sessie-verlopen` een nieuwe ronde en verbindt daarna opnieuw", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet(), lijstMet(), GEEN_SESSIE(), lijstMet())]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		const voor = tellingen(aanroepen, ontvanger);

		volg.stromen[0].stuur({ event: "sessie-verlopen" });
		await vi.advanceTimersByTimeAsync(0);

		expect(tellingen(aanroepen, ontvanger).rondes).toBe(voor.rondes + 1);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(voor.volgen + 1);
	});

	it("draait bij een 409 op het openen een nieuwe ronde", async () => {
		const volg = volgAdres(GEEN_SESSIE());
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet(), GEEN_SESSIE(), lijstMet())]]);

		expect(tellingen(aanroepen, ontvanger).rondes).toBe(1);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(2);
	});

	it("valt stil terug als `_volgen` ook na een nieuwe ronde met 409 antwoordt", async () => {
		// Dan ligt het niet aan de sessie: de lijst werkt. Verder herstellen bevraagt telkens alle
		// organisaties en houdt na twee keer op met een mededeling, terwijl navragen gewoon werkt.
		const volg = volgAdres(GEEN_SESSIE(), GEEN_SESSIE(), GEEN_SESSIE());
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet(), GEEN_SESSIE(), lijstMet())]]);
		const voor = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(15000);

		expect(voor.rondes).toBe(1);
		expect(voor.volgen).toBe(2);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(voor.lijst + 1);
		expect(tellingen(aanroepen, ontvanger).rondes).toBe(1);
		expect(window.BerichtenboxKeten.melding).toBe(null);
	});

	it("sluit de stroom en draait een ronde als de lijst meldt dat de sessie weg is", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet(), GEEN_SESSIE(), GEEN_SESSIE(), lijstMet())]]);
		const voor = tellingen(aanroepen, ontvanger);

		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);

		expect(volg.stromen[0].afgebroken).toBe(true);
		expect(tellingen(aanroepen, ontvanger).rondes).toBe(voor.rondes + 1);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(voor.volgen + 1);
	});
});

describe("terugvallen op periodiek navragen", () => {
	it.each([404, 405, 406])("valt stil terug bij een keten zonder `_volgen` (%i)", async (status) => {
		// 406 is wat de publieke omgeving zonder `_volgen` geeft: het pad valt daar onder
		// `GET /berichten/{berichtId}`, en dat levert geen `text/event-stream`.
		const volg = volgAdres(antwoord(status, {}));
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		const voor = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(15000);

		expect(tellingen(aanroepen, ontvanger).lijst).toBe(voor.lijst + 1);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(1);
		expect(window.BerichtenboxKeten.melding).toBe(null);
	});

	it("valt stil terug na drie verbindingen op rij die niet tot stand kwamen", async () => {
		const volg = volgAdres(antwoord(500, {}), antwoord(502, {}), antwoord(500, {}));
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);

		await vi.advanceTimersByTimeAsync(4000);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(3);
		const voor = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(60000);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(3);
		expect(tellingen(aanroepen, ontvanger).lijst).toBeGreaterThan(voor.lijst);
		expect(window.BerichtenboxKeten.melding).toBe(null);
	});

	it.each([503, 429])("wacht na een %i de opgegeven `Retry-After` af", async (code) => {
		const druk = { ok: false, status: code, headers: { get: (naam) => (naam === "Retry-After" ? "30" : null) } };
		const volg = volgAdres(druk);
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);

		await vi.advanceTimersByTimeAsync(29000);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(1);
		await vi.advanceTimersByTimeAsync(1500);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(2);
	});
});

describe("een lijst die hapert terwijl de stroom openstaat", () => {
	it("laat de stroom staan en probeert de lijst na vijftien seconden opnieuw", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet(), antwoord(502, {}), lijstMet("b-1"))]]);
		const laatste = volgGemeld();
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		const na = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(14000);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst);
		await vi.advanceTimersByTimeAsync(1500);

		expect(tellingen(aanroepen, ontvanger).lijst).toBe(na.lijst + 1);
		expect(volg.stromen[0].afgebroken).toBe(false);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(1);
		expect(ids(laatste())).toEqual(["b-1"]);
	});

	it("houdt een storing van een halve minuut vol, net als het navragen", async () => {
		// Drie mislukkingen op rij zetten het bijwerken stil. Kwamen die elke seconde, dan was dat
		// na drie seconden al zo; nu zitten er vijftien tussen.
		const volg = volgAdres();
		await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet(), antwoord(502, {}), antwoord(502, {}), antwoord(502, {}))]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);

		await vi.advanceTimersByTimeAsync(29000);
		expect(window.BerichtenboxKeten.melding).toBe(null);

		await vi.advanceTimersByTimeAsync(2000);
		expect(window.BerichtenboxKeten.melding.soort).toBe("mededeling");
		expect(volg.stromen[0].afgebroken).toBe(true);
	});

	it("haalt de lijst nog een keer op als `volgen-gestart` komt terwijl er een tik loopt", async () => {
		// De lopende tik begon vóór het volgen; wat er tussendoor binnenkwam, staat in geen van beide.
		let geefTraag;
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet(), () => new Promise((klaar) => (geefTraag = () => klaar(lijstMet("b-1")))), lijstMet("b-2", "b-1"))]]);
		const laatste = volgGemeld();
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		const tijdensTik = tellingen(aanroepen, ontvanger);

		// De verbinding valt weg en komt terug terwijl de eerste tik nog onderweg is.
		volg.stromen[0].breek();
		await vi.advanceTimersByTimeAsync(1500);
		volg.stromen[1].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(tijdensTik.lijst);

		geefTraag();
		await vi.advanceTimersByTimeAsync(0);

		expect(tellingen(aanroepen, ontvanger).lijst).toBe(tijdensTik.lijst + 1);
		expect(ids(laatste())).toEqual(["b-2", "b-1"]);
	});

	it("biedt de lijst opnieuw aan als de bron hem niet kon tonen", async () => {
		// Over de stroom komt er geen volgende tik vanzelf; zonder deze tik blijft de melding staan
		// en verschijnen die berichten niet meer.
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet("b-1")]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		const voor = tellingen(aanroepen, ontvanger);

		const gemeld = [];
		window.BerichtenboxKeten.opWijziging((toestand) => {
			if (toestand.uitkomst) gemeld.push(toestand.uitkomst);
		});
		window.BerichtenboxKeten.meldVerwerkingsfout();
		const naMelding = gemeld.length;
		await vi.advanceTimersByTimeAsync(5000);

		expect(tellingen(aanroepen, ontvanger).lijst).toBe(voor.lijst + 1);
		// Dezelfde lijst, maar opnieuw aangeboden: zonder `vergeetGemeldeLijst` zou de tik zwijgen.
		expect(gemeld.length).toBeGreaterThan(naMelding);
		expect(ids(gemeld[gemeld.length - 1])).toEqual(["b-1"]);
	});
});

describe("een verbinding die niet op gang komt", () => {
	it("breekt ook een openen dat blijft hangen af", async () => {
		// Na een slaapstand blijft juist de fetch hangen, nog vóór er een antwoord is.
		// Zoals een echte fetch: hij antwoordt nooit, maar geeft op zodra hij afgebroken wordt.
		const hangt = (opties) => new Promise((_, weiger) => opties.signal.addEventListener("abort", () => weiger(new DOMException("afgebroken", "AbortError"))));
		const volg = volgAdres(hangt);
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);

		await vi.advanceTimersByTimeAsync(45000 + 1500);

		expect(tellingen(aanroepen, ontvanger).volgen).toBe(2);
	});

	it("telt een 200 zonder `text/event-stream` als mislukte verbinding", async () => {
		// Een tussenlaag die een foutpagina teruggeeft. Daar valt niets uit te lezen.
		const html = { ok: true, status: 200, body: new ReadableStream(), headers: { get: () => "text/html" } };
		const volg = volgAdres(html, html, html);
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);

		await vi.advanceTimersByTimeAsync(60000);

		expect(tellingen(aanroepen, ontvanger).volgen).toBe(3);
		expect(window.BerichtenboxKeten.melding).toBe(null);
	});
});

describe("tweede reviewronde", () => {
	it("houdt de herstelrem vast als de stroom telkens na de start `sessie-verlopen` meldt", async () => {
		// Een sessie die korter leeft dan één cyclus. De lijst-tik na `volgen-gestart` slaagt altijd,
		// want de ronde heeft de sessie net gevuld; zette die tik de rem terug, dan draaide de
		// berichtenbox om de paar seconden een ronde langs alle organisaties, zonder einde.
		let sessie = true;
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([
			volg.adres,
			[
				"_ophalen",
				() => {
					sessie = true;
					return sseAntwoord();
				},
			],
			["/api/v1/berichten?", () => (sessie ? lijstMet() : GEEN_SESSIE())],
		]);

		for (let stroom = 0; stroom < 6 && volg.stromen[stroom]; stroom++) {
			volg.stromen[stroom].stuur({ event: "volgen-gestart" });
			await vi.advanceTimersByTimeAsync(100);
			sessie = false;
			volg.stromen[stroom].stuur({ event: "sessie-verlopen" });
			await vi.advanceTimersByTimeAsync(100);
		}

		expect(tellingen(aanroepen, ontvanger).rondes).toBeLessThanOrEqual(2);
		expect(window.BerichtenboxKeten.melding.soort).toBe("mededeling");
	});

	it("meldt een bericht zonder id, ook als er tijdens de tik een bericht uit de stroom bijkwam", async () => {
		let geefLijst;
		const volg = volgAdres();
		await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet("b-1"), () => new Promise((klaar) => (geefLijst = () => klaar(antwoord(200, { berichten: [apiBericht("b-1"), { onderwerp: "Zonder id" }] })))))]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		volg.stromen[0].stuur({ event: "bericht-bijgekomen", bericht: apiBericht("b-2") });
		await vi.advanceTimersByTimeAsync(0);
		geefLijst();
		await vi.advanceTimersByTimeAsync(0);

		expect(window.BerichtenboxKeten.melding && window.BerichtenboxKeten.melding.tekst).toContain("ontbreken gegevens");
	});

	it.each([
		["zonder id", { onderwerp: "Zonder id" }],
		["met een onleesbaar veld", apiBericht("b-kapot", { publicatietijdstip: 20260921 })],
	])("haalt de lijst op als een bericht uit de stroom %s overgeslagen werd", async (_, bericht) => {
		// Anders blijft dat bericht weg tot de volgende `volgen-gestart`, en die kan een uur op zich
		// laten wachten.
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		const voor = tellingen(aanroepen, ontvanger);

		volg.stromen[0].stuur({ event: "bericht-bijgekomen", bericht: bericht });
		await vi.advanceTimersByTimeAsync(5500);

		expect(tellingen(aanroepen, ontvanger).lijst).toBe(voor.lijst + 1);
	});

	it("laat de waakhond niet voeden door meldingen die niets zeggen", async () => {
		// Een stroom die alleen onleesbare frames levert, zou anders een uur openblijven en nooit als
		// mislukt tellen.
		const volg = volgAdres();
		await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		volg.stromen[0].stuur({ event: "hartslag" });

		for (let keer = 0; keer < 5; keer++) {
			await vi.advanceTimersByTimeAsync(10000);
			if (!volg.stromen[0].afgebroken) volg.stromen[0].stuurRauw("data:{kapot\n\n");
		}

		expect(volg.stromen[0].afgebroken).toBe(true);
	});

	it("wacht een `Retry-After` van een uur niet helemaal af", async () => {
		const druk = { ok: false, status: 503, headers: { get: (naam) => (naam === "Retry-After" ? "3600" : null) } };
		const volg = volgAdres(druk);
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);

		await vi.advanceTimersByTimeAsync(61000);

		expect(tellingen(aanroepen, ontvanger).volgen).toBe(2);
	});

	it("probeert de stroom na een netwerkstoring later opnieuw", async () => {
		// Drie mislukte pogingen binnen een paar seconden zijn een wifi-wissel, geen keten zonder
		// `_volgen`. Tijdelijk navragen, daarna de stroom weer proberen.
		const volg = volgAdres(antwoord(500, {}), antwoord(500, {}), antwoord(500, {}));
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		await vi.advanceTimersByTimeAsync(4000);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(3);

		await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

		expect(tellingen(aanroepen, ontvanger).volgen).toBe(4);
		expect(volg.stromen.length).toBe(1);
	});

	it("probeert de stroom niet opnieuw bij een keten zonder `_volgen`", async () => {
		const volg = volgAdres(antwoord(404, {}));
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);

		await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

		expect(tellingen(aanroepen, ontvanger).volgen).toBe(1);
	});
});

describe("wat de eerste hartslag terugzet", () => {
	it("telt mislukkingen van vóór een gezonde verbinding niet meer mee", async () => {
		// Twee mislukkingen, een gezonde verbinding, en dan weer één: dat is geen reeks van drie.
		const volg = volgAdres(antwoord(500, {}), antwoord(500, {}), null, antwoord(500, {}));
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		await vi.advanceTimersByTimeAsync(3100);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		volg.stromen[0].stuur({ event: "hartslag" });
		await vi.advanceTimersByTimeAsync(0);
		volg.stromen[0].breek();

		await vi.advanceTimersByTimeAsync(4000);

		expect(tellingen(aanroepen, ontvanger).volgen).toBe(5);
		expect(volg.stromen.length).toBe(2);
	});

	it("vergeet een 409 van vóór een gezonde verbinding", async () => {
		// Twee 409's met uren gezonde verbinding ertussen zijn twee verlopen sessies, geen keten die
		// het niet kan.
		const volg = volgAdres(GEEN_SESSIE(), null, GEEN_SESSIE());
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet(), GEEN_SESSIE(), lijstMet(), lijstMet(), GEEN_SESSIE(), lijstMet())]]);
		expect(tellingen(aanroepen, ontvanger).rondes).toBe(1);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		volg.stromen[0].stuur({ event: "hartslag" });
		await vi.advanceTimersByTimeAsync(0);

		volg.stromen[0].breek();
		await vi.advanceTimersByTimeAsync(1500);

		expect(tellingen(aanroepen, ontvanger).rondes).toBe(2);
		expect(volg.stromen.length).toBe(2);
	});
});

describe("een antwoord dat we niet lezen", () => {
	it("sluit de body van een 200 zonder stroom", async () => {
		// Anders blijft zo'n verbinding bij het stelsel open, en per ontvanger zijn er vijf.
		let gesloten = false;
		const html = { ok: true, status: 200, body: new ReadableStream({ cancel: () => (gesloten = true) }), headers: { get: () => "text/html" } };
		const volg = volgAdres(html);
		await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);

		expect(gesloten).toBe(true);
	});
});

describe("van stroom tot bron", () => {
	it("maakt van een bericht uit de stroom één binnenkomer, ook als de lijst het ook heeft", async () => {
		const volg = volgAdres();
		await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet("b-1"), lijstMet("b-2", "b-1"))]]);
		const bron = ketenBron(window.BerichtenboxKeten);
		expect(await bron.geldtVoor()).toBe(true);
		await bron.laad();
		const gemeld = [];
		bron.start((wijziging) => {
			gemeld.push(wijziging);
			return [];
		});

		// Grensvlak: b-2 staat in de lijst van de tik én komt over de stroom.
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		volg.stromen[0].stuur({ event: "bericht-bijgekomen", bericht: apiBericht("b-2") });
		await vi.advanceTimersByTimeAsync(0);

		const binnenkomers = gemeld.filter((wijziging) => wijziging.nieuwBericht).map((wijziging) => wijziging.nieuwBericht.id);
		expect(binnenkomers).toEqual(["b-2"]);
		expect(gemeld.filter((wijziging) => wijziging.berichten)).toEqual([]);
	});
});

describe("de levenscyclus van de pagina", () => {
	it("sluit de stroom bij `pagehide` en verbindt opnieuw bij `pageshow`", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);

		window.dispatchEvent(new Event("pagehide"));
		// Meteen, en niet pas na een minuut: dan had de waakhond hem ook al afgebroken.
		await vi.advanceTimersByTimeAsync(0);
		expect(volg.stromen[0].afgebroken).toBe(true);
		await vi.advanceTimersByTimeAsync(60000);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(1);

		const voor = tellingen(aanroepen, ontvanger);
		window.dispatchEvent(new Event("pageshow"));
		await vi.advanceTimersByTimeAsync(0);
		volg.stromen[1].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);

		expect(tellingen(aanroepen, ontvanger).volgen).toBe(2);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(voor.lijst + 1);
	});

	it("blijft verbonden in een verborgen tabblad", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);
		const voor = tellingen(aanroepen, ontvanger);

		zetZichtbaarheid("hidden");
		for (let keer = 0; keer < 4; keer++) {
			await vi.advanceTimersByTimeAsync(20000);
			volg.stromen[0].stuur({ event: "hartslag" });
		}
		// Terug naar zichtbaar: over de stroom komt het vanzelf, dus geen extra tik.
		zetZichtbaarheid("visible");
		await vi.advanceTimersByTimeAsync(0);

		expect(volg.stromen[0].afgebroken).toBe(false);
		expect(tellingen(aanroepen, ontvanger)).toEqual(voor);
	});

	it("verbindt niet opnieuw als er intussen een andere persona gekozen is", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		window.dispatchEvent(new Event("pagehide"));

		window.Personas.actief = () => ({ id: "proeftuin-twee", stelsel: true, bedrijf: { kvkNummer: "90000012" } });
		window.dispatchEvent(new Event("pageshow"));
		await vi.advanceTimersByTimeAsync(60000);

		expect(tellingen(aanroepen, ontvanger).volgen).toBe(1);
		expect(tellingen(aanroepen, "KVK:90000012").volgen).toBe(0);
	});

	it("sluit de stroom bij `stopPollen()`", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);

		window.BerichtenboxKeten.stopPollen();
		await vi.advanceTimersByTimeAsync(0);
		expect(volg.stromen[0].afgebroken).toBe(true);

		await vi.advanceTimersByTimeAsync(60000);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(1);
	});
});

describe("de stroom is uit te zetten", () => {
	it("vraagt met `?volgen=0` periodiek na, zonder stroom", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]], "/moza/berichtenbox/?volgen=0");
		const voor = tellingen(aanroepen, ontvanger);

		await vi.advanceTimersByTimeAsync(15000);

		expect(tellingen(aanroepen, ontvanger).volgen).toBe(0);
		expect(tellingen(aanroepen, ontvanger).lijst).toBe(voor.lijst + 1);
	});

	it("volgt ook `setting:berichtenbox-volgen`", async () => {
		localStorage.setItem("setting:berichtenbox-volgen", "0");
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);

		expect(tellingen(aanroepen, ontvanger).volgen).toBe(0);
	});
});
