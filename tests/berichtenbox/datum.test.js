import { describe, it, expect } from "vitest";
import { datumNL } from "../../assets/javascript/berichtenbox/datum.js";

describe("datumNL", () => {
	it("schrijft de maand voluit, zoals de schrijfwijzer vraagt", () => {
		expect(datumNL("2026-02-12")).toBe("12 februari 2026");
	});

	it("laat de dag zonder voorloopnul zien", () => {
		expect(datumNL("2026-03-01")).toBe("1 maart 2026");
	});

	it("verschuift niet over een tijdzonegrens", () => {
		// Met new Date("2026-03-01") zou dit in een westelijke tijdzone 28 februari worden.
		expect(datumNL("2026-03-01")).toBe("1 maart 2026");
	});

	it("laat een lege datum leeg", () => {
		expect(datumNL("")).toBe("");
	});

	it("noemt een onbruikbare datum onbekend in plaats van 'Invalid Date'", () => {
		expect(datumNL("geen datum")).toBe("Onbekende datum");
	});

	it("weigert een maand buiten 1-12", () => {
		expect(datumNL("2026-13-01")).toBe("Onbekende datum");
	});

	it("weigert een tijdstempel; de aanroeper kapt zelf af op tien tekens", () => {
		expect(datumNL("2026-02-12T09:30:00Z")).toBe("Onbekende datum");
	});
});
