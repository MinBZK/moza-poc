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

/**
 * Een bericht in de prullenbak is al verwijderd. De knop die daar "Verwijderen" heet, hoort de weg
 * terug te bieden: hij zet het bericht terug in de inbox. Zonder dat is weggooien onomkeerbaar, en
 * dat is het in een prullenbak per definitie niet.
 */
describe("detailpagina — verwijderen ongedaan maken", () => {
	const verwijderKnop = () => document.querySelector('[data-actie="verwijderen"]');

	async function toonBericht(b, state) {
		bouwDetailPagina(b, state ? { state } : {});
		await laadBerichtenbox();
		await laatLaden();
	}

	it("noemt de knop Terugzetten in inbox als het bericht in de prullenbak staat", async () => {
		const b = bericht();
		await toonBericht(b, { verwijderd: { [b.id]: true } });

		expect(verwijderKnop().textContent).toContain("Terugzetten in inbox");
	});

	it("houdt Verwijderen als het bericht gewoon in de inbox staat", async () => {
		const b = bericht();
		await toonBericht(b);

		expect(verwijderKnop().textContent).toContain("Verwijderen");
	});

	it("ruilt de prullenbak in voor het berichtenbox-icoon", async () => {
		// Een prullenbak naast "Terugzetten in inbox" zegt het tegenovergestelde van wat er gebeurt.
		const b = bericht();
		await toonBericht(b, { verwijderd: { [b.id]: true } });

		const svg = verwijderKnop().querySelector("svg");
		expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
		expect(verwijderKnop().querySelectorAll("svg")).toHaveLength(1);
	});

	it("laat het rood van verwijderen los", async () => {
		// De CSS kleurt `[data-actie="verwijderen"]:not([data-terugzetten])`; deze markering haalt de
		// waarschuwingskleur eraf, want hier wordt niets weggegooid.
		const b = bericht();
		await toonBericht(b, { verwijderd: { [b.id]: true } });

		expect(verwijderKnop().hasAttribute("data-terugzetten")).toBe(true);
	});

	it("houdt icoon en kleur zoals ze waren bij een gewoon bericht", async () => {
		const b = bericht();
		await toonBericht(b);

		expect(verwijderKnop().querySelector("svg").getAttribute("viewBox")).toBe("0 0 64 64");
		expect(verwijderKnop().hasAttribute("data-terugzetten")).toBe(false);
	});

	it("zet het bericht terug in de inbox", async () => {
		const b = bericht();
		await toonBericht(b, { verwijderd: { [b.id]: true } });

		verwijderKnop().click();

		expect(window.Berichtenbox.statusVan(b.id)).toBe("inbox");
		expect(window.Berichtenbox.navigatieDoel()).toBe("/moza/berichtenbox/");
	});

	it("zet een teruggezet bericht niet terug in het archief", async () => {
		// Weggooien wiste de archief-markering. Die hier alsnog herstellen zou het bericht laten
		// verdwijnen in een map waar de bezoeker het net niet uit haalde.
		const b = bericht();
		await toonBericht(b, { verwijderd: { [b.id]: true }, gearchiveerd: { [b.id]: true } });

		verwijderKnop().click();

		expect(window.Berichtenbox.statusVan(b.id)).toBe("archief");
	});

	it("blijft in de prullenbak staan als het bewaren mislukt", async () => {
		const b = bericht();
		bouwDetailPagina(b, { state: { verwijderd: { [b.id]: true } } });
		opslagWeigert({ eersteBezoekGehad: true, verwijderd: { [b.id]: true } });
		await laadBerichtenbox();
		await laatLaden();

		verwijderKnop().click();

		// Geheugen, scherm en opslag horen hetzelfde te zeggen; wegnavigeren zou de melding
		// meenemen naar een pagina waar het bericht gewoon nog in de prullenbak staat.
		expect(window.Berichtenbox.statusVan(b.id)).toBe("prullenbak");
		expect(window.Berichtenbox.navigatieDoel()).toBe(null);
	});
});

/**
 * Uit de prullenbak halen kan twee kanten op: terug in de inbox, of voorgoed weg. Dat tweede is niet
 * terug te draaien, dus het gaat niet op één klik en het bericht verdwijnt daarna uit élke weergave.
 */
describe("detailpagina — voorgoed verwijderen", () => {
	const voorgoedKnop = () => document.querySelector('[data-actie="voorgoed-verwijderen"]');
	const paneel = () => document.querySelector("[data-voorgoed-paneel]");
	const bevestigKnop = () => document.querySelector("[data-voorgoed-bevestig]");

	async function toonBericht(b, state) {
		bouwDetailPagina(b, state ? { state } : {});
		await laadBerichtenbox();
		await laatLaden();
	}

	it("toont de knop alleen als het bericht in de prullenbak staat", async () => {
		const b = bericht();
		await toonBericht(b);
		expect(voorgoedKnop().hidden).toBe(true);

		await toonBericht(bericht(), { verwijderd: {} });
		expect(voorgoedKnop().hidden).toBe(true);
	});

	it("toont de knop in de prullenbak", async () => {
		const b = bericht();
		await toonBericht(b, { verwijderd: { [b.id]: true } });

		expect(voorgoedKnop().hidden).toBe(false);
	});

	it("verwijdert niet op één klik, maar vraagt het eerst", async () => {
		// Zonder deze tussenstap is één misklik genoeg om een bericht kwijt te zijn.
		const b = bericht();
		await toonBericht(b, { verwijderd: { [b.id]: true } });

		voorgoedKnop().click();

		expect(paneel()).not.toBe(null);
		expect(paneel().textContent).toContain("U kunt het daarna niet meer terugzetten.");
		expect(window.Berichtenbox.statusVan(b.id)).toBe("prullenbak");
	});

	it("laat het bericht uit elke weergave verdwijnen na bevestigen", async () => {
		const b = bericht();
		await toonBericht(b, { verwijderd: { [b.id]: true } });

		voorgoedKnop().click();
		bevestigKnop().click();

		// "weg" is geen weergave, dus geen enkele lijst toont dit bericht nog.
		expect(window.Berichtenbox.statusVan(b.id)).toBe("weg");
		expect(window.Berichtenbox.navigatieDoel()).toBe("/moza/berichtenbox/berichtenbox-prullenbak/");
	});

	it("doet niets als de bezoeker annuleert", async () => {
		const b = bericht();
		await toonBericht(b, { verwijderd: { [b.id]: true } });

		voorgoedKnop().click();
		[...paneel().querySelectorAll("button")].find((k) => k.textContent === "Annuleer").click();

		expect(paneel()).toBe(null);
		expect(window.Berichtenbox.statusVan(b.id)).toBe("prullenbak");
		expect(window.Berichtenbox.navigatieDoel()).toBe(null);
	});

	it("verwijdert niets als het bewaren mislukt", async () => {
		const b = bericht();
		bouwDetailPagina(b, { state: { verwijderd: { [b.id]: true } } });
		opslagWeigert({ eersteBezoekGehad: true, verwijderd: { [b.id]: true } });
		await laadBerichtenbox();
		await laatLaden();

		voorgoedKnop().click();
		bevestigKnop().click();

		// Het paneel blijft staan en het bericht ook: anders lijkt het weg terwijl het na een
		// verversing gewoon terug is.
		expect(window.Berichtenbox.statusVan(b.id)).toBe("prullenbak");
		expect(window.Berichtenbox.navigatieDoel()).toBe(null);
		expect(paneel()).not.toBe(null);
	});
});
