import { vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Gedeeld gereedschap voor de tests van `berichtenbox-keten.js`, de transportlaag.
 *
 * Naast `dom.js` en niet erin: dat bouwt berichtenbox-pagina's voor de render-laag en heeft bij het
 * importeren een neveneffect op `document.addEventListener`. Dit gaat over de client-IIFE en zijn
 * `fetch`; die twee horen niet in één bestand.
 *
 * Twee testbestanden gebruiken dit, omdat het protocol van een jsdom-pagina per bestand vastligt:
 * `keten-inhoud.test.js` draait over http, `keten-cookie-https.test.js` over https. Toen ze allebei
 * hun eigen kopie hadden, liepen ze uit elkaar — `antwoord()` nam in het ene bestand een status en
 * in het andere niet, dus dezelfde naam gaf ander gedrag.
 */

export const BRON = readFileSync(resolve(process.cwd(), "assets/javascript/berichtenbox-keten.js"), "utf8");

export const ONTVANGER = "KVK:90000011";
export const BERICHT_ID = "1dc16f8f-653d-49ae-87a9-fb4b6e15c156";

/** Eén antwoord van het stelsel, in de vorm die fetch teruggeeft. */
export function antwoord(status, body, soort = "application/json") {
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

/** De ophaalronde als SSE-stroom, uit de gebeurtenissen die een test wil laten voorkomen. */
export function sseVan(gebeurtenissen) {
	const stroom = new ReadableStream({
		start(regelaar) {
			for (const gebeurtenis of gebeurtenissen) {
				regelaar.enqueue(new TextEncoder().encode("data:" + JSON.stringify(gebeurtenis) + "\n\n"));
			}
			regelaar.close();
		},
	});
	return { ok: true, status: 200, body: stroom, headers: { get: () => "text/event-stream" } };
}

/**
 * De gewone ronde: één organisatie, geen storingen.
 *
 * `gevonden` laat de ronde melden hoeveel berichten die organisatie had. Zonder dat getal blijft
 * `uitvraag.gevonden` nul en is de vergelijking "opgehaald < gevonden" in de client onbereikbaar —
 * precies de melding die zegt dat er berichten missen.
 */
export function sseAntwoord(gevonden = 0) {
	const gebeurtenissen = [];

	if (gevonden > 0) {
		gebeurtenissen.push({ event: "magazijn-bevraging-voltooid", magazijnId: "00000009000000000006", naam: "Demo-organisatie", status: "OK", aantalBerichten: gevonden });
	}

	gebeurtenissen.push({ event: "ophalen-gereed", totaalBerichten: gevonden, geslaagd: 0, mislukt: 0, totaalMagazijnen: 0 });
	return sseVan(gebeurtenissen);
}

export const PERSONAS = antwoord(200, [{ id: "proeftuin-een", label: "Demo-onderneming 1", ontvanger: ONTVANGER, bron: "keten" }]);
export const LIJST = antwoord(200, { berichten: [] });

/** Wat de uitvraag antwoordt zolang er geen sessie is: 409, met "ophalen" als weg terug. */
export const GEEN_SESSIE = antwoord(409, {});

/**
 * De ophaalronde en de berichtenlijst, met de sessie ertussen.
 *
 * De client vraagt eerst de lijst op — die van een andere berichtenbox-pagina kan er al zijn — en
 * draait alleen een ronde als het stelsel met 409 antwoordt. Hier bestaat de sessie dus pas ná
 * `_ophalen`; zonder dat onderscheid antwoordt de lijst meteen en ziet een test die de ronde toetst
 * er nooit een.
 *
 * `lijst` is een antwoord of een functie van het opgevraagde pad. `ronde` is het aantal berichten
 * dat de ronde vond, of een functie die de hele stroom levert — als functie en niet als constante,
 * want een stroom is maar één keer te lezen.
 */
export function rondeMetLijst(lijst, ronde = 0) {
	const stroomVan = typeof ronde === "function" ? ronde : () => sseAntwoord(ronde);
	let sessie = false;
	return [
		[
			"_ophalen",
			() => {
				sessie = true;
				return stroomVan();
			},
		],
		["/api/v1/berichten?", (pad) => (sessie ? (typeof lijst === "function" ? lijst(pad) : lijst) : GEEN_SESSIE)],
	];
}

/** De aanroepen die een ophaalronde zonder berichten doet. */
export function standaardRonde(extra = []) {
	return [...extra, ["/api/demo/personas", PERSONAS], ...rondeMetLijst(LIJST)];
}

/**
 * Draait het keten-script met een persona die aangesloten is, zodat er een ontvanger bekend is.
 * Geeft de aanroepen aan fetch terug, zodat een test kan zien wát er is opgevraagd.
 */
export async function startKeten(perAdres) {
	const aanroepen = [];

	vi.stubGlobal("fetch", async (pad, opties) => {
		aanroepen.push({ pad, headers: (opties && opties.headers) || {} });
		for (const [patroon, geef] of perAdres) {
			if (pad.indexOf(patroon) !== -1) return typeof geef === "function" ? geef(pad) : geef;
		}
		throw new Error("onverwacht adres in de test: " + pad);
	});

	document.body.innerHTML = '<article class="berichtenbox"><table data-berichtenbox-list><tbody></tbody></table></article>';
	// Een relatief pad, dus de origin uit @vitest-environment-options blijft staan: hetzelfde
	// harnas werkt in het http- en het https-bestand.
	window.history.replaceState(null, "", "/moza/berichtenbox/");
	window.berichtenboxData = { berichten: [], magazijnen: [], mappen: [] };
	// Inclusief `personas`, zoals de echte wisselaar die publiceert: de keten-bron vergelijkt de
	// lijst van het stelsel daarmee om te melden welke testaccounts hier geen persona hebben.
	window.Personas = {
		actief: () => ({ id: "proeftuin-een", stelsel: true, bedrijf: { kvkNummer: "90000011" } }),
		personas: [{ id: "proeftuin-een", stelsel: true, bedrijf: { kvkNummer: "90000011" } }],
	};

	new Function(BRON).call(window);
	await window.BerichtenboxKeten.berichten();

	return { aanroepen };
}

/**
 * Vangt af wat er naar `document.cookie` geschreven wordt, inclusief de attributen.
 *
 * Lezen levert die niet op: `document.cookie` geeft alleen naam en waarde terug van de cookies die
 * voor het huidige pad gelden. De afspraak met de proxy zit juist in de attributen.
 */
export function spionOpCookie(regels) {
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

/** Ruimt op wat per bestand blijft staan: de cookiejar en de adresbalk van jsdom. */
export function ruimKetenOp() {
	document.cookie = "ontvanger=; path=/api/v1/berichten; Max-Age=0";
	document.cookie = "ontvanger=; path=/; Max-Age=0";
	window.history.replaceState(null, "", "/moza/berichtenbox/");
	delete window.BerichtenboxKeten;
	delete window.Personas;
}
