// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bouwDetailPagina, bericht, laadBerichtenbox, laatLaden } from "./dom.js";

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** localStorage die niets wegschrijft, zoals Safari-privémodus of een volle quota. */
function opslagWeigert(state = { eersteBezoekGehad: true }) {
	vi.stubGlobal("localStorage", {
		getItem: () => JSON.stringify(state),
		setItem: () => {
			throw new Error("QuotaExceededError");
		},
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

		document.querySelector('[data-actie="archiveren"]').click();

		// jsdom voert `location.href = …` niet uit, dus window.location.href controleren bewijst
		// niets — precies waarom deze fout vier reviewrondes overleefde. berichtenbox.js legt vast
		// waarheen het wilde navigeren; dat is wél waarneembaar.
		expect(window.Berichtenbox.navigatieDoel()).toBe(null);
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
		expect(window.Berichtenbox.navigatieDoel()).toBe(null);
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

describe("detailpagina — als het bewaren wel lukt", () => {
	it("navigeert dan naar de berichtenbox", async () => {
		const b = bericht();
		bouwDetailPagina(b);
		await laadBerichtenbox();
		await laatLaden();

		document.querySelector('[data-actie="archiveren"]').click();
		expect(window.Berichtenbox.navigatieDoel()).toBe("/moza/berichtenbox/");
	});

	it("zet de markeerknop niet om als het bewaren mislukt", async () => {
		const b = bericht();
		bouwDetailPagina(b);
		opslagWeigert();
		await laadBerichtenbox();
		await laatLaden();

		const knop = document.querySelector('[data-actie="markeren"]');
		knop.click();
		// Anders toont de knop "gemarkeerd" terwijl de melding eronder zegt dat er niets bewaard is.
		expect(knop.getAttribute("aria-pressed")).toBe("false");
	});

	it("draait de state terug als het bewaren mislukt", async () => {
		const b = bericht();
		bouwDetailPagina(b);
		opslagWeigert();
		await laadBerichtenbox();
		await laatLaden();

		document.querySelector('[data-actie="archiveren"]').click();
		// Geheugen, scherm en opslag horen hetzelfde te zeggen.
		expect(window.Berichtenbox.statusVan(b.id)).toBe("inbox");
	});
});

/**
 * Waar staat dit bericht? Op een detailpagina was dat niet te zien: het kruimelpad zei "Berichtenbox"
 * en verder niets, terwijl hetzelfde bericht in de inbox, het archief of de prullenbak kan staan.
 * De status komt uit de bewaarde staat, dus het sjabloon kan het niet weten en JavaScript zet het.
 */
describe("detailpagina — de map in het kruimelpad", () => {
	const kruimel = () => document.querySelector("[data-berichtenbox-map-kruimel] a");

	async function toonBericht(b, state) {
		bouwDetailPagina(b, state ? { state } : {});
		await laadBerichtenbox();
		await laatLaden();
	}

	it("zegt Inbox voor een bericht dat niemand verplaatst heeft", async () => {
		const b = bericht();
		await toonBericht(b);

		expect(kruimel().textContent).toBe("Inbox");
		expect(kruimel().getAttribute("href")).toBe("/moza/berichtenbox/");
	});

	it("zegt Archief voor een gearchiveerd bericht, en linkt daarheen", async () => {
		const b = bericht();
		await toonBericht(b, { gearchiveerd: { [b.id]: true } });

		expect(kruimel().textContent).toBe("Archief");
		expect(kruimel().getAttribute("href")).toBe("/moza/berichtenbox/berichtenbox-archief/");
	});

	it("zegt Prullenbak voor een weggegooid bericht", async () => {
		const b = bericht();
		await toonBericht(b, { verwijderd: { [b.id]: true } });

		expect(kruimel().textContent).toBe("Prullenbak");
		expect(kruimel().getAttribute("href")).toBe("/moza/berichtenbox/berichtenbox-prullenbak/");
	});

	it("houdt de prullenbak aan als een bericht ook gearchiveerd is", async () => {
		// Dezelfde voorrang als statusVan; anders wijst het kruimelpad naar het archief, waar het
		// bericht niet meer staat.
		const b = bericht();
		await toonBericht(b, { gearchiveerd: { [b.id]: true }, verwijderd: { [b.id]: true } });

		expect(kruimel().textContent).toBe("Prullenbak");
	});

	it("noemt de eigen map van de bezoeker, met het filter in de link", async () => {
		// Een eigen map is geen aparte pagina maar een filter op de inbox.
		const b = bericht();
		await toonBericht(b, { mapOverride: { [b.id]: "belastingen-2025" } });

		expect(kruimel().textContent).toBe("Belastingen 2025");
		expect(kruimel().getAttribute("href")).toBe("/moza/berichtenbox/?map=belastingen-2025");
	});

	it("laat het sjabloon staan als het bericht onbekend is", async () => {
		// Zonder JavaScript staat er "Inbox", en dat blijft het eerlijkste antwoord zolang we niets
		// beters weten. Een lege kruimel zou een gat in het pad slaan.
		const b = bericht();
		bouwDetailPagina(b);
		document.querySelector(".berichtenbox-content").dataset.berichtId = "bestaat-niet";
		await laadBerichtenbox();
		await laatLaden();

		expect(kruimel().textContent).toBe("Inbox");
	});
});
