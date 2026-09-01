// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BRON, ONTVANGER, BERICHT_ID, antwoord, sseAntwoord, PERSONAS, LIJST, startKeten, spionOpCookie, ruimKetenOp } from "./keten-harnas.js";

/**
 * De transportkant van `inhoudVan`: wat er echt over de lijn gaat, en wat er terugkomt.
 *
 * Deze laag was in het geheel niet gedekt — `haalInhoud` en de publieke `inhoudVan` konden allebei
 * verwijderd worden zonder één rode test, omdat de tests van de render-laag hun eigen keten
 * meebrengen. Wat hier misgaat komt de bezoeker als tekst op zijn scherm tegen, dus het hoort
 * getoetst te worden tegen echte antwoorden.
 *
 * Het script is een klassieke IIFE die zich aan `window` hangt; het harnas draait hem per test
 * opnieuw tegen een verse `fetch`. Deze pagina staat op http — de tegenhanger over https staat in
 * keten-cookie-https.test.js.
 */

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	// De cookiejar en de adresbalk van jsdom leven per bestand, niet per test: wat de ene test zet,
	// ziet de volgende terug.
	ruimKetenOp();
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

		// In één keer exact, niet met losse toContain's: "path=/api/v1/berichtenXX" bevat
		// "path=/api/v1/berichten" en "Max-Age=18000" bevat "Max-Age=1800", dus een prefix-assertie
		// laat precies de fouten door die hier het gevaarlijkst zijn. Dit dekt en passant de
		// afwezigheid van Secure (http) en van Max-Age (sessiecookie).
		const gezet = geschreven.find((regel) => regel.startsWith("ontvanger=" + ONTVANGER));
		expect(gezet).toBe("ontvanger=" + ONTVANGER + "; path=/api/v1/berichten; SameSite=Strict");
		// Rauw, niet ge-encodeerd: nginx geeft de waarde door zoals hij is en het stelsel verwacht
		// "KVK:90000011". Ge-encodeerd zou daar "KVK%3A90000011" van maken.
		expect(gezet).not.toContain("%3A");
	});

	it("stuurt het cookie mee naar het adres dat een bijlage-link gebruikt", async () => {
		// Het smalle pad is alleen zinnig als het het adres dekt dat bijlageAdres() in
		// berichtenbox.js bouwt. Dat is een afspraak tussen twee bestanden zonder gedeelde constante;
		// hier houden we hem vast. Een assertie op de string "path=..." zou een typefout in het pad
		// niet vangen, deze wel: de browser beslist zelf of hij het cookie meestuurt.
		await startKeten([
			["/api/demo/personas", PERSONAS],
			["_ophalen", sseAntwoord()],
			["/api/v1/berichten?", LIJST],
		]);

		// Op de berichtenbox-pagina zelf hoort hij niet mee te gaan — dat is de hele versmalling.
		expect(document.cookie).not.toContain(ONTVANGER);

		window.history.replaceState(null, "", "/api/v1/berichten/" + BERICHT_ID + "/bijlagen/b-1");
		expect(document.cookie).toContain("ontvanger=" + ONTVANGER);
	});

	it("laat na een ronde één ontvanger meereizen, niet twee", async () => {
		// Zittingen van vóór de versmalling hebben `ontvanger` op `path=/` staan. Blijft die naast de
		// nieuwe staan, dan reist bij elk verzoek een tweede identiteit mee — precies wat de
		// versmalling weghaalt — en moet nginx kiezen welke hij als X-Ontvanger doorgeeft.
		//
		// Als gedrag en niet als schrijfvolgorde: we zetten de brede voorganger klaar en kijken wat
		// de browser daarna naar een bijlage-adres meestuurt. Dat is wat de proxy te zien krijgt.
		document.cookie = "ontvanger=KVK:11111111; path=/";

		await startKeten([
			["/api/demo/personas", PERSONAS],
			["_ophalen", sseAntwoord()],
			["/api/v1/berichten?", LIJST],
		]);

		window.history.replaceState(null, "", "/api/v1/berichten/" + BERICHT_ID + "/bijlagen/b-1");
		expect(document.cookie.match(/ontvanger=/g)).toHaveLength(1);
		expect(document.cookie).toContain("ontvanger=" + ONTVANGER);
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
