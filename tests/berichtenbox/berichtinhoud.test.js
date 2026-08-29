// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bericht, bouwDemoDetailPagina, laadBerichtenbox, laatLaden } from "./dom.js";

/**
 * De inhoud van een bericht uit het stelsel, opgehaald op het moment dat de bezoeker het opent.
 *
 * De berichtenuitvraag levert alleen kopgegevens: afzender, onderwerp, datum. De inhoud blijft bij
 * de organisatie tot iemand erom vraagt. Voor de bezoeker mag dat nooit een lege pagina opleveren —
 * hij moet zien dat er iets wordt opgehaald, en lezen wat er misging als het niet lukt.
 */

const KETEN_BERICHT = bericht({
	id: "3f1c-uit-de-keten",
	magazijnId: "00000000000000100000",
	afzender: "RVO",
	onderwerp: "Gecombineerde opgave verwerkt",
	inhoud: "",
	uitKeten: true,
});

/** De alinea's als één regel. Per <p>, want die plakken in textContent aan elkaar. */
function tekst() {
	const body = document.querySelector("[data-demo-body]");
	if (!body) return null;
	return [...body.querySelectorAll("p")].map((p) => p.textContent.replace(/\s+/g, " ").trim()).join(" ");
}

/** Een keten die zich aangesloten meldt en één bericht levert. */
function nepKeten(inhoudVan) {
	return {
		bezig: false,
		aangesloten: true,
		melding: null,
		voortgang: null,
		berichten: async () => ({
			berichten: [KETEN_BERICHT],
			magazijnen: [{ id: KETEN_BERICHT.magazijnId, naam: "RVO", type: "instantie" }],
		}),
		opWijziging: () => {},
		inhoudVan,
	};
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	delete window.BerichtenboxKeten;
	vi.restoreAllMocks();
});

describe("de inhoud van een bericht uit het stelsel", () => {
	it("haalt hem na bij de bron en zet hem op de pagina", async () => {
		window.BerichtenboxKeten = nepKeten(async () => ({
			inhoud: "Beste ondernemer,\n\nUw opgave is verwerkt.",
			bijlagen: [],
		}));
		bouwDemoDetailPagina(KETEN_BERICHT);

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		expect(tekst()).toBe("Beste ondernemer, Uw opgave is verwerkt.");
		expect(document.querySelectorAll("[data-demo-body] p")).toHaveLength(2);
	});

	it("zegt ondertussen dat hij hem ophaalt", async () => {
		// Nooit oplossend: dit is precies het venster waarin de bezoeker naar het scherm kijkt.
		window.BerichtenboxKeten = nepKeten(() => new Promise(() => {}));
		bouwDemoDetailPagina(KETEN_BERICHT);

		await laadBerichtenbox();
		await laatLaden();

		expect(tekst()).toBe("De inhoud van dit bericht wordt opgehaald bij RVO…");
		expect(document.querySelector("[data-demo-body]").getAttribute("aria-busy")).toBe("true");
	});

	it("zegt wat er misging in plaats van een lege pagina te laten staan", async () => {
		window.BerichtenboxKeten = nepKeten(async () => ({ fout: "Dit bericht is niet meer beschikbaar bij de organisatie die het stuurde." }));
		bouwDemoDetailPagina(KETEN_BERICHT);

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		expect(tekst()).toBe("Dit bericht is niet meer beschikbaar bij de organisatie die het stuurde.");
		expect(document.querySelector("[data-demo-body]").hasAttribute("aria-busy")).toBe(false);
	});

	it("blijft niet op 'wordt opgehaald' staan als de bron onverwacht struikelt", async () => {
		// `inhoudVan` hoort niet te werpen, maar als het toch gebeurt is de bezoeker het slachtoffer:
		// zonder deze vangst leest hij tot in lengte van dagen dat zijn bericht wordt opgehaald.
		window.BerichtenboxKeten = nepKeten(async () => {
			throw new Error("stuk");
		});
		bouwDemoDetailPagina(KETEN_BERICHT);

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		expect(tekst()).toBe("Wij konden de inhoud van dit bericht niet ophalen. Ververs de pagina om het opnieuw te proberen.");
	});

	it("zegt het apart als de bron antwoordt maar niets te melden heeft", async () => {
		// Een geslaagd antwoord zonder inhoud is geen storing, en hoort dus ook niet als storing te
		// klinken. De bezoeker moet het verschil kunnen zien.
		window.BerichtenboxKeten = nepKeten(async () => ({ inhoud: "", bijlagen: [] }));
		bouwDemoDetailPagina(KETEN_BERICHT);

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		expect(tekst()).toContain("bij de organisatie niet beschikbaar");
	});

	it("toont bijlagen die pas met de inhoud meekwamen", async () => {
		// De lijst wist nog van geen bijlagen: die staan pas in het antwoord per bericht.
		window.BerichtenboxKeten = nepKeten(async () => ({
			inhoud: "Zie de bijlage.",
			bijlagen: [{ naam: "beschikking.pdf" }, { naam: "toelichting.pdf" }],
		}));
		bouwDemoDetailPagina(KETEN_BERICHT);

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		const bijlagen = document.querySelector("[data-berichtenbox-attachments]");
		expect(bijlagen.hidden).toBe(false);
		expect(bijlagen.querySelector("[data-berichtenbox-attachments-loading]").textContent).toBe("2 bijlagen bij dit bericht van RVO");
	});

	it("laat een bericht uit de dataset met rust", async () => {
		// Die heeft zijn inhoud al; er valt niets na te halen en niets te melden.
		const uitDataset = bericht({ id: "msg-dataset", inhoud: "Eerste alinea.\n\nTweede alinea." });
		const inhoudVan = vi.fn();
		window.BerichtenboxKeten = { bezig: false, aangesloten: false, melding: null, voortgang: null, berichten: async () => null, opWijziging: () => {}, inhoudVan };
		bouwDemoDetailPagina(uitDataset);

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		expect(tekst()).toBe("Eerste alinea. Tweede alinea.");
		expect(inhoudVan).not.toHaveBeenCalled();
	});
});
