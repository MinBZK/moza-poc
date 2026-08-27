// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bouwPagina, bericht, laadBerichtenbox, rijen, tekstVan } from "./dom.js";

let fouten;

beforeEach(() => {
	fouten = vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("berichtenbox.js — laden", () => {
	it("laadt zonder fouten op een pagina met berichten", async () => {
		bouwPagina([bericht(), bericht({ afzender: "Belastingdienst", magazijnId: "belastingdienst" })]);
		await laadBerichtenbox();
		expect(fouten).not.toHaveBeenCalled();
	});

	it("stopt netjes als de dataset ontbreekt", async () => {
		bouwPagina([bericht()]);
		delete window.berichtenboxData;
		await laadBerichtenbox();
		expect(rijen()).toHaveLength(0);
	});
});
