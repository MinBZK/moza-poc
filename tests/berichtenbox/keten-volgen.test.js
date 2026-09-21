// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { antwoord, personasVoor, ruimKetenOp, sseAntwoord, startKeten } from "./keten-harnas.js";

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
		if (vast) return typeof vast === "function" ? vast() : vast;
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
		await vi.advanceTimersByTimeAsync(0);

		expect(volg.stromen[0].afgebroken).toBe(false);
		expect(window.BerichtenboxKeten.melding).toBe(null);
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

		await vi.advanceTimersByTimeAsync(45000);
		expect(volg.stromen[0].afgebroken).toBe(true);

		// Eerste tussenpoos: een seconde, met spreiding.
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
		await vi.advanceTimersByTimeAsync(0);

		volg.stromen[0].sluit();
		await vi.advanceTimersByTimeAsync(1500);

		expect(tellingen(aanroepen, ontvanger).volgen).toBe(2);
	});

	it("wacht steeds langer, en begint na een geslaagde `volgen-gestart` weer van voren", async () => {
		// Een breuk na `volgen-gestart`, dan twee pogingen die mislukken: 1, 2 en 5 seconden. Na een
		// nieuwe `volgen-gestart` wacht de volgende breuk weer één seconde, geen tien.
		const volg = volgAdres(null, antwoord(500, {}), antwoord(500, {}));
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
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
		await vi.advanceTimersByTimeAsync(0);
		volg.stromen[1].breek();
		await vi.advanceTimersByTimeAsync(1100);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(5);
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

	it("houdt op na twee vergeefse herstelrondes, met een mededeling", async () => {
		const volg = volgAdres(GEEN_SESSIE(), GEEN_SESSIE(), GEEN_SESSIE(), GEEN_SESSIE());
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstReeks(lijstMet(), GEEN_SESSIE(), lijstMet(), GEEN_SESSIE(), lijstMet())]]);

		expect(tellingen(aanroepen, ontvanger).rondes).toBe(2);
		expect(window.BerichtenboxKeten.melding.soort).toBe("mededeling");
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

	it("wacht na een 503 de opgegeven `Retry-After` af", async () => {
		const druk = { ok: false, status: 503, headers: { get: (naam) => (naam === "Retry-After" ? "30" : null) } };
		const volg = volgAdres(druk);
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);

		await vi.advanceTimersByTimeAsync(29000);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(1);
		await vi.advanceTimersByTimeAsync(1500);
		expect(tellingen(aanroepen, ontvanger).volgen).toBe(2);
	});
});

describe("de levenscyclus van de pagina", () => {
	it("sluit de stroom bij `pagehide` en verbindt opnieuw bij `pageshow`", async () => {
		const volg = volgAdres();
		const { aanroepen, ontvanger } = await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });
		await vi.advanceTimersByTimeAsync(0);

		window.dispatchEvent(new Event("pagehide"));
		await vi.advanceTimersByTimeAsync(60000);
		expect(volg.stromen[0].afgebroken).toBe(true);
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
		await startVolgKeten([volg.adres, ["/api/v1/berichten?", lijstMet()]]);
		volg.stromen[0].stuur({ event: "volgen-gestart" });

		zetZichtbaarheid("hidden");
		await vi.advanceTimersByTimeAsync(0);

		expect(volg.stromen[0].afgebroken).toBe(false);
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
		await vi.advanceTimersByTimeAsync(60000);

		expect(volg.stromen[0].afgebroken).toBe(true);
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
