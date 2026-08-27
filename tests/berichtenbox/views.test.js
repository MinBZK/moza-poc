// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bouwPagina, bericht, laadBerichtenbox, laatLaden, rijen, kolommen } from "./dom.js";

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
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

describe("archief", () => {
	it("toont alleen gearchiveerde berichten", async () => {
		const a = bericht({ onderwerp: "Gearchiveerd" });
		const b = bericht({ onderwerp: "In de inbox" });
		await laad([a, b], {
			pad: "/moza/berichtenbox/berichtenbox-archief/",
			view: "archief",
			state: { eersteBezoekGehad: true, gearchiveerd: { [a.id]: true } },
		});
		expect(rijen()).toHaveLength(1);
		expect(rijen()[0].textContent).toContain("Gearchiveerd");
	});

	it("verbergt de tabel en toont de lege staat als het archief leeg is", async () => {
		await laad([bericht()], { pad: "/moza/berichtenbox/berichtenbox-archief/", view: "archief" });
		expect(document.querySelector("[data-berichtenbox-list]").hidden).toBe(true);
		expect(document.querySelector("[data-berichtenbox-empty]").hidden).toBe(false);
	});
});

describe("prullenbak", () => {
	it("toont alleen verwijderde berichten", async () => {
		const a = bericht({ onderwerp: "Weggegooid" });
		const b = bericht({ onderwerp: "In de inbox" });
		await laad([a, b], {
			pad: "/moza/berichtenbox/berichtenbox-prullenbak/",
			view: "prullenbak",
			state: { eersteBezoekGehad: true, verwijderd: { [a.id]: true } },
		});
		expect(rijen()).toHaveLength(1);
		expect(rijen()[0].textContent).toContain("Weggegooid");
	});

	it("laat een gearchiveerd bericht niet in de prullenbak zien", async () => {
		const a = bericht();
		await laad([a], {
			pad: "/moza/berichtenbox/berichtenbox-prullenbak/",
			view: "prullenbak",
			state: { eersteBezoekGehad: true, gearchiveerd: { [a.id]: true } },
		});
		expect(rijen()).toHaveLength(0);
	});
});

describe("Belastingdienst-portaal", () => {
	it("toont standaard alleen berichten van de Belastingdienst", async () => {
		await laad([
			bericht({ magazijnId: "belastingdienst", afzender: "Belastingdienst" }),
			bericht({ magazijnId: "gemeente", afzender: "Gemeente Utrecht" }),
		], { pad: "/mijn-belastingdienst/berichtenbox/", view: "inbox" });
		expect(rijen()).toHaveLength(1);
		expect(rijen()[0].textContent).toContain("Belastingdienst");
	});
});

describe("regressies uit de review", () => {
	it("filtert het archief niet op het organisatiefilter van het portaal", async () => {
		const a = bericht({ magazijnId: "gemeente", afzender: "Gemeente Utrecht" });
		await laad([a], {
			pad: "/mijn-belastingdienst/berichtenbox/berichtenbox-archief/",
			view: "archief",
			state: { eersteBezoekGehad: true, gearchiveerd: { [a.id]: true } },
		});
		// Het org-filter hoort alleen over de inbox te gaan; wat je archiveert blijft je archief.
		expect(rijen()).toHaveLength(1);
	});

	it("filtert het archief niet op persona-relevantie", async () => {
		const a = bericht({ relevantVoor: ["iemand-anders"] });
		await laad([a], {
			pad: "/moza/berichtenbox/berichtenbox-archief/",
			view: "archief",
			state: { eersteBezoekGehad: true, gearchiveerd: { [a.id]: true } },
		});
		expect(rijen()).toHaveLength(1);
	});
});

describe("tellers en lijst horen hetzelfde te zeggen", () => {
	it("telt in het archief wat er ook echt staat", async () => {
		const a = bericht();
		const b = bericht();
		await laad([a, b], {
			pad: "/moza/berichtenbox/berichtenbox-archief/",
			view: "archief",
			// Zowel gearchiveerd als verwijderd: de prullenbak wint, dus dit hoort níet mee te tellen.
			state: {
				eersteBezoekGehad: true,
				gearchiveerd: { [a.id]: true, [b.id]: true },
				verwijderd: { [b.id]: true },
			},
		});
		expect(rijen()).toHaveLength(1);
		expect(document.querySelector("[data-berichtenbox-counter-total]").textContent).toBe("1");
	});

	it("laat het RDW-waarschuwingsblok met rust bij een gewone lading", async () => {
		await laad([bericht()], { pad: "/moza/berichtenbox/", view: "inbox" });
		expect(document.querySelector("[data-bron-onbereikbaar]").hidden).toBe(true);
	});
});

describe("kolommen", () => {
	it("bouwt in de inbox evenveel cellen als er koppen zijn", async () => {
		await laad([bericht()], { pad: "/moza/berichtenbox/", view: "inbox" });
		const { koppen, cellen } = kolommen();
		expect(cellen).toBe(koppen);
	});

	it("bouwt in het archief evenveel cellen als er koppen zijn", async () => {
		const a = bericht();
		await laad([a], {
			pad: "/moza/berichtenbox/berichtenbox-archief/",
			view: "archief",
			state: { eersteBezoekGehad: true, gearchiveerd: { [a.id]: true } },
		});
		const { koppen, cellen } = kolommen();
		expect(cellen).toBe(koppen);
	});
});

describe("meldingen horen bij de juiste weergave", () => {
	it("toont de gesimuleerde bronwaarschuwing niet op het archief", async () => {
		// unhappy-flow aan: op de inbox mag die melding, op het archief niet — dat toont wat de
		// bezoeker zelf heeft weggezet en heeft niets met ophalen te maken.
		const a = bericht();
		bouwPagina([a], {
			pad: "/moza/berichtenbox/berichtenbox-archief/",
			view: "archief",
			state: { eersteBezoekGehad: true, gearchiveerd: { [a.id]: true } },
		});
		document.cookie = "unhappy-flow=true";
		await laadBerichtenbox();
		await laatLaden();
		expect(document.querySelector("[data-berichtenbox-storing]").hidden).toBe(true);
		expect(rijen()).toHaveLength(1);
		document.cookie = "unhappy-flow=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
	});
});
