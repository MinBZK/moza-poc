// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bericht, bouwDemoDetailPagina, laadBerichtenbox, laatLaden } from "./dom.js";

/**
 * De inhoud van een bericht uit het stelsel, opgehaald op het moment dat de bezoeker het opent.
 *
 * De berichtenuitvraag levert alleen kopgegevens: afzender, onderwerp, datum. De inhoud blijft bij
 * de organisatie tot iemand erom vraagt. Voor de bezoeker mag dat nooit een lege pagina opleveren —
 * de bezoeker moet zien dat er iets wordt opgehaald, en lezen wat er misging als het niet lukt.
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

		expect(tekst()).toBe("Wij halen de inhoud van dit bericht op bij RVO…");
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
		// zonder deze vangst staat er tot in lengte van dagen dat het bericht wordt opgehaald.
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
		const lijst = bijlagen.querySelector("[data-berichtenbox-attachments-list]");
		expect(bijlagen.hidden).toBe(false);
		expect(lijst.hidden).toBe(false);

		// De échte namen, niet de nagebootste. En erbij dat openen nog niet kan: een naam zonder
		// link en zonder woord laat de bezoeker klikken op iets dat er niet is.
		const regels = [...lijst.querySelectorAll("li")].map((li) => li.textContent);
		expect(regels).toEqual(["beschikking.pdf", "toelichting.pdf", "Bijlagen openen kan in dit prototype nog niet."]);

		// Het laad-element is een laadindicator en hoort geen blijvende tekst te houden.
		expect(bijlagen.querySelector("[data-berichtenbox-attachments-loading]").hidden).toBe(true);
	});

	it("vraagt niets na voor een bericht dat zijn inhoud al heeft", async () => {
		// De spy moet op de áctieve bron zitten, anders bewijst hij niets: een keten die zich niet
		// aangesloten meldt wordt sowieso nooit geraadpleegd, en dan is "niet aangeroepen" waar om
		// de verkeerde reden. Dus: wél aangesloten, en een bericht dat zijn inhoud al bij zich draagt.
		const metInhoud = { ...KETEN_BERICHT, id: "al-compleet", inhoud: "Eerste alinea.\n\nTweede alinea." };
		const inhoudVan = vi.fn(async () => ({ inhoud: "Dit hoort nooit op het scherm te komen.", bijlagen: [] }));
		window.BerichtenboxKeten = {
			bezig: false,
			aangesloten: true,
			melding: null,
			voortgang: null,
			berichten: async () => ({ berichten: [metInhoud], magazijnen: [{ id: metInhoud.magazijnId, naam: "RVO", type: "instantie" }] }),
			opWijziging: () => {},
			inhoudVan,
		};
		bouwDemoDetailPagina(metInhoud);

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		expect(tekst()).toBe("Eerste alinea. Tweede alinea.");
		expect(inhoudVan).not.toHaveBeenCalled();
	});

	it("laat de nagebootste bijlagen weg bij een bericht uit het stelsel", async () => {
		// De nabootsing vult de bijlagenlijst anderhalve seconde na het laden met verzonnen namen
		// die naar een voorbeeld-PDF wijzen. Over échte bijlagegegevens heen is dat geen nabootsing
		// meer maar een onwaarheid — met een werkende downloadknop erbij.
		vi.useFakeTimers();
		try {
			window.BerichtenboxKeten = nepKeten(async () => ({ inhoud: "Zie de bijlage.", bijlagen: [{ naam: "besluit-2026.pdf" }] }));
			bouwDemoDetailPagina({ ...KETEN_BERICHT, heeftBijlage: true });

			await laadBerichtenbox();
			await vi.advanceTimersByTimeAsync(5000);

			const regels = [...document.querySelectorAll("[data-berichtenbox-attachments-list] li")].map((li) => li.textContent);
			expect(regels).toContain("besluit-2026.pdf");
			expect(regels.some((regel) => /Beschikking\.pdf|Bijlage-specificatie\.pdf/.test(regel))).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it("meldt aan een schermlezer dat de inhoud binnen is", async () => {
		// De brief verschijnt buiten elke live-regio. Zonder deze melding hoort iemand met een
		// schermlezer dat er iets wordt opgehaald, en daarna niets meer.
		window.BerichtenboxKeten = nepKeten(async () => ({ inhoud: "De brief.", bijlagen: [] }));
		bouwDemoDetailPagina(KETEN_BERICHT);

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		expect(document.querySelector("[data-demo-inhoud-status]").textContent).toBe("De inhoud van dit bericht is opgehaald.");
	});
});
