// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { antwoord, personasVoor, ruimKetenOp, sessieAntwoord, SESSIE_BRON, SESSIE_ID, spionOpCookie, sseAntwoord, startKeten } from "./keten-harnas.js";

/**
 * De inlogsessie bij de berichtenuitvraag (MinBZK/MijnOverheidZakelijk#943).
 *
 * Wat hier op het spel staat: elk verzoek onder `/api/v1/berichten` noemt de sessie van dit
 * tabblad, een herlading start geen nieuwe, en een sessie die het stelsel niet meer kent wordt
 * vervangen zonder dat de bezoeker daar iets voor hoeft te doen. En het id blijft een geheim: niet
 * in localStorage, niet in een URL.
 */

const LIJST = antwoord(200, { berichten: [{ berichtId: "1dc16f8f-653d-49ae-87a9-fb4b6e15c156", magazijnId: "00000001000000000000", afzenderNaam: "Belastingdienst", onderwerp: "Aanslag", publicatietijdstip: "2026-10-01T09:00:00Z" }] });
const GEEN_RONDE = antwoord(409, { type: "urn:fbs:fout:nog-niet-opgehaald" });
const ONGELDIG = antwoord(401, { type: "urn:fbs:fout:sessie-ongeldig" });

/** Antwoorden per aanroep; het laatste blijft gelden. */
function reeks(...antwoorden) {
	let beurt = 0;
	return () => antwoorden[Math.min(beurt++, antwoorden.length - 1)];
}

let bezoeker = 90000700;

/** Start het keten-script zonder navragen, zodat er tijdens een test geen tik tussendoor komt. */
async function start(perAdres) {
	bezoeker += 1;
	const kvkNummer = String(bezoeker);
	const ontvanger = "KVK:" + kvkNummer;
	const gestart = await startKeten([["/api/demo/personas", personasVoor(kvkNummer)], ...perAdres, ["_ophalen", () => sseAntwoord()]], "/moza/berichtenbox/?poll=0", kvkNummer);
	return { ...gestart, ontvanger };
}

const naar = (aanroepen, pad) => aanroepen.filter((aanroep) => aanroep.pad.split("?")[0] === pad);
const onderBerichten = (aanroepen) => aanroepen.filter((aanroep) => aanroep.pad.indexOf("/api/v1/berichten") === 0);

beforeEach(() => {
	sessionStorage.clear();
	localStorage.clear();
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
	window.dispatchEvent(new Event("pagehide"));
	ruimKetenOp();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("een sessie per tabblad", () => {
	it("start een sessie voor de ontvanger en stuurt haar mee op elk verzoek onder /berichten", async () => {
		const { aanroepen, ontvanger } = await start([["/api/v1/berichten?", reeks(GEEN_RONDE, LIJST)]]);

		const starten = naar(aanroepen, "/api/v1/sessies");
		expect(starten).toHaveLength(1);
		expect(starten[0].methode).toBe("POST");
		expect(starten[0].headers["X-Ontvanger"]).toBe(ontvanger);
		expect(starten[0].headers["X-Sessie"]).toBeUndefined();

		const verzoeken = onderBerichten(aanroepen);
		expect(verzoeken.map((aanroep) => aanroep.pad.split("?")[0])).toEqual(["/api/v1/berichten", "/api/v1/berichten/_ophalen", "/api/v1/berichten", "/api/v1/berichten/_volgen"]);
		expect(verzoeken.every((aanroep) => aanroep.headers["X-Sessie"] === SESSIE_ID && aanroep.headers["X-Ontvanger"] === ontvanger)).toBe(true);
		expect(window.BerichtenboxKeten.huidigeUitkomst.berichten).toHaveLength(1);
	});

	it("bewaart het id in sessionStorage, onder de ontvanger, en nergens in localStorage", async () => {
		const { ontvanger } = await start([["/api/v1/berichten?", LIJST]]);

		expect(sessionStorage.getItem("berichtenbox-sessie:" + ontvanger)).toBe(SESSIE_ID);
		for (let i = 0; i < localStorage.length; i++) {
			expect(localStorage.getItem(localStorage.key(i))).not.toContain(SESSIE_ID);
		}
	});

	it("start na een herlading met een bewaarde sessie geen nieuwe", async () => {
		bezoeker += 1;
		const kvkNummer = String(bezoeker);
		sessionStorage.setItem("berichtenbox-sessie:KVK:" + kvkNummer, "bewaarde_sessie_000001");

		const { aanroepen } = await startKeten(
			[
				["/api/demo/personas", personasVoor(kvkNummer)],
				["/api/v1/berichten?", LIJST],
			],
			"/moza/berichtenbox/?poll=0",
			kvkNummer
		);

		expect(naar(aanroepen, "/api/v1/sessies")).toHaveLength(0);
		expect(naar(aanroepen, "/api/v1/berichten")[0].headers["X-Sessie"]).toBe("bewaarde_sessie_000001");
	});

	it("zet de sessie in een cookie voor de bijlagen, met dezelfde eigenschappen als de ontvanger", async () => {
		const regels = [];
		const herstel = spionOpCookie(regels);
		try {
			await start([["/api/v1/berichten?", LIJST]]);
		} finally {
			herstel();
		}

		const sessie = regels.filter((regel) => regel.indexOf("sessie=" + SESSIE_ID) === 0);
		expect(sessie.length).toBeGreaterThan(0);
		expect(sessie[0]).toContain("path=/api/v1/berichten");
		expect(sessie[0]).toContain("SameSite=Strict");
	});
});

describe("een sessie die het stelsel niet meer kent", () => {
	it("vervangt haar bij een 401, en draait voor de nieuwe sessie een ronde", async () => {
		bezoeker += 1;
		const kvkNummer = String(bezoeker);
		const ontvanger = "KVK:" + kvkNummer;
		sessionStorage.setItem("berichtenbox-sessie:" + ontvanger, "verlopen_sessie_000001");

		const { aanroepen } = await startKeten(
			[
				["/api/demo/personas", personasVoor(kvkNummer)],
				["/api/v1/berichten?", reeks(ONGELDIG, GEEN_RONDE, LIJST)],
				["_ophalen", () => sseAntwoord()],
			],
			"/moza/berichtenbox/?poll=0",
			kvkNummer
		);

		expect(naar(aanroepen, "/api/v1/sessies")).toHaveLength(1);
		const rondes = naar(aanroepen, "/api/v1/berichten/_ophalen");
		expect(rondes).toHaveLength(1);
		expect(rondes[0].headers["X-Sessie"]).toBe(SESSIE_ID);
		expect(sessionStorage.getItem("berichtenbox-sessie:" + ontvanger)).toBe(SESSIE_ID);
		expect(window.BerichtenboxKeten.melding).toBe(null);
		expect(window.BerichtenboxKeten.huidigeUitkomst.berichten).toHaveLength(1);
	});

	it("zegt het als ook een verse sessie geweigerd wordt, in plaats van door te blijven starten", async () => {
		const { aanroepen } = await start([["/api/v1/berichten?", ONGELDIG]]);

		expect(naar(aanroepen, "/api/v1/sessies")).toHaveLength(2);
		expect(window.BerichtenboxKeten.melding).toEqual({ soort: "storing", tekst: expect.stringContaining("Uw sessie is verlopen of ongeldig") });
	});

	it("haalt een bericht alsnog op na een 401: eerst een nieuwe sessie en een ronde, dan opnieuw", async () => {
		const inhoud = reeks(ONGELDIG, antwoord(200, { inhoud: "Uw aanslag staat klaar.", bijlagen: [] }));
		const { aanroepen } = await start([
			["/api/v1/berichten/1dc16f8f", inhoud],
			["/api/v1/berichten?", reeks(GEEN_RONDE, LIJST, GEEN_RONDE, LIJST)],
			["/api/v1/sessies", reeks(sessieAntwoord("eerste_sessie_00000001"), sessieAntwoord("tweede_sessie_00000002"))],
		]);
		const voor = aanroepen.length;

		const uitkomst = await window.BerichtenboxKeten.inhoudVan(window.BerichtenboxKeten.huidigeUitkomst.berichten[0].id);

		expect(uitkomst).toEqual({ inhoud: "Uw aanslag staat klaar.", bijlagen: [] });
		const erna = aanroepen.slice(voor).map((aanroep) => aanroep.methode + " " + aanroep.pad.split("?")[0]);
		expect(erna).toEqual(["GET /api/v1/berichten/1dc16f8f-653d-49ae-87a9-fb4b6e15c156", "GET /api/demo/personas", "POST /api/v1/sessies", "GET /api/v1/berichten", "GET /api/v1/berichten/_ophalen", "GET /api/v1/berichten", "GET /api/v1/berichten/1dc16f8f-653d-49ae-87a9-fb4b6e15c156"]);
		expect(aanroepen[aanroepen.length - 1].headers["X-Sessie"]).toBe("tweede_sessie_00000002");
	});
});

describe("te veel sessies", () => {
	it("zegt wat de bezoeker kan doen als het stelsel geen sessie meer geeft", async () => {
		const { aanroepen } = await start([["/api/v1/sessies", antwoord(429, { type: "urn:fbs:fout:te-veel-sessies" })]]);

		expect(onderBerichten(aanroepen)).toHaveLength(0);
		expect(window.BerichtenboxKeten.melding).toEqual({ soort: "storing", tekst: expect.stringContaining("op te veel plekken tegelijk ingelogd") });
	});
});

describe("uitloggen", () => {
	function laadSessie() {
		document.body.innerHTML = '<a href="/moza/uitgelogd/" data-uitloggen>Uitloggen</a>';
		new Function(SESSIE_BRON).call(window);
		const aanroepen = [];
		vi.stubGlobal("fetch", async (pad, opties) => {
			aanroepen.push({ pad, opties });
			return antwoord(204, null);
		});
		return aanroepen;
	}

	it("beëindigt de sessie bij een klik op Uitloggen, vóór de navigatie en met keepalive", () => {
		const aanroepen = laadSessie();
		window.KetenSessie.bewaar("KVK:90000011", "sessie_van_een_tabblad");

		const link = document.querySelector("[data-uitloggen]");
		// De navigatie zelf kan jsdom niet; die is hier ook niet de vraag.
		link.addEventListener("click", (gebeurtenis) => gebeurtenis.preventDefault());
		link.click();

		expect(aanroepen).toHaveLength(1);
		expect(aanroepen[0].pad).toBe("/api/v1/sessies/huidige");
		expect(aanroepen[0].opties).toMatchObject({ method: "DELETE", keepalive: true, headers: { "X-Ontvanger": "KVK:90000011", "X-Sessie": "sessie_van_een_tabblad" } });
		expect(sessionStorage.getItem("berichtenbox-sessie:KVK:90000011")).toBe(null);
	});

	it("beëindigt de sessies van andere ontvangers en laat die van de actieve staan", () => {
		const aanroepen = laadSessie();
		window.KetenSessie.bewaar("KVK:90000011", "sessie_van_de_vorige_1");
		window.KetenSessie.bewaar("KVK:90000012", "sessie_van_de_actieve2");

		window.KetenSessie.beeindigBehalve("KVK:90000012");

		expect(aanroepen.map((aanroep) => aanroep.opties.headers["X-Ontvanger"])).toEqual(["KVK:90000011"]);
		expect(window.KetenSessie.bewaard("KVK:90000011")).toBe(null);
		expect(window.KetenSessie.bewaard("KVK:90000012")).toBe("sessie_van_de_actieve2");
	});

	it("zet het volgen stil en start daarna geen sessie meer in dit document", async () => {
		// Tot de volgende pagina er staat draait deze nog. Een `sessie-verlopen` of 401 zou de
		// bezoeker anders meteen weer inloggen, met een sessie die niemand afsluit.
		const { aanroepen, ontvanger } = await start([["/api/v1/berichten?", LIJST]]);
		const stopPollen = vi.spyOn(window.BerichtenboxKeten, "stopPollen");
		document.body.insertAdjacentHTML("beforeend", '<a href="/moza/uitgelogd/" data-uitloggen>Uitloggen</a>');
		const link = document.querySelector("[data-uitloggen]");
		link.addEventListener("click", (gebeurtenis) => gebeurtenis.preventDefault());

		link.click();
		const voor = aanroepen.length;
		const uitkomst = await window.BerichtenboxKeten.inhoudVan(window.BerichtenboxKeten.huidigeUitkomst.berichten[0].id);

		expect(stopPollen).toHaveBeenCalled();
		expect(window.KetenSessie.afgemeld).toBe(true);
		expect(sessionStorage.getItem("berichtenbox-sessie:" + ontvanger)).toBe(null);
		expect(naar(aanroepen.slice(voor), "/api/v1/sessies")).toHaveLength(0);
		expect(uitkomst.fout).toBeTruthy();
	});

	it("doet niets zonder bewaarde sessie", () => {
		const aanroepen = laadSessie();
		document.querySelector("[data-uitloggen]").addEventListener("click", (gebeurtenis) => gebeurtenis.preventDefault());
		document.querySelector("[data-uitloggen]").click();
		expect(aanroepen).toHaveLength(0);
	});
});
