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

	it("stopt netjes als de dataset ontbreekt en laat de server-rijen staan", async () => {
		// Ontbrekende dataset is een bouwfout, geen bezoekersfout. Het script stopt en laat staan wat
		// Eleventy heeft gerenderd — precies wat een bezoeker zonder JavaScript ook ziet.
		bouwPagina([bericht(), bericht()]);
		delete window.berichtenboxData;
		await laadBerichtenbox();
		await laatLaden();
		expect(rijen()).toHaveLength(2);
		expect(fouten).toHaveBeenCalled();
	});

	it("vervangt de server-gerenderde rijen door die uit de datalaag", async () => {
		bouwPagina([bericht({ onderwerp: "Van de server" })]);
		const voor = rijen()[0];
		await laadBerichtenbox();
		await laatLaden();
		// Zelfde bericht, andere rij: de datalaag heeft hem opnieuw opgebouwd.
		expect(rijen()).toHaveLength(1);
		expect(rijen()[0]).not.toBe(voor);
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
	it("laat één onbruikbaar bericht de rest niet meeslepen", async () => {
		// Een bericht zonder id laat createRij struikelen: geen sleutel voor de state, geen link
		// naar een detailpagina. De rest blijft staan.
		await laad([bericht({ onderwerp: "Gewoon bericht" }), { magazijnId: "gem", afzender: "Gemeente", onderwerp: "Kapot" }]);
		expect(rijen()[0].textContent).toContain("Gewoon bericht");
		expect(document.querySelector("[data-berichtenbox-storing]").hidden).toBe(true);
	});

	it("laat een zichtbaar gat achter zodat de teller niet liegt", async () => {
		await laad([bericht({ onderwerp: "Gewoon bericht" }), { magazijnId: "gem", afzender: "Gemeente", onderwerp: "Kapot" }]);
		const gat = document.querySelector(".is-unreadable");
		expect(gat).not.toBe(null);
		expect(gat.textContent).toContain("niet te tonen");
		// Twee berichten geteld, twee rijen op het scherm: de een is een gat, maar geen leugen.
		expect(tekstVan("[data-berichtenbox-counter-total]")).toBe("2");
		expect(rijen()).toHaveLength(2);
	});

	it("toont de melding als er niets van de lijst overeind blijft", async () => {
		await laad([{ magazijnId: "gem", afzender: "Gemeente", onderwerp: "Kapot" }]);
		expect(rijen()).toHaveLength(0);
		expect(document.querySelector("[data-berichtenbox-list]").hidden).toBe(true);
		expect(document.querySelector("[data-berichtenbox-storing]").hidden).toBe(false);
	});

	it("zegt niet 'geen berichten' terwijl er een storing is", async () => {
		await laad([{ magazijnId: "gem", afzender: "Gemeente", onderwerp: "Kapot" }]);
		expect(document.querySelector("[data-berichtenbox-empty]").hidden).toBe(true);
	});

	it("laat geen onafgevangen fout ontsnappen als het renderen mislukt", async () => {
		const ontsnapt = [];
		const vangnet = (e) => ontsnapt.push(e);
		window.addEventListener("unhandledrejection", vangnet);
		window.addEventListener("error", vangnet);
		await laad([{ magazijnId: "gem", afzender: "Gemeente", onderwerp: "Kapot" }]);
		window.removeEventListener("unhandledrejection", vangnet);
		window.removeEventListener("error", vangnet);
		expect(ontsnapt).toHaveLength(0);
	});

	it("toont de melding niet bij een geslaagde lading", async () => {
		await laad([bericht()]);
		expect(document.querySelector("[data-berichtenbox-storing]").hidden).toBe(true);
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

		// Precies één van beide: een zichtbare lijst, of een melding. Als disjunctie geschreven zou
		// deze test blijven slagen terwijl de helft ervan wegviel.
		const lijst = document.querySelector("[data-berichtenbox-list]");
		const melding = document.querySelector("[data-berichtenbox-storing]");
		const lijstZichtbaar = !lijst.hidden && rijen().length > 0;

		if (lijstZichtbaar) {
			expect(melding.hidden).toBe(true);
		} else {
			expect(melding.hidden).toBe(false);
		}
		vi.useRealTimers();
	});
});

describe("berichtenbox.js — herstel na een storing", () => {
	it("laat na een mislukte lading geen lege witte pagina achter", async () => {
		// Alle berichten onbruikbaar: er valt niets te tonen. Dan hoort er een melding te staan,
		// niet een verborgen tabel zonder uitleg.
		await laad([{ magazijnId: "gem", afzender: "Gemeente", onderwerp: "Kapot" }]);
		const lijst = document.querySelector("[data-berichtenbox-list]");
		const melding = document.querySelector("[data-berichtenbox-storing]");
		expect(lijst.hidden).toBe(true);
		expect(melding.hidden).toBe(false);
	});

	it("haalt de melding weg zodra er weer een lijst staat", async () => {
		await laad([bericht({ onderwerp: "Werkt" }), { magazijnId: "gem", afzender: "Gemeente", onderwerp: "Kapot" }]);
		// Filter op het bericht dat wél te renderen is: dan is er weer een volledige lijst.
		const zoek = document.querySelector("[data-berichtenbox-search-input]");
		zoek.value = "werkt";
		zoek.dispatchEvent(new window.Event("input", { bubbles: true }));
		expect(document.querySelector("[data-berichtenbox-storing]").hidden).toBe(true);
		expect(document.querySelector("[data-berichtenbox-list]").hidden).toBe(false);
	});
});

describe("berichtenbox.js — een mislukte lading blijft een mislukte lading", () => {
	// Een null in de lijst laat render() struikelen; dat rolt terug, wordt doorgegooid en komt in
	// de .catch terecht. Dat is het pad waar de lading zelf mislukt, niet één rij.
	async function metMislukteLading() {
		bouwPagina([bericht(), bericht()]);
		window.berichtenboxData.berichten.push(null);
		await laadBerichtenbox();
		await laatLaden();
	}

	it("zegt niet 'u heeft geen berichten' onder de storingsmelding", async () => {
		await metMislukteLading();
		expect(document.querySelector("[data-berichtenbox-storing]").hidden).toBe(false);
		expect(document.querySelector("[data-berichtenbox-empty]").hidden).toBe(true);
	});

	it("laat een latere filteractie de melding niet wegpoetsen", async () => {
		await metMislukteLading();
		const zoek = document.querySelector("[data-berichtenbox-search-input]");
		zoek.value = "wat dan ook";
		zoek.dispatchEvent(new window.Event("input", { bubbles: true }));
		expect(document.querySelector("[data-berichtenbox-storing]").hidden).toBe(false);
		expect(document.querySelector("[data-berichtenbox-empty]").hidden).toBe(true);
	});

	it("speelt geen ophaalanimatie voor een lading die al mislukt is", async () => {
		bouwPagina([bericht()], { state: { eersteBezoekGehad: false } });
		window.berichtenboxData.berichten.push(null);
		await laadBerichtenbox();
		await laatLaden();
		expect(document.querySelector("[data-berichtenbox-progress]").hidden).toBe(true);
		expect(document.querySelector("[data-berichtenbox-list]").hidden).toBe(true);
	});
});

describe("berichtenbox.js — de bezoeker hoort het als bewaren niet lukt", () => {
	it("meldt zichtbaar dat een archivering niet bewaard is", async () => {
		bouwPagina([bericht(), bericht()]);

		// Opslag die niet schrijft, zoals in Safari-privémodus of bij een volle quota. Vóór het
		// laden gezet: berichtenbox.js pakt de opslag één keer, bij het opzetten van de state.
		vi.stubGlobal("localStorage", {
			getItem: () => JSON.stringify({ eersteBezoekGehad: true }),
			setItem: () => { throw new Error("QuotaExceededError"); },
			removeItem: () => {},
			clear: () => {},
		});

		await laadBerichtenbox();
		await laatLaden();

		rijen()[0].querySelector('[data-row-actie="archiveren"]').click();

		const melding = document.querySelector("[data-berichtenbox-storing]");
		expect(melding.hidden).toBe(false);
		expect(melding.textContent).toContain("niet bewaard");
		vi.unstubAllGlobals();
	});
});
