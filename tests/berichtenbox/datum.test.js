import { describe, it, expect, vi, afterEach } from "vitest";
import { datumNL } from "../../assets/javascript/berichtenbox/datum.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("datumNL", () => {
	it("schrijft de maand voluit, zoals de schrijfwijzer vraagt", () => {
		expect(datumNL("2026-02-12")).toBe("12 februari 2026");
	});

	it("laat de dag zonder voorloopnul zien", () => {
		expect(datumNL("2026-03-01")).toBe("1 maart 2026");
	});

	it("leest dag, maand en jaar uit de tekst", () => {
		// new Date("2026-03-01") leest een kale datum als UTC; in een westelijke tijdzone wordt dat
		// 28 februari. Deze test kan dat op een Europese machine niet aantonen — hij legt vast dat
		// de uitvoer letterlijk de invoer volgt, ook op de randen van het jaar.
		expect(datumNL("2026-01-01")).toBe("1 januari 2026");
		expect(datumNL("2026-03-01")).toBe("1 maart 2026");
		expect(datumNL("2026-12-31")).toBe("31 december 2026");
	});

	it("laat een lege datum leeg", () => {
		expect(datumNL("")).toBe("");
	});

	it("noemt een onbruikbare datum onbekend in plaats van 'Invalid Date'", () => {
		expect(datumNL("geen datum")).toBe("Onbekende datum");
	});

	it("weigert een maand buiten 1-12 en meldt dat", () => {
		const waarschuwing = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(datumNL("2026-13-01")).toBe("Onbekende datum");
		expect(waarschuwing).toHaveBeenCalled();
	});

	it("verzint geen 31 februari", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(datumNL("2026-02-31")).toBe("Onbekende datum");
	});

	it("laat 29 februari in een schrikkeljaar staan", () => {
		expect(datumNL("2028-02-29")).toBe("29 februari 2028");
	});

	it("weigert een tijdstempel; de aanroeper kapt zelf af op tien tekens", () => {
		expect(datumNL("2026-02-12T09:30:00Z")).toBe("Onbekende datum");
	});
});
