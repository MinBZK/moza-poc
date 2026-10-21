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

describe("een herstel dat zelf mislukt", () => {
	it("zegt bij het bericht dezelfde reden als de melding erboven, niet dat de sessie verlopen is", async () => {
		// Verversen lost een 429 niet op; "Ververs de pagina om opnieuw in te loggen" zou de bezoeker
		// een rondje laten maken.
		await start([
			["/api/v1/berichten/1dc16f8f", () => ONGELDIG],
			["/api/v1/berichten?", reeks(GEEN_RONDE, LIJST)],
			["/api/v1/sessies", reeks(sessieAntwoord("eerste_sessie_00000001"), antwoord(429, { type: "urn:fbs:fout:te-veel-sessies" }))],
		]);

		const uitkomst = await window.BerichtenboxKeten.inhoudVan(window.BerichtenboxKeten.huidigeUitkomst.berichten[0].id);

		expect(uitkomst.fout).toContain("op te veel plekken tegelijk ingelogd");
		expect(window.BerichtenboxKeten.melding.tekst).toBe(uitkomst.fout);
	});
});

describe("een herstel dat traag is", () => {
	it("zegt niet dat het misschien gelukt is: de 401 zegt al dat er niets verwijderd is", async () => {
		// Voorgoed verwijderen is niet terug te draaien; "wij weten niet of het gelukt is" zou de
		// bezoeker laten twijfelen over iets wat zeker niet gebeurde.
		const IN_PRULLENBAK = antwoord(200, { berichten: [{ berichtId: "1dc16f8f-653d-49ae-87a9-fb4b6e15c156", magazijnId: "00000001000000000000", afzenderNaam: "Belastingdienst", onderwerp: "Aanslag", publicatietijdstip: "2026-10-01T09:00:00Z", map: "Prullenbak" }] });
		let lijsten = 0;
		const lijst = () => {
			lijsten += 1;
			if (lijsten === 1) return GEEN_RONDE;
			if (lijsten === 2) return IN_PRULLENBAK;
			throw new DOMException("te traag", "TimeoutError");
		};
		await start([
			["/api/v1/berichten/1dc16f8f", () => ONGELDIG],
			["/api/v1/berichten?", lijst],
			["/api/v1/sessies", reeks(sessieAntwoord("eerste_sessie_00000001"), sessieAntwoord("tweede_sessie_00000002"))],
		]);
		const id = window.BerichtenboxKeten.huidigeUitkomst.berichten[0].id;

		const uitkomst = await window.BerichtenboxKeten.verwijder(id);

		expect(uitkomst.fout).toBeTruthy();
		expect(uitkomst.fout).not.toContain("weten niet");
		expect(window.BerichtenboxKeten.huidigeUitkomst.berichten).toHaveLength(1);
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
		document.body.innerHTML = '<a href="#uitgelogd" data-uitloggen>Uitloggen</a>';
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
		document.body.insertAdjacentHTML("beforeend", '<a href="#uitgelogd" data-uitloggen>Uitloggen</a>');
		const link = document.querySelector("[data-uitloggen]");

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
		document.querySelector("[data-uitloggen]").click();
		expect(aanroepen).toHaveLength(0);
	});
});

describe("een wijziging na een 401", () => {
	const BERICHT = "1dc16f8f-653d-49ae-87a9-fb4b6e15c156";
	const IN_PRULLENBAK = antwoord(200, { berichten: [{ berichtId: BERICHT, magazijnId: "00000001000000000000", afzenderNaam: "Belastingdienst", onderwerp: "Aanslag", publicatietijdstip: "2026-10-01T09:00:00Z", map: "Prullenbak" }] });

	/** Het adres van één bericht, met per methode een eigen reeks antwoorden. */
	function berichtAdres(perMethode) {
		return ["/api/v1/berichten/" + BERICHT, (pad, opties) => perMethode[(opties && opties.method) || "GET"]()];
	}

	const wijzigingen = (aanroepen, methode) => aanroepen.filter((aanroep) => aanroep.methode === methode && aanroep.pad.indexOf("/api/v1/berichten/" + BERICHT) === 0);

	it("archiveert alsnog: na een nieuwe sessie en een ronde gaat hetzelfde verzoek nog één keer", async () => {
		// Een 401 voert niets uit, dus herhalen kan; een nieuwe sessie kent het bericht pas na de ronde.
		const { aanroepen } = await start([berichtAdres({ PATCH: reeks(ONGELDIG, antwoord(200, {})) }), ["/api/v1/berichten?", reeks(GEEN_RONDE, LIJST, GEEN_RONDE, LIJST)], ["/api/v1/sessies", reeks(sessieAntwoord("eerste_sessie_00000001"), sessieAntwoord("tweede_sessie_00000002"))]]);
		const id = window.BerichtenboxKeten.huidigeUitkomst.berichten[0].id;

		expect(await window.BerichtenboxKeten.verplaats(id, "archief")).toEqual({});

		const patches = wijzigingen(aanroepen, "PATCH");
		expect(patches.map((aanroep) => aanroep.headers["X-Sessie"])).toEqual(["eerste_sessie_00000001", "tweede_sessie_00000002"]);
		expect(patches[1].body).toBe(patches[0].body);
		const tussen = aanroepen.slice(aanroepen.indexOf(patches[0]), aanroepen.indexOf(patches[1]));
		expect(naar(tussen, "/api/v1/berichten/_ophalen")).toHaveLength(1);
		expect(window.BerichtenboxKeten.huidigeUitkomst.berichten[0].plek).toBe("archief");
	});

	it("verwijdert alsnog, en leest een 401 nooit als een bericht dat al weg was", async () => {
		await start([berichtAdres({ DELETE: reeks(ONGELDIG, antwoord(204, null)) }), ["/api/v1/berichten?", reeks(GEEN_RONDE, IN_PRULLENBAK, GEEN_RONDE, IN_PRULLENBAK)], ["/api/v1/sessies", reeks(sessieAntwoord("eerste_sessie_00000001"), sessieAntwoord("tweede_sessie_00000002"))]]);
		const id = window.BerichtenboxKeten.huidigeUitkomst.berichten[0].id;

		expect(await window.BerichtenboxKeten.verwijder(id)).toEqual({});
		expect(window.BerichtenboxKeten.huidigeUitkomst.berichten).toHaveLength(0);
	});

	it("laat het bericht staan en zegt wat helpt als ook de nieuwe sessie geweigerd wordt", async () => {
		const { aanroepen } = await start([berichtAdres({ DELETE: () => ONGELDIG }), ["/api/v1/berichten?", reeks(GEEN_RONDE, IN_PRULLENBAK, GEEN_RONDE, IN_PRULLENBAK)], ["/api/v1/sessies", reeks(sessieAntwoord("eerste_sessie_00000001"), sessieAntwoord("tweede_sessie_00000002"), sessieAntwoord("derde__sessie_00000003"))]]);
		const id = window.BerichtenboxKeten.huidigeUitkomst.berichten[0].id;

		const uitkomst = await window.BerichtenboxKeten.verwijder(id);

		expect(uitkomst.fout).toContain("Ververs de pagina");
		expect(uitkomst.fout).not.toContain("Probeer het opnieuw");
		expect(window.BerichtenboxKeten.huidigeUitkomst.berichten).toHaveLength(1);
		expect(wijzigingen(aanroepen, "DELETE")).toHaveLength(2);
	});

	it("start voor twee wijzigingen tegelijk maar één nieuwe sessie", async () => {
		// Elke sessie telt mee voor de vijf per ontvanger; twee herstelrondes naast elkaar kosten er twee.
		const TWEE = antwoord(200, {
			berichten: [
				{ berichtId: BERICHT, magazijnId: "00000001000000000000", afzenderNaam: "Belastingdienst", onderwerp: "Aanslag", publicatietijdstip: "2026-10-01T09:00:00Z" },
				{ berichtId: "2ec27f9f-653d-49ae-87a9-fb4b6e15c157", magazijnId: "00000001000000000000", afzenderNaam: "Belastingdienst", onderwerp: "Teruggaaf", publicatietijdstip: "2026-10-02T09:00:00Z" },
			],
		});
		const eersteSessie = (opties) => opties.headers["X-Sessie"] === "eerste_sessie_00000001";
		const { aanroepen } = await start([...[BERICHT, "2ec27f9f-653d-49ae-87a9-fb4b6e15c157"].map((nummer) => ["/api/v1/berichten/" + nummer, (pad, opties) => (eersteSessie(opties) ? ONGELDIG : antwoord(200, {}))]), ["/api/v1/berichten?", reeks(GEEN_RONDE, TWEE, GEEN_RONDE, TWEE)], ["/api/v1/sessies", reeks(sessieAntwoord("eerste_sessie_00000001"), sessieAntwoord("tweede_sessie_00000002"), sessieAntwoord("derde__sessie_00000003"))]]);
		const [een, twee] = window.BerichtenboxKeten.huidigeUitkomst.berichten.map((bericht) => bericht.id);
		const voor = aanroepen.length;

		const uitkomsten = await Promise.all([window.BerichtenboxKeten.verplaats(een, "archief"), window.BerichtenboxKeten.verplaats(twee, "archief")]);

		expect(uitkomsten).toEqual([{}, {}]);
		expect(naar(aanroepen.slice(voor), "/api/v1/sessies")).toHaveLength(1);
		expect(naar(aanroepen.slice(voor), "/api/v1/berichten/_ophalen")).toHaveLength(1);
	});
});

describe("een 401 die bij een oude sessie hoort", () => {
	it("gooit een sessie die intussen vernieuwd is niet weg", () => {
		new Function(SESSIE_BRON).call(window);
		window.KetenSessie.bewaar("KVK:90000011", "nieuwe_sessie_00000002");

		window.KetenSessie.vergeet("KVK:90000011", "oude__sessie_000000001");

		expect(window.KetenSessie.bewaard("KVK:90000011")).toBe("nieuwe_sessie_00000002");
	});
});

describe("de cookies als het tabblad weer in beeld komt", () => {
	function zichtbaar(staat) {
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => staat });
		document.dispatchEvent(new Event("visibilitychange"));
	}

	afterEach(() => zichtbaar("visible"));

	it("zet de eigen ontvanger en sessie terug, want een ander tabblad kan ze overschreven hebben", async () => {
		const { ontvanger } = await start([["/api/v1/berichten?", LIJST]]);
		const regels = [];
		const herstel = spionOpCookie(regels);
		try {
			zichtbaar("visible");
		} finally {
			herstel();
		}
		expect(regels.some((regel) => regel.indexOf("sessie=" + SESSIE_ID + ";") === 0)).toBe(true);
		expect(regels.some((regel) => regel.indexOf("ontvanger=" + ontvanger + ";") === 0)).toBe(true);
	});

	it("laat ze staan als het tabblad verborgen is, of als er intussen een andere persona gekozen is", async () => {
		await start([["/api/v1/berichten?", LIJST]]);
		const regels = [];
		const herstel = spionOpCookie(regels);
		try {
			zichtbaar("hidden");
			window.Personas.actief = () => ({ id: "proeftuin-twee", stelsel: true, bedrijf: { kvkNummer: "90000012" } });
			zichtbaar("visible");
		} finally {
			herstel();
		}
		expect(regels).toEqual([]);
	});
});

describe("uitloggen, de randgevallen", () => {
	function laad() {
		document.body.innerHTML = '<a href="#uitgelogd" data-uitloggen>Uitloggen</a>';
		new Function(SESSIE_BRON).call(window);
		const aanroepen = [];
		vi.stubGlobal("fetch", async (pad, opties) => {
			aanroepen.push({ pad, opties });
			return antwoord(204, null);
		});
		return aanroepen;
	}

	it("logt dit tabblad niet uit als de link in een nieuw tabblad opengaat", () => {
		const aanroepen = laad();
		window.KetenSessie.bewaar("KVK:90000011", "sessie_van_een_tabblad");
		const link = document.querySelector("[data-uitloggen]");
		link.addEventListener("click", (gebeurtenis) => gebeurtenis.preventDefault(), { once: true });

		link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));

		expect(aanroepen).toHaveLength(0);
		expect(window.KetenSessie.afgemeld).toBe(false);
		expect(window.KetenSessie.bewaard("KVK:90000011")).toBe("sessie_van_een_tabblad");
	});

	it("beëindigt een sessie die nog onderweg was toen de bezoeker uitlogde, in plaats van haar te bewaren", async () => {
		bezoeker += 1;
		const kvkNummer = String(bezoeker);
		let geefSessie;
		const onderweg = new Promise((klaar) => {
			geefSessie = klaar;
		});
		const gestart = startKeten(
			[
				["/api/demo/personas", personasVoor(kvkNummer)],
				["/api/v1/sessies/huidige", antwoord(204, null)],
				["/api/v1/sessies", () => onderweg],
			],
			"/moza/berichtenbox/?poll=0",
			kvkNummer
		);
		await vi.waitFor(() => expect(window.KetenSessie).toBeTruthy());
		document.body.insertAdjacentHTML("beforeend", '<a href="#uitgelogd" data-uitloggen>Uitloggen</a>');
		await new Promise((klaar) => setTimeout(klaar, 0));

		document.querySelector("[data-uitloggen]").click();
		geefSessie(sessieAntwoord("laat__sessie_000000001"));
		const { aanroepen } = await gestart;

		const afmelden = aanroepen.filter((aanroep) => aanroep.pad === "/api/v1/sessies/huidige");
		expect(afmelden).toHaveLength(1);
		expect(afmelden[0].headers["X-Sessie"]).toBe("laat__sessie_000000001");
		expect(sessionStorage.getItem("berichtenbox-sessie:KVK:" + kvkNummer)).toBe(null);
	});
});
