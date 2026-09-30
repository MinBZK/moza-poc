// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bouwPagina, bericht, laadBerichtenbox, laatLaden, rijen, kolommen } from "./dom.js";

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
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
		await laad([bericht({ magazijnId: "belastingdienst", afzender: "Belastingdienst" }), bericht({ magazijnId: "gemeente", afzender: "Gemeente Utrecht" })], { pad: "/mijn-belastingdienst/berichtenbox/", view: "inbox" });
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
	it("toont op het archief geen storing van de gesimuleerde bronuitval", async () => {
		// unhappy-flow aan: op de inbox mag die melding, op het archief niet — dat toont wat de
		// bezoeker zelf heeft weggezet en heeft niets met ophalen te maken.
		const a = bericht();
		bouwPagina([a], {
			pad: "/moza/berichtenbox/berichtenbox-archief/",
			view: "archief",
			state: { eersteBezoekGehad: true, gearchiveerd: { [a.id]: true } },
		});
		document.cookie = "unhappy-flow=true";
		// Het scenario wordt willekeurig gekozen; alleen "geen" blokkeert élk magazijn en zou de
		// regressie zichtbaar maken. Zonder vastzetten vangt deze test hem in één op de drie runs.
		vi.spyOn(Math, "random").mockReturnValue(0);
		await laadBerichtenbox();
		await laatLaden();
		expect(document.querySelector("[data-berichtenbox-storing]").hidden).toBe(true);
		expect(rijen()).toHaveLength(1);
		document.cookie = "unhappy-flow=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
	});
});

describe("organisatie-schakelaar van het Belastingdienst-portaal", () => {
	it("springt terug als de keuze niet bewaard kan worden", async () => {
		bouwPagina([bericht({ magazijnId: "belastingdienst", afzender: "Belastingdienst" })], {
			pad: "/mijn-belastingdienst/berichtenbox/",
			view: "inbox",
			orgSchakelaar: true,
		});
		vi.stubGlobal("localStorage", {
			getItem: (k) => (k === "feature:Berichten van andere organisaties" ? "true" : JSON.stringify({ eersteBezoekGehad: true })),
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
			removeItem: () => {},
			clear: () => {},
		});
		await laadBerichtenbox();
		await laatLaden();

		const schakelaar = document.querySelector("[data-berichtenbox-org-toggle]");
		schakelaar.checked = true;
		schakelaar.dispatchEvent(new window.Event("change", { bubbles: true }));

		// Anders staan de berichten van andere organisaties op het scherm terwijl de melding
		// eronder zegt dat er niets bewaard is, en zijn ze na het verversen weg.
		expect(schakelaar.checked).toBe(false);
		expect(document.querySelector("[data-berichtenbox-storing]").hidden).toBe(false);
	});
});

describe("lege staat op archief en prullenbak", () => {
	it("blijft staan als de unhappy-flow-vlag aan staat", async () => {
		// Die vlag gaat over het ophalen bij bronnen; archief en prullenbak hebben er niets mee, en
		// hebben ook geen blok dat een lege lijst zou verklaren. Onderdrukken laat daar een lege
		// pagina zonder woorden achter.
		document.cookie = "unhappy-flow=true";
		bouwPagina([bericht()], {
			pad: "/moza/berichtenbox/berichtenbox-archief/",
			view: "archief",
		});
		vi.spyOn(Math, "random").mockReturnValue(0);
		await laadBerichtenbox();
		await laatLaden();

		expect(rijen()).toHaveLength(0);
		expect(document.querySelector("[data-berichtenbox-empty]").hidden).toBe(false);
		document.cookie = "unhappy-flow=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
	});
});
