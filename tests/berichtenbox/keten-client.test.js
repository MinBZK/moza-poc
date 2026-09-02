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
		window.BerichtenboxKeten.berichten().then((u) => { geleverd = u; });
		await Promise.resolve();

		expect(geleverd).toBe("nog niets");
	});
});
