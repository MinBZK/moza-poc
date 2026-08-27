// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bouwPagina, bericht, laadBerichtenbox, laatLaden, rijen, tekstVan } from "./dom.js";

let fouten;

beforeEach(() => {
	fouten = vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

async function laad(berichten, opties) {
	bouwPagina(berichten, opties);
	await laadBerichtenbox();
	await laatLaden();
}

describe("berichtenbox.js — laden", () => {
	it("laadt zonder fouten op een pagina met berichten", async () => {
		await laad([bericht(), bericht({ afzender: "Belastingdienst", magazijnId: "belastingdienst" })]);
		expect(fouten).not.toHaveBeenCalled();
	});

	it("stopt netjes als de dataset ontbreekt", async () => {
		bouwPagina([bericht()]);
		delete window.berichtenboxData;
		await laadBerichtenbox();
		await laatLaden();
		expect(rijen()).toHaveLength(0);
	});
});

describe("berichtenbox.js — rijen komen uit de datalaag", () => {
	it("bouwt een rij per bericht, ook al was de tbody leeg", async () => {
		await laad([bericht({ onderwerp: "Aanslag" }), bericht({ onderwerp: "Subsidie" })]);
		expect(rijen()).toHaveLength(2);
	});

	it("zet afzender, onderwerp en datum in de rij", async () => {
		await laad([bericht({ afzender: "Gemeente Utrecht", onderwerp: "Aanslag", datum: "2026-02-12" })]);
		const rij = rijen()[0];
		expect(rij.querySelector(".berichtenbox-row-sender").textContent).toContain("Gemeente Utrecht");
		expect(rij.querySelector(".berichtenbox-row-subject").textContent).toContain("Aanslag");
		expect(rij.querySelector(".berichtenbox-row-date").textContent).toBe("12 februari 2026");
	});

	it("linkt naar de statische detailpagina van het bericht", async () => {
		await laad([bericht({ id: "msg-0042" })]);
		const link = rijen()[0].querySelector(".berichtenbox-row-subject a");
		expect(link.getAttribute("href")).toBe("/moza/berichtenbox/bericht/msg-0042/");
	});

	it("markeert een ongelezen bericht", async () => {
		await laad([bericht({ isOngelezen: true }), bericht({ isOngelezen: false })]);
		expect(rijen()[0].classList.contains("is-unread")).toBe(true);
		expect(rijen()[1].classList.contains("is-unread")).toBe(false);
	});

	it("telt de berichten en de bronnen boven de lijst", async () => {
		await laad([
			bericht({ magazijnId: "gemeente", afzender: "Gemeente Utrecht" }),
			bericht({ magazijnId: "belastingdienst", afzender: "Belastingdienst" }),
			bericht({ magazijnId: "belastingdienst", afzender: "Belastingdienst" }),
		]);
		expect(tekstVan("[data-berichtenbox-counter-total]")).toBe("3");
		expect(tekstVan("[data-berichtenbox-sources]")).toBe("2");
	});

	it("laat een gearchiveerd bericht niet in de inbox staan", async () => {
		const blijft = bericht({ onderwerp: "Blijft" });
		const weg = bericht({ onderwerp: "Weg" });
		await laad([blijft, weg], { state: { eersteBezoekGehad: true, gearchiveerd: { [weg.id]: true } } });
		const zichtbaar = rijen().filter((rij) => !rij.hidden);
		expect(zichtbaar).toHaveLength(1);
		expect(zichtbaar[0].querySelector(".berichtenbox-row-subject").textContent).toContain("Blijft");
	});
});

describe("berichtenbox.js — filteren en pagineren via de datalaag", () => {
	it("toont alleen het venster van de eerste pagina", async () => {
		await laad(Array.from({ length: 25 }, () => bericht()));
		expect(rijen()).toHaveLength(10);
	});

	it("bouwt paginanavigatie bij meer dan één pagina", async () => {
		await laad(Array.from({ length: 25 }, () => bericht()));
		const nav = document.querySelector("[data-berichtenbox-pagination]");
		expect(nav.hidden).toBe(false);
	});

	it("verbergt de paginanavigatie bij één pagina", async () => {
		await laad([bericht(), bericht()]);
		expect(document.querySelector("[data-berichtenbox-pagination]").hidden).toBe(true);
	});

	it("filtert op de zoekterm", async () => {
		await laad([bericht({ onderwerp: "Aanslag" }), bericht({ onderwerp: "Subsidie" })]);
		const zoek = document.querySelector("[data-berichtenbox-search-input]");
		zoek.value = "subsid";
		zoek.dispatchEvent(new window.Event("input", { bubbles: true }));
		expect(rijen()).toHaveLength(1);
		expect(rijen()[0].querySelector(".berichtenbox-row-subject").textContent).toContain("Subsidie");
	});

	it("toont de lege staat als het filter niets oplevert", async () => {
		await laad([bericht({ onderwerp: "Aanslag" })]);
		const zoek = document.querySelector("[data-berichtenbox-search-input]");
		zoek.value = "bestaat niet";
		zoek.dispatchEvent(new window.Event("input", { bubbles: true }));
		expect(rijen()).toHaveLength(0);
		expect(document.querySelector("[data-berichtenbox-empty]").hidden).toBe(false);
	});

	it("haalt een gearchiveerd bericht meteen uit de lijst", async () => {
		await laad([bericht({ onderwerp: "Blijft" }), bericht({ onderwerp: "Gaat weg" })]);
		const weg = rijen().find((r) => r.textContent.includes("Gaat weg"));
		weg.querySelector('[data-row-actie="archiveren"]').click();
		expect(rijen()).toHaveLength(1);
		expect(rijen()[0].textContent).toContain("Blijft");
	});

	it("werkt de tellers bij na archiveren", async () => {
		await laad([bericht(), bericht()]);
		rijen()[0].querySelector('[data-row-actie="archiveren"]').click();
		expect(tekstVan("[data-berichtenbox-counter-total]")).toBe("1");
	});

	it("onthoudt een markering over een herrender heen", async () => {
		await laad([bericht(), bericht()]);
		const knop = rijen()[0].querySelector("[data-mark-toggle]");
		knop.click();
		expect(knop.classList.contains("is-marked")).toBe(true);
		const zoek = document.querySelector("[data-berichtenbox-search-input]");
		zoek.dispatchEvent(new window.Event("input", { bubbles: true }));
		expect(rijen()[0].querySelector("[data-mark-toggle]").classList.contains("is-marked")).toBe(true);
	});
});

describe("berichtenbox.js — sorteren via de datalaag", () => {
	function afzenders() {
		return rijen().map((r) => r.querySelector(".berichtenbox-row-sender").textContent.trim().replace(/^Ongelezen\.\s*/, ""));
	}

	it("sorteert oplopend op afzender en zet aria-sort", async () => {
		await laad([
			bericht({ afzender: "Zorginstituut", magazijnId: "zorg" }),
			bericht({ afzender: "Belastingdienst", magazijnId: "bd" }),
		]);
		const knop = document.querySelector('button[data-sort="afzender"]');
		knop.click();
		expect(afzenders()).toEqual(["Belastingdienst", "Zorginstituut"]);
		expect(knop.closest("th").getAttribute("aria-sort")).toBe("ascending");
	});

	it("draait de volgorde om bij een tweede klik", async () => {
		await laad([
			bericht({ afzender: "Zorginstituut", magazijnId: "zorg" }),
			bericht({ afzender: "Belastingdienst", magazijnId: "bd" }),
		]);
		const knop = document.querySelector('button[data-sort="afzender"]');
		knop.click();
		knop.click();
		expect(afzenders()).toEqual(["Zorginstituut", "Belastingdienst"]);
		expect(knop.closest("th").getAttribute("aria-sort")).toBe("descending");
	});

	it("sorteert de gefilterde lijst, niet de hele lijst", async () => {
		await laad([
			bericht({ afzender: "Zorginstituut", magazijnId: "zorg", onderwerp: "Aanslag" }),
			bericht({ afzender: "Belastingdienst", magazijnId: "bd", onderwerp: "Aanslag" }),
			bericht({ afzender: "Gemeente", magazijnId: "gem", onderwerp: "Subsidie" }),
		]);
		const zoek = document.querySelector("[data-berichtenbox-search-input]");
		zoek.value = "aanslag";
		zoek.dispatchEvent(new window.Event("input", { bubbles: true }));
		document.querySelector('button[data-sort="afzender"]').click();
		expect(afzenders()).toEqual(["Belastingdienst", "Zorginstituut"]);
	});

	it("gaat na sorteren terug naar pagina 1", async () => {
		await laad(Array.from({ length: 25 }, (_, i) => bericht({ onderwerp: "Bericht " + i })));
		document.querySelector('button[data-sort="onderwerp"]').click();
		expect(rijen()).toHaveLength(10);
	});
});

describe("berichtenbox.js — als er niets te tonen valt", () => {
	it("laat geen server-gerenderde rijen staan wanneer het renderen mislukt", async () => {
		// Een bericht zonder id laat createRij struikelen; dat is precies het geval waarin de
		// bezoeker anders naar rijen kijkt die de state negeren.
		await laad([bericht(), { magazijnId: "gem", afzender: "Gemeente", onderwerp: "Kapot" }]);
		expect(rijen()).toHaveLength(0);
		expect(document.querySelector("[data-berichtenbox-list]").hidden).toBe(true);
	});

	it("toont de melding wanneer het renderen mislukt", async () => {
		await laad([{ magazijnId: "gem", afzender: "Gemeente", onderwerp: "Kapot" }]);
		expect(document.querySelector("[data-geen-bronnen]").hidden).toBe(false);
	});

	it("zegt niet 'geen berichten' terwijl er een storing is", async () => {
		await laad([{ magazijnId: "gem", afzender: "Gemeente", onderwerp: "Kapot" }]);
		expect(document.querySelector("[data-berichtenbox-empty]").hidden).toBe(true);
	});

	it("toont de melding niet bij een geslaagde lading", async () => {
		await laad([bericht()]);
		expect(document.querySelector("[data-geen-bronnen]").hidden).toBe(true);
	});
});

describe("berichtenbox.js — details die de review ving", () => {
	it("laat een zojuist binnengekomen bericht invaden, en alleen dat bericht", async () => {
		vi.useFakeTimers();
		window.localStorage.setItem("feature:Dynamische berichten", "true");
		bouwPagina([bericht(), bericht()]);
		window.localStorage.setItem("feature:Dynamische berichten", "true");
		window.history.replaceState(null, "", "/moza/berichtenbox/?poll=5");
		await laadBerichtenbox();
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(5000);
		const nieuw = rijen().filter((r) => r.classList.contains("is-new"));
		expect(nieuw).toHaveLength(1);
		expect(nieuw[0]).toBe(rijen()[0]);
		vi.useRealTimers();
	});

	it("bouwt de rijen niet opnieuw bij een resize", async () => {
		await laad([bericht(), bericht()]);
		const eerste = rijen()[0];
		window.dispatchEvent(new window.Event("resize"));
		await new Promise((klaar) => setTimeout(klaar, 200));
		expect(rijen()[0]).toBe(eerste);
	});

	it("verbergt de lege staat meteen, nog voor de bron geladen is", async () => {
		bouwPagina([bericht()]);
		await laadBerichtenbox();
		expect(document.querySelector("[data-berichtenbox-empty]").hidden).toBe(true);
		await laatLaden();
	});
});

describe("berichtenbox.js — terugdraaien bij een mislukte render", () => {
	it("laat de vorige lijst staan als een latere bronwijziging niet te renderen is", async () => {
		vi.useFakeTimers();
		bouwPagina([bericht({ onderwerp: "Eerste" })]);
		window.localStorage.setItem("feature:Dynamische berichten", "true");
		window.history.replaceState(null, "", "/moza/berichtenbox/?poll=5");
		await laadBerichtenbox();
		await vi.advanceTimersByTimeAsync(0);
		expect(rijen()).toHaveLength(1);

		// Sloop createRij van binnenuit: een magazijn zonder naam levert een bericht zonder
		// afzender, en dat is nog te renderen. Een bericht zonder id niet.
		window.berichtenboxData.magazijnen[0].id = undefined;
		await vi.advanceTimersByTimeAsync(5000);

		// Wat er ook misging: er staat nog steeds een leesbare lijst of een melding, nooit allebei niet.
		const lijst = document.querySelector("[data-berichtenbox-list]");
		const melding = document.querySelector("[data-geen-bronnen]");
		expect(rijen().length > 0 || !melding.hidden || lijst.hidden).toBe(true);
		vi.useRealTimers();
	});
});
