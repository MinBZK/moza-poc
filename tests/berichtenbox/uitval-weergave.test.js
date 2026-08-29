// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bericht, bouwPagina, bouwDetailPagina, laadBerichtenbox, laatLaden, rijen } from "./dom.js";

/**
 * Wat de bezoeker van de gesimuleerde bronuitval ziet.
 *
 * De bron laat berichten weg; dat mag nooit zwijgend gebeuren. En de drie plekken waar het te zien
 * is — de twee waarschuwingsblokken op de inbox en het blok op de detailpagina — moeten de stand
 * volgen die de bron meldt, ook als die pas ná het laden verandert.
 */

const BERICHTEN = [bericht({ id: "msg-1", magazijnId: "rdw", afzender: "RDW" }), bericht({ id: "msg-2", magazijnId: "kvk", afzender: "KVK" }), bericht({ id: "msg-3", magazijnId: "belastingdienst", afzender: "Belastingdienst" })];

const zichtbaar = (kiezer) => {
	const el = document.querySelector(kiezer);
	return !!el && !el.hidden;
};

/** De vlag zit in een cookie; de bron leest hem via de render-laag. */
function zetVlag(aan) {
	Object.defineProperty(document, "cookie", { value: aan ? "unhappy-flow=true" : "", configurable: true, writable: true });
}

/** Dwingt één scenario af; de bron dobbelt anders. */
function kiesScenario(naam) {
	const volgorde = { een: 0, geen: 1, later: 2 };
	vi.spyOn(Math, "random").mockReturnValue(volgorde[naam] / 3 + 0.01);
}

beforeEach(() => {
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		window.sessionStorage.clear();
	} catch (e) {
		/* niet beschikbaar */
	}
});

afterEach(() => {
	zetVlag(false);
	vi.restoreAllMocks();
});

describe("een magazijn dat bij het laden stil blijft", () => {
	it("laat het bericht weg én zegt dat", async () => {
		zetVlag(true);
		kiesScenario("een");
		bouwPagina(BERICHTEN);
		await laadBerichtenbox();
		await laatLaden();

		expect(rijen().map((r) => r.dataset.berichtId)).toEqual(["msg-2", "msg-3"]);
		expect(zichtbaar("[data-bron-onbereikbaar]")).toBe(true);
	});

	it("zegt bij 'geen' dat er niets opgehaald kon worden, en niet dat u geen berichten heeft", async () => {
		zetVlag(true);
		kiesScenario("geen");
		bouwPagina(BERICHTEN);
		await laadBerichtenbox();
		await laatLaden();

		expect(rijen()).toHaveLength(0);
		expect(zichtbaar("[data-geen-bronnen]")).toBe(true);
		expect(zichtbaar("[data-berichtenbox-empty]")).toBe(false);
	});

	it("laat het archief met rust", async () => {
		// De nabootsing gaat over wat er binnenkomt. Wat de bezoeker zelf heeft weggezet blijft van
		// hem — en op het archief staat geen enkel blok dat een gemis zou kunnen uitleggen.
		zetVlag(true);
		kiesScenario("geen");
		bouwPagina(BERICHTEN, {
			pad: "/moza/berichtenbox/berichtenbox-archief/",
			view: "archief",
			state: { gearchiveerd: { "msg-1": true, "msg-2": true } },
		});
		await laadBerichtenbox();
		await laatLaden();

		expect(
			rijen()
				.map((r) => r.dataset.berichtId)
				.sort()
		).toEqual(["msg-1", "msg-2"]);
	});
});

describe("een bron die ná het laden wegvalt", () => {
	it("meldt dat op het scherm, niet alleen in de lijst", async () => {
		// Zonder dit verdwijnt er een rij, zakken de tellers, en blijft het blok dat daar precies
		// voor in de template staat verborgen.
		zetVlag(true);
		kiesScenario("later");
		bouwPagina(BERICHTEN);

		// De klok moet nep zijn vóór het laden: plannUitval zet zijn timer tijdens start().
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		await laadBerichtenbox();
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(0);

		expect(rijen()).toHaveLength(3);
		expect(zichtbaar("[data-bron-uitval]")).toBe(false);

		await vi.advanceTimersByTimeAsync(13000);

		expect(rijen().length).toBeLessThan(3);
		expect(zichtbaar("[data-bron-uitval]")).toBe(true);
		expect(document.querySelector("[data-bron-uitval-naam]").textContent).toBeTruthy();
		vi.useRealTimers();
	}, 20000);
});

describe("de detailpagina van een bericht waarvan de bron wegviel", () => {
	it("verbergt de inhoud en zegt waarom", async () => {
		// De stand komt uit de lading. Draaide deze controle vóór dat moment, dan wist de pagina van
		// niets en las de bezoeker een bericht waarvan de inbox zegt dat de bron weg is.
		zetVlag(true);
		kiesScenario("later");
		window.sessionStorage.setItem("berichtenbox-bron-uitval", JSON.stringify({ id: "rdw", naam: "RDW" }));
		bouwDetailPagina(BERICHTEN[0]);

		await laadBerichtenbox();
		await laatLaden();

		expect(zichtbaar("[data-bericht-onbeschikbaar]")).toBe(true);
		expect(zichtbaar(".berichtenbox-detail-body")).toBe(false);
	});

	it("toont een bericht van een bron die het wél doet", async () => {
		zetVlag(true);
		kiesScenario("later");
		window.sessionStorage.setItem("berichtenbox-bron-uitval", JSON.stringify({ id: "rdw", naam: "RDW" }));
		bouwDetailPagina(BERICHTEN[1]);

		await laadBerichtenbox();
		await laatLaden();

		expect(zichtbaar("[data-bericht-onbeschikbaar]")).toBe(false);
		expect(zichtbaar(".berichtenbox-detail-body")).toBe(true);
	});
});

describe("een zoekopdracht zonder resultaat tijdens een storing", () => {
	it("legt de lege lijst uit met het filter, niet met de storing", async () => {
		zetVlag(true);
		kiesScenario("een");
		bouwPagina(BERICHTEN);
		await laadBerichtenbox();
		await laatLaden();

		const zoek = document.querySelector("[data-berichtenbox-search-input]");
		zoek.value = "zzzzz";
		zoek.dispatchEvent(new window.Event("input", { bubbles: true }));
		await laatLaden();

		expect(rijen()).toEqual([]);
		// De bezoeker tikte een woord in dat nergens voorkomt. Dát is waarom er niets staat — niet
		// dat de RDW plat ligt. Zonder deze uitzondering onderdrukt de storing de lege staat en
		// leest hij een verklaring die niets met zijn handeling te maken heeft.
		expect(zichtbaar("[data-berichtenbox-empty]")).toBe(true);
	});

	it("laat de storing wél de lege lijst verklaren zonder zoekterm", async () => {
		zetVlag(true);
		kiesScenario("geen");
		bouwPagina(BERICHTEN);
		await laadBerichtenbox();
		await laatLaden();

		expect(rijen()).toEqual([]);
		// Nu is de storing wél de reden, en zou "u heeft nog geen berichten" ernaast onwaar zijn.
		expect(zichtbaar("[data-berichtenbox-empty]")).toBe(false);
	});
});
