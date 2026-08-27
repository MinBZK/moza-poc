// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bouwDetailPagina, bericht, laadBerichtenbox, laatLaden } from "./dom.js";

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** localStorage die niets wegschrijft, zoals Safari-privémodus of een volle quota. */
function opslagWeigert(state = { eersteBezoekGehad: true }) {
	vi.stubGlobal("localStorage", {
		getItem: () => JSON.stringify(state),
		setItem: () => { throw new Error("QuotaExceededError"); },
		removeItem: () => {},
		clear: () => {},
	});
}

describe("detailpagina — acties die niet bewaard kunnen worden", () => {
	it("navigeert niet weg als het archiveren niet bewaard is", async () => {
		const b = bericht();
		bouwDetailPagina(b);
		opslagWeigert();
		await laadBerichtenbox();
		await laatLaden();

		const voor = window.location.href;
		document.querySelector('[data-actie="archiveren"]').click();

		// Wegnavigeren zou de bezoeker op een inbox zetten waar het bericht onaangeroerd staat,
		// zonder dat de melding daar nog te lezen is.
		expect(window.location.href).toBe(voor);
	});

	it("zegt zichtbaar dat de wijziging niet bewaard is", async () => {
		const b = bericht();
		bouwDetailPagina(b);
		opslagWeigert();
		await laadBerichtenbox();
		await laatLaden();

		document.querySelector('[data-actie="archiveren"]').click();

		const melding = document.querySelector("[data-berichtenbox-storing]");
		expect(melding.hidden).toBe(false);
		expect(melding.textContent).toContain("niet bewaard");
	});

	it("laat de melding staan zolang de acties blijven mislukken", async () => {
		const b = bericht();
		bouwDetailPagina(b);
		opslagWeigert();
		await laadBerichtenbox();
		await laatLaden();

		document.querySelector('[data-actie="archiveren"]').click();
		document.querySelector('[data-actie="verwijderen"]').click();

		// Eén melding volstaat, maar hij mag niet verdwijnen zolang de situatie voortduurt.
		expect(document.querySelector("[data-berichtenbox-storing]").hidden).toBe(false);
		expect(window.location.href).toContain("/bericht/");
	});
});

describe("detailpagina — als er geen meldingsblok is", () => {
	it("laat een spoor in de console achter in plaats van te zwijgen", async () => {
		const b = bericht();
		bouwDetailPagina(b, { metStoringsblok: false });
		opslagWeigert();
		await laadBerichtenbox();
		await laatLaden();

		const fouten = vi.spyOn(console, "error").mockImplementation(() => {});
		document.querySelector('[data-actie="archiveren"]').click();
		expect(fouten).toHaveBeenCalledWith(expect.stringContaining("blijft onzichtbaar"));
	});
});

describe("detailpagina — de gewone gang van zaken", () => {
	it("laat de melding met rust als alles goed gaat", async () => {
		const b = bericht();
		bouwDetailPagina(b);
		await laadBerichtenbox();
		await laatLaden();
		expect(document.querySelector("[data-berichtenbox-storing]").hidden).toBe(true);
	});
});
