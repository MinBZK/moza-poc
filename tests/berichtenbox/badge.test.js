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

	it("telt niet mee terwijl de ophaalronde nog loopt", async () => {
		// De lijst staat dan verborgen en de balk zegt dat we bezig zijn. "16 ongelezen" ernaast
		// spreekt dat tegen: we weten het blijkbaar al. Het aantal hoort te verschijnen op hetzelfde
		// moment als de lijst.
		const berichten = [1, 2, 3].map((n) => bericht({ id: "r" + n, magazijnId: "rdw", afzender: "RDW", isOngelezen: true }));
		bouwPagina(berichten, { state: { eersteBezoekGehad: false } });
		window.localStorage.removeItem("berichtenbox");

		// De lijst verborgen houden ís de ophaalronde, ook voordat de balk zelf zichtbaar wordt: die
		// verschijnt pas na een drempel van 300 ms. Op die balk wachten maakt de test leeg, want in
		// jsdom loopt die tijd niet.
		const lijst = document.querySelector("[data-berichtenbox-list]");
		let getalTerwijlDeLijstWachtte = false;
		new MutationObserver(() => {
			if (lijst.hidden && badge().textContent.trim() !== "") getalTerwijlDeLijstWachtte = true;
		}).observe(document.querySelector(".berichtenbox-content"), { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });

		await laadBerichtenbox();
		// De nagebootste ronde loopt op echte tijd (requestAnimationFrame), dus microtasks flushen is
		// niet genoeg; wachten tot de lijst er staat.
		const einde = Date.now() + 15000;
		while (Date.now() < einde && lijst.hidden) await new Promise((r) => setTimeout(r, 25));

		expect(getalTerwijlDeLijstWachtte).toBe(false);
		// En daarna staat het er wél: anders is "niet tonen" gewoon "nooit tonen".
		expect(lijst.hidden).toBe(false);
		expect(badge().textContent).toBe("3");
	}, 20000);

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
