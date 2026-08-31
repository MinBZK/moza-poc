// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bericht, bouwPagina, laadBerichtenbox, laatLaden } from "./dom.js";

/**
 * Het bolletje toont geen onthouden getal op de pagina die het echte getal zo gaat berekenen.
 *
 * Anders staat er bij het laden iets anders dan even later. En dat onthouden getal kan verouderd
 * zijn — uit een vorige versie, of van vóór een handeling in een ander tabblad — dus is het niet
 * "vast even het goede getal", maar een bewering die we niet kunnen waarmaken.
 */
describe("het ongelezen-bolletje bij het laden", () => {
	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => vi.restoreAllMocks());

	const badge = () => document.querySelector('[data-berichtenbox-count="ongelezen"]');

	it("laat het onthouden getal nooit zien op de berichtenbox zelf", async () => {
		const berichten = [1, 2, 3].map((n) => bericht({ id: "b" + n, magazijnId: "rdw", afzender: "RDW", isOngelezen: n === 1 }));
		// Een verouderd getal in de bewaarde staat, zoals na een vorige versie of een ander tabblad.
		bouwPagina(berichten, { state: { eersteBezoekGehad: true, aantalOngelezen: 24 } });

		// Elke waarde die het bolletje onderweg aanneemt, niet alleen de eindstand: het gaat juist
		// om wat er heel even staat.
		const gezien = [];
		new MutationObserver(() => gezien.push(badge().textContent)).observe(badge(), { childList: true, characterData: true, subtree: true });

		await laadBerichtenbox();
		for (let i = 0; i < 6; i += 1) await laatLaden();

		expect(gezien).not.toContain("24");
		expect(badge().textContent).toBe("1");
	});

	it("gebruikt het onthouden getal wél waar niets wordt ingeladen", async () => {
		// Een pagina zonder berichtenbox: het script stopt daar na het markeer-gedeelte, dus er komt
		// geen berekening die het kan tegenspreken. Het laatst bekende aantal is dan wat we hebben.
		bouwPagina([bericht()], { state: { eersteBezoekGehad: true, aantalOngelezen: 7 } });
		document.querySelector(".berichtenbox").className = "";
		document.querySelector("[data-berichtenbox-list]").remove();

		await laadBerichtenbox();
		await laatLaden();

		expect(badge().textContent).toBe("7");
	});
});
