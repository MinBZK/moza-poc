// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { bericht, bouwPagina } from "./dom.js";

/**
 * berichtenbox-keten.js zelf, zonder netwerk en zonder stack.
 *
 * Eén ding staat hier op het spel: wat de client meldt vóórdat hij iets weet. De ophaalronde begint
 * met een vraag aan de demo-console — kent de keten deze ontvanger? — en voor de meeste persona's is
 * het antwoord "nee". Meldt hij in die tussentijd al voortgang, dan zet de render-laag een balk op
 * nul op het scherm die even later zonder uitleg verdwijnt.
 */

const KETEN = process.cwd() + "/assets/javascript/berichtenbox-keten.js";

/** Draait de client met een fetch die blijft hangen: de console heeft nog niet geantwoord. */
function draaiMetHangendeConsole() {
	vi.stubGlobal("fetch", () => new Promise(() => {}));
	new Function(readFileSync(KETEN, "utf8")).call(window);
}

/** Draait de client met een eigen antwoord van de demo-console en wacht de ronde af. */
function draaiMetConsole(antwoord) {
	vi.stubGlobal("fetch", antwoord);
	new Function(readFileSync(KETEN, "utf8")).call(window);
	return window.BerichtenboxKeten.berichten();
}

const CONSOLE_ONBEREIKBAAR = () => Promise.reject(new TypeError("Failed to fetch"));
const CONSOLE_KENT_HET_NUMMER_NIET = () => Promise.resolve({ ok: true, json: async () => [] });

/** De actieve persona. `stelsel: true` markeert een testaccount dat alleen voor het stelsel bestaat. */
function zetPersona(extra) {
	window.Personas = { actief: () => Object.assign({ id: "melkveehouder", bedrijf: { kvkNummer: "89012345" } }, extra) };
}

beforeEach(() => {
	bouwPagina([bericht(), bericht()]);
	window.Personas = { actief: () => ({ id: "melkveehouder", bedrijf: { kvkNummer: "89012345" } }) };
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	delete window.BerichtenboxKeten;
	delete window.Personas;
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("berichtenbox-keten.js — wat er gemeld wordt vóór het eerste antwoord", () => {
	it("meldt geen voortgang zolang er niets bevraagd is", async () => {
		draaiMetHangendeConsole();
		await Promise.resolve();

		expect(window.BerichtenboxKeten.bezig).toBe(true);
		expect(window.BerichtenboxKeten.voortgang).toBe(null);
	});

	it("meldt ook nog geen storing", async () => {
		// Niets weten is geen fout. De melding komt pas als de console antwoordt of afhaakt.
		draaiMetHangendeConsole();
		await Promise.resolve();

		expect(window.BerichtenboxKeten.melding).toBe(null);
	});

	it("heeft nog geen berichten te leveren", async () => {
		draaiMetHangendeConsole();
		await Promise.resolve();

		let geleverd = "nog niets";
		window.BerichtenboxKeten.berichten().then((u) => {
			geleverd = u;
		});
		await Promise.resolve();

		expect(geleverd).toBe("nog niets");
	});
});

/**
 * Een testaccount van het stelsel heeft geen gegenereerde dataset achter zich die klopt: die post is
 * van iemand anders. Zwijgend terugvallen laat dat verschil onzichtbaar, en dat is precies wat er in
 * een omgeving zonder keten-backend gebeurde — de proefomgeving van een pull request bijvoorbeeld.
 */
describe("berichtenbox-keten.js — een testaccount van het stelsel zonder stelsel", () => {
	it("zegt dat het stelsel er niet is als de demo-console onbereikbaar is", async () => {
		zetPersona({ id: "proeftuin-garage", stelsel: true, bedrijf: { kvkNummer: "90000014" } });

		await draaiMetConsole(CONSOLE_ONBEREIKBAAR);

		expect(window.BerichtenboxKeten.melding).toEqual({
			soort: "storing",
			tekst: "Dit testaccount haalt zijn berichten uit het Federatief Berichtenstelsel. Dat stelsel is in deze omgeving niet beschikbaar, dus wij kunnen uw berichten niet ophalen. Kies een ander testaccount om de berichtenbox met voorbeeldgegevens te bekijken.",
		});
	});

	it("zwijgt voor een gewone persona, want daar is de dataset wél de juiste inhoud", async () => {
		// Zonder deze grens zou elke bezoeker buiten de proeftuin een storingsmelding krijgen voor
		// een stelsel dat hem niets aangaat.
		zetPersona();

		await draaiMetConsole(CONSOLE_ONBEREIKBAAR);

		expect(window.BerichtenboxKeten.melding).toBe(null);
	});

	it("zegt iets anders als de console er wél is maar dit nummer niet kent", async () => {
		// Hier is niets kapot: er is een antwoord, en het antwoord is nee.
		zetPersona({ id: "proeftuin-garage", stelsel: true, bedrijf: { kvkNummer: "90000014" } });

		await draaiMetConsole(CONSOLE_KENT_HET_NUMMER_NIET);

		expect(window.BerichtenboxKeten.melding).toEqual({
			soort: "storing",
			tekst: "Dit testaccount is bij het Federatief Berichtenstelsel niet bekend, dus daar zijn geen berichten voor op te halen. Kies een ander testaccount om de berichtenbox met voorbeeldgegevens te bekijken.",
		});
	});

	it("zwijgt ook daar voor een gewone persona", async () => {
		zetPersona();

		await draaiMetConsole(CONSOLE_KENT_HET_NUMMER_NIET);

		expect(window.BerichtenboxKeten.melding).toBe(null);
	});

	it("eist de persona op, zodat de dataset-bron er niet overheen gaat", async () => {
		// Dit is de schakel waar ketenBron.geldtVoor op staat: is dit false, dan neemt de dataset het
		// over en ziet de bezoeker verzonnen post zonder dat iets dat vertelt.
		zetPersona({ id: "proeftuin-garage", stelsel: true, bedrijf: { kvkNummer: "90000014" } });

		await draaiMetConsole(CONSOLE_ONBEREIKBAAR);

		expect(window.BerichtenboxKeten.aangesloten).toBe(true);
	});

	it("eist een gewone persona niet op", async () => {
		zetPersona();

		await draaiMetConsole(CONSOLE_ONBEREIKBAAR);

		expect(window.BerichtenboxKeten.aangesloten).toBe(false);
	});
});
