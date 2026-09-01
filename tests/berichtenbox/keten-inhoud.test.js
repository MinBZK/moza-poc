// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * De transportkant van `inhoudVan`: wat er echt over de lijn gaat, en wat er terugkomt.
 *
 * Deze laag was in het geheel niet gedekt — `haalInhoud` en de publieke `inhoudVan` konden allebei
 * verwijderd worden zonder één rode test, omdat de tests van de render-laag hun eigen keten
 * meebrengen. Wat hier misgaat komt de bezoeker als tekst op zijn scherm tegen, dus het hoort
 * getoetst te worden tegen echte antwoorden.
 *
 * Het script is een klassieke IIFE die zich aan `window` hangt; we draaien hem per test opnieuw
 * tegen een verse `fetch`.
 */

const BRON = readFileSync(resolve(process.cwd(), "assets/javascript/berichtenbox-keten.js"), "utf8");

const ONTVANGER = "KVK:90000011";
const BERICHT_ID = "1dc16f8f-653d-49ae-87a9-fb4b6e15c156";

/** Eén antwoord van het stelsel, in de vorm die fetch teruggeeft. */
function antwoord(status, body, soort = "application/json") {
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: { get: (naam) => (naam.toLowerCase() === "content-type" ? soort : null) },
		json: async () => {
			if (typeof body === "string") throw new SyntaxError("geen JSON");
			return body;
		},
	};
}

/**
 * Draait het keten-script met een persona die aangesloten is, zodat er een ontvanger bekend is.
 * Geeft de aanroepen aan fetch terug, zodat een test kan zien wát er is opgevraagd.
 */
async function startKeten(perAdres) {
	const aanroepen = [];

	vi.stubGlobal("fetch", async (pad, opties) => {
		aanroepen.push({ pad, headers: (opties && opties.headers) || {} });
		for (const [patroon, geef] of perAdres) {
			if (pad.indexOf(patroon) !== -1) return typeof geef === "function" ? geef(pad) : geef;
		}
		throw new Error("onverwacht adres in de test: " + pad);
	});

	document.body.innerHTML = '<article class="berichtenbox"><table data-berichtenbox-list><tbody></tbody></table></article>';
	window.history.replaceState(null, "", "/moza/berichtenbox/");
	window.berichtenboxData = { berichten: [], magazijnen: [], mappen: [] };
	window.Personas = { actief: () => ({ id: "proeftuin-een", stelsel: true, bedrijf: { kvkNummer: "90000011" } }) };

	new Function(BRON).call(window);
	await window.BerichtenboxKeten.berichten();

	return { aanroepen };
}

const PERSONAS = antwoord(200, [{ id: "proeftuin-een", label: "Demo-onderneming 1", ontvanger: ONTVANGER, bron: "keten" }]);
const OPHALEN = antwoord(200, {});
const LIJST = antwoord(200, { berichten: [] });

/** De ophaalronde leest een SSE-stroom; die geven we als lege maar geldige stroom terug. */
function sseAntwoord() {
	const stroom = new ReadableStream({
		start(regelaar) {
			regelaar.enqueue(new TextEncoder().encode('data:{"event":"ophalen-gereed","totaalBerichten":0,"geslaagd":0,"mislukt":0,"totaalMagazijnen":0}\n\n'));
			regelaar.close();
		},
	});
	return { ok: true, status: 200, body: stroom, headers: { get: () => "text/event-stream" } };
}

/**
 * Vangt af wat er naar `document.cookie` geschreven wordt, inclusief de attributen.
 *
 * Lezen levert die niet op: `document.cookie` geeft alleen naam en waarde terug van de cookies die
 * voor het huidige pad gelden. De afspraak met de proxy zit juist in de attributen.
 */
function spionOpCookie(regels) {
	const origineel = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
	Object.defineProperty(document, "cookie", {
		configurable: true,
		get: () => origineel.get.call(document),
		set: (waarde) => {
			regels.push(waarde);
			origineel.set.call(document, waarde);
		},
	});
	return () => delete document.cookie;
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	delete window.BerichtenboxKeten;
	delete window.Personas;
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("de inhoud van één bericht ophalen bij het stelsel", () => {
	it("zet de ontvanger in een cookie, zodat de proxy bijlagen kan ophalen", async () => {
		// Een <a href> naar een bijlage kan geen eigen header meesturen; de proxy maakt er daarom een
		// X-Ontvanger-header van. Zonder dit cookie antwoordt het stelsel met 400 en is elke
		// bijlage-link stuk.
		//
		// Niet via `document.cookie` gelezen maar bij het schrijven afgevangen: het cookie geldt voor
		// `/api/v1/berichten` en deze pagina staat op `/moza/berichtenbox/`, dus de browser geeft hem
		// hier niet terug. Precies de bedoeling — en het is ook wat we willen toetsen, want de
		// attributen zijn hier de afspraak met het stelsel en niet de waarde alleen.
		const geschreven = [];
		const herstel = spionOpCookie(geschreven);
		try {
			await startKeten([
				["/api/demo/personas", PERSONAS],
				["_ophalen", sseAntwoord()],
				["/api/v1/berichten?", LIJST],
			]);
		} finally {
			herstel();
		}

		const gezet = geschreven.find((regel) => regel.startsWith("ontvanger=" + ONTVANGER));
		expect(gezet).toBeDefined();
		// Rauw, niet ge-encodeerd: nginx geeft de waarde door zoals hij is en het stelsel verwacht
		// "KVK:90000011". Ge-encodeerd zou daar "KVK%3A90000011" van maken.
		expect(gezet).not.toContain("%3A");
		// Zo smal mogelijk: alleen de aanroepen die hem nodig hebben, nooit vanaf een andere site, en
		// niet eeuwig. De waarde is een identiteit; die hoort niet mee te reizen met elk plaatje.
		expect(gezet).toContain("path=/api/v1/berichten");
		expect(gezet).toContain("SameSite=Strict");
		expect(gezet).toContain("Max-Age=1800");
		// Geen Secure op een http-pagina: de browser weigert het cookie dan, en dan is elke
		// bijlage-link lokaal stuk. Op https hoort hij er wél te staan; zie keten-cookie-https.test.js.
		expect(gezet).not.toContain("Secure");
	});

	it("ruimt een ontvanger op het oude pad op, zodat er niet twee cookies meegaan", async () => {
		// Zittingen van vóór de versmalling hebben `ontvanger` op `path=/` staan. Blijft die staan,
		// dan stuurt de browser twee cookies met dezelfde naam mee en pakt nginx de eerste — welke
		// dat is, ligt niet vast. Dan haalt een bijlage-link het document van de vorige persona op.
		const geschreven = [];
		const herstel = spionOpCookie(geschreven);
		try {
			await startKeten([
				["/api/demo/personas", PERSONAS],
				["_ophalen", sseAntwoord()],
				["/api/v1/berichten?", LIJST],
			]);
		} finally {
			herstel();
		}

		const opgeruimd = geschreven.find((regel) => regel.startsWith("ontvanger=;") && regel.includes("path=/;"));
		expect(opgeruimd).toBeDefined();
		expect(opgeruimd).toContain("Max-Age=0");
		// En in die volgorde: eerst opruimen, dan zetten. Andersom wist de opruimactie het cookie dat
		// we net gezet hadden, als het pad ooit gelijk zou zijn.
		expect(geschreven.indexOf(opgeruimd)).toBeLessThan(geschreven.findIndex((regel) => regel.startsWith("ontvanger=" + ONTVANGER)));
	});

	it("vraagt het juiste adres op, met de ontvanger erbij", async () => {
		const { aanroepen } = await startKeten([
			["/api/demo/personas", PERSONAS],
			["_ophalen", sseAntwoord()],
			["/api/v1/berichten?", LIJST],
			["/api/v1/berichten/", antwoord(200, { inhoud: "De brief.", bijlagen: [] })],
		]);

		const uitkomst = await window.BerichtenboxKeten.inhoudVan(BERICHT_ID);

		expect(uitkomst).toEqual({ inhoud: "De brief.", bijlagen: [] });
		const laatste = aanroepen[aanroepen.length - 1];
		expect(laatste.pad).toBe("/api/v1/berichten/" + BERICHT_ID);
		// Zonder deze header levert het stelsel de berichten van niemand.
		expect(laatste.headers["X-Ontvanger"]).toBe(ONTVANGER);
	});

	it("ontsnapt een berichtId dat het adres zou kunnen breken", async () => {
		const { aanroepen } = await startKeten([
			["/api/demo/personas", PERSONAS],
			["_ophalen", sseAntwoord()],
			["/api/v1/berichten?", LIJST],
			["/api/v1/berichten/", antwoord(200, { inhoud: "x", bijlagen: [] })],
		]);

		await window.BerichtenboxKeten.inhoudVan("../../admin?x=1");

		// Rauw doorgeven zou een heel ander adres opleveren dan bedoeld.
		expect(aanroepen[aanroepen.length - 1].pad).toBe("/api/v1/berichten/" + encodeURIComponent("../../admin?x=1"));
	});

	// Drie vormen van 404 die het stelsel of een laag ertussen kan sturen. Ze krijgen bewust
	// dezelfde tekst: er is geen afgesproken kenmerk waarmee "ingetrokken" van "onbereikbaar" te
	// scheiden is, dus doen we ook niet alsof. Zodra dat kenmerk er is, hoort dit uiteen te vallen
	// en horen deze drie tests uiteenlopende teksten te eisen.
	const VORMEN_404 = [
		["problem+json die zegt dat het bericht weg is", { type: "urn:fbs:bericht-niet-gevonden", title: "Bericht niet gevonden" }, "application/problem+json"],
		["problem+json volgens de RFC-standaard", { type: "about:blank", title: "Not Found", detail: "Het bericht is ingetrokken door de afzender." }, "application/problem+json"],
		["een kale HTML-foutpagina van een tussenliggende laag", "<html>Not Found</html>", "text/html"],
	];

	VORMEN_404.forEach(([wat, body, soort]) => {
		it("zegt bij een 404 (" + wat + ") wat wij wél weten", async () => {
			await startKeten([
				["/api/demo/personas", PERSONAS],
				["_ophalen", sseAntwoord()],
				["/api/v1/berichten?", LIJST],
				["/api/v1/berichten/", antwoord(404, body, soort)],
			]);

			const uitkomst = await window.BerichtenboxKeten.inhoudVan(BERICHT_ID);

			// Wél: dat wij het niet konden ophalen, wat het kán zijn, en wat de bezoeker kan doen.
			// Niet: dat het bericht zeker weg is — die stelligheid draagt een 404 niet.
			expect(uitkomst.fout).toContain("Wij konden dit bericht niet ophalen");
			// Twee uitwegen, want verversen helpt niet bij een backend die de route niet kent.
			expect(uitkomst.fout).toContain("Ververs de pagina");
			expect(uitkomst.fout).toContain("terug naar uw Berichtenbox");
			// En geen oorzaak beweren die een 404 niet draagt.
			expect(uitkomst.fout).not.toContain("bestaat niet meer");
			expect(uitkomst.fout).not.toContain("ingetrokken");
		});
	});

	it("spreekt bij een trage organisatie niet over het hele stelsel", async () => {
		// De tijdslimiet van één bericht bij één organisatie. "De bronnen reageren niet meer" gaat
		// over het hele stelsel en is hier onwaar: de lijst van de bezoeker staat er gewoon.
		await startKeten([
			["/api/demo/personas", PERSONAS],
			["_ophalen", sseAntwoord()],
			["/api/v1/berichten?", LIJST],
			[
				"/api/v1/berichten/",
				() => {
					const fout = new Error("te traag");
					fout.name = "TimeoutError";
					throw fout;
				},
			],
		]);

		const uitkomst = await window.BerichtenboxKeten.inhoudVan(BERICHT_ID);

		expect(uitkomst.fout).toContain("duurde te lang");
		expect(uitkomst.fout).not.toContain("De bronnen reageren niet meer");
	});

	it("maakt van een serverfout een melding en geen uitworp", async () => {
		await startKeten([
			["/api/demo/personas", PERSONAS],
			["_ophalen", sseAntwoord()],
			["/api/v1/berichten?", LIJST],
			["/api/v1/berichten/", antwoord(503, {})],
		]);

		const uitkomst = await window.BerichtenboxKeten.inhoudVan(BERICHT_ID);

		expect(uitkomst.fout).toContain("Er gaat iets mis met het ophalen");
	});

	it("overleeft een antwoord dat geen JSON is", async () => {
		// Een foutpagina met status 200 komt van een tussenliggende laag. De bezoeker hoort een
		// melding te krijgen, geen onafgehandelde uitworp.
		await startKeten([
			["/api/demo/personas", PERSONAS],
			["_ophalen", sseAntwoord()],
			["/api/v1/berichten?", LIJST],
			["/api/v1/berichten/", antwoord(200, "<html>Even geduld</html>", "text/html")],
		]);

		const uitkomst = await window.BerichtenboxKeten.inhoudVan(BERICHT_ID);

		expect(uitkomst.fout).toBeTruthy();
	});

	it("levert een vaste vorm, ook als het stelsel iets anders stuurt", async () => {
		// De render-laag splitst de inhoud op alinea's en loopt over de bijlagen. Een getal of een
		// ontbrekend veld mag daar geen uitworp worden.
		await startKeten([
			["/api/demo/personas", PERSONAS],
			["_ophalen", sseAntwoord()],
			["/api/v1/berichten?", LIJST],
			["/api/v1/berichten/", antwoord(200, { inhoud: 42 })],
		]);

		const uitkomst = await window.BerichtenboxKeten.inhoudVan(BERICHT_ID);

		expect(uitkomst).toEqual({ inhoud: "", bijlagen: [] });
	});

	it("zegt het als er geen ophaalronde was om het bij te vragen", async () => {
		// Geen ontvanger betekent dat er niets gevraagd is. Dat is iets anders dan een organisatie
		// die niets heeft, en mag dus niet als zo'n uitspraak op het scherm belanden.
		vi.stubGlobal("fetch", async () => antwoord(200, []));
		document.body.innerHTML = '<article class="berichtenbox"></article>';
		window.berichtenboxData = { berichten: [], magazijnen: [], mappen: [] };
		window.Personas = { actief: () => ({ id: "koffiezaak", bedrijf: { kvkNummer: "85234567" } }) };

		new Function(BRON).call(window);

		const uitkomst = await window.BerichtenboxKeten.inhoudVan(BERICHT_ID);

		expect(uitkomst.fout).toContain("niet opvragen");
		expect(uitkomst.fout).not.toContain("bij de organisatie niet beschikbaar");
	});
});
