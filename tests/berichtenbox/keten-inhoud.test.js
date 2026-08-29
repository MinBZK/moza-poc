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
	window.Personas = { actief: () => ({ id: "proeftuin-een", bedrijf: { kvkNummer: "90000011" } }) };

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
			expect(uitkomst.fout).toContain("Mogelijk is het ingetrokken");
			expect(uitkomst.fout).toContain("Ververs de pagina");
			expect(uitkomst.fout).not.toContain("bestaat niet meer");
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
