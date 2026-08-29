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

/**
 * Een keten die zich aangesloten meldt en één bericht levert.
 *
 * Het bericht is een parameter, want de render-laag leest het uit de bron en niet uit de pagina.
 * Een vast bericht hier maakte `heeftBijlage: true` in de fixture onzichtbaar: de test bouwde de
 * pagina met bijlagen, de bron leverde er een zonder, en de tak die getoetst werd draaide nooit.
 */
function nepKeten(inhoudVan, bericht = KETEN_BERICHT) {
	return {
		bezig: false,
		aangesloten: true,
		melding: null,
		voortgang: null,
		berichten: async () => ({
			berichten: [bericht],
			magazijnen: [{ id: bericht.magazijnId, naam: "RVO", type: "instantie" }],
		}),
		opWijziging: () => {},
		inhoudVan,
	};
}

/** Bouwt pagina én bron met hetzelfde bericht, zodat ze niet uiteen kunnen lopen. */
function metBericht(bericht, inhoudVan) {
	window.BerichtenboxKeten = nepKeten(inhoudVan, bericht);
	bouwDemoDetailPagina(bericht);
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

		expect(tekst()).toContain("kregen wij alleen de afzender, het onderwerp en de datum");
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
		expect(regels).toEqual(["beschikking.pdf", "toelichting.pdf"]);

		// De uitleg staat ná de lijst en niet erin: als lijstitem zou een schermlezer "lijst met drie
		// items" melden bij twee bijlagen.
		expect(bijlagen.querySelector("[data-bijlagen-uitleg]").textContent).toBe("Bijlagen bekijken kan in dit prototype nog niet.");

		// Het laad-element is een laadindicator en hoort geen blijvende tekst te houden.
		expect(bijlagen.querySelector("[data-berichtenbox-attachments-loading]").hidden).toBe(true);
	});

	it("vraagt ook na als de lijst al inhoud meegaf, want de bijlagen komen langs dezelfde weg", async () => {
		// De bijlagen staan nooit in de berichtenlijst. Sloeg de detailpagina het ophalen over omdat
		// er al tekst was, dan hield een bericht mét bijlagen een sectiekop over, een laadtekst die
		// nooit afliep, en geen enkele bijlage.
		const metInhoud = { ...KETEN_BERICHT, id: "al-compleet", inhoud: "Uit de lijst.", heeftBijlage: true };
		const inhoudVan = vi.fn(async () => ({ inhoud: "De volledige brief.", bijlagen: [{ naam: "besluit.pdf" }] }));
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

		expect(inhoudVan).toHaveBeenCalledWith("al-compleet");
		expect(tekst()).toBe("De volledige brief.");
		expect([...document.querySelectorAll("[data-berichtenbox-attachments-list] li")].map((li) => li.textContent)).toEqual(["besluit.pdf"]);
	});

	it("laat de bijlagen staan als alleen de brieftekst ontbreekt", async () => {
		// Een beschikking waarvan de brief volledig ín de PDF zit. De bijlage weglaten omdat er geen
		// tekst is, is precies de tegenhanger van verzonnen bijlagen: nu verdwijnt de echte.
		metBericht({ ...KETEN_BERICHT, heeftBijlage: true }, async () => ({ inhoud: "", bijlagen: [{ naam: "beschikking.pdf" }] }));

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		expect([...document.querySelectorAll("[data-berichtenbox-attachments-list] li")].map((li) => li.textContent)).toEqual(["beschikking.pdf"]);
	});

	it("zegt het als beloofde bijlagen niet geleverd zijn", async () => {
		// De nabootsing die de laadtekst vroeger opruimde slaat een keten-bericht juist over. Blijft
		// dit weg, dan wacht de bezoeker op iets dat nooit komt.
		metBericht({ ...KETEN_BERICHT, heeftBijlage: true }, async () => ({ fout: "Het ging mis." }));

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		const laden = document.querySelector("[data-berichtenbox-attachments-loading]");
		expect(laden.hidden).toBe(false);
		// De zin zelf vastleggen, niet alleen dat de laadtekst weg is: een lege string voldeed
		// daaraan ook, en dan is de hele tak weg te halen zonder dat één test omvalt.
		expect(laden.textContent).toBe("Wij konden de bijlagen van dit bericht niet ophalen. Ververs de pagina om het opnieuw te proberen.");
	});

	it("noemt het geen storing als de organisatie antwoordt zonder bijlagen", async () => {
		// De teller in de lijst was verouderd, of de organisatie levert de bijlage niet mee. Er is
		// niets misgegaan, en "ververs de pagina" zou hier een lus zonder uitgang zijn.
		metBericht({ ...KETEN_BERICHT, heeftBijlage: true }, async () => ({ inhoud: "De brief.", bijlagen: [] }));

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		const sectie = document.querySelector("[data-berichtenbox-attachments]");
		expect(sectie.hidden).toBe(true);
		expect(document.querySelector("[data-berichtenbox-attachments-loading]").textContent).toBe("");
	});

	it("houdt de bijlagensectie dicht bij een bericht zonder bijlagen", async () => {
		// Anders staat de kop "Bijlage(n)" met een lege lijst op élk bericht.
		window.BerichtenboxKeten = nepKeten(async () => ({ inhoud: "De brief.", bijlagen: [] }));
		bouwDemoDetailPagina(KETEN_BERICHT);

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		expect(document.querySelector("[data-berichtenbox-attachments]").hidden).toBe(true);
	});

	it("kondigt de bijlagen mee aan voor wie de brief niet ziet", async () => {
		// De bijlagenfout verschijnt buiten elke live-regio. Zonder dit hoort iemand met een
		// schermlezer dat alles goed ging, en verneemt die nooit dat de bijlagen ontbreken.
		metBericht({ ...KETEN_BERICHT, heeftBijlage: true }, async () => ({ inhoud: "De brief.", bijlagen: [{ naam: "a.pdf" }, { naam: "b.pdf" }] }));

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		expect(document.querySelector("[data-demo-inhoud-status]").textContent).toBe("De inhoud van dit bericht is opgehaald. Er zijn 2 bijlagen.");
	});

	it("zet er meteen iets neer, ook voordat de bron gekozen is", async () => {
		// De pagina wordt pas gevuld na de hele ophaalronde. Tot dan stond er een lege kaart zonder
		// woord — bij een traag stelsel tientallen seconden lang.
		window.BerichtenboxKeten = { ...nepKeten(async () => ({ inhoud: "x", bijlagen: [] })), bezig: true, berichten: () => new Promise(() => {}) };
		bouwDemoDetailPagina(KETEN_BERICHT);

		await laadBerichtenbox();

		const body = document.querySelector("[data-demo-body]");
		expect(body.textContent.trim()).toBe("Wij halen dit bericht op…");
		expect(body.getAttribute("aria-busy")).toBe("true");
	});

	it("laat de nagebootste bijlagen weg bij een bericht uit het stelsel", async () => {
		// De nabootsing vult de bijlagenlijst anderhalve seconde na het laden met verzonnen namen
		// die naar een voorbeeld-PDF wijzen. Over échte bijlagegegevens heen is dat geen nabootsing
		// meer maar een onwaarheid — met een werkende downloadknop erbij.
		vi.useFakeTimers();
		try {
			metBericht({ ...KETEN_BERICHT, heeftBijlage: true }, async () => ({ inhoud: "Zie de bijlage.", bijlagen: [{ naam: "besluit-2026.pdf" }] }));

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

	it("laat de weg terug staan als het bericht niet gevonden wordt", async () => {
		// Juist op de unhappy flow is die knop het enige dat de bezoeker verder helpt. De melding met
		// textContent overschrijven vaagde hem weg, samen met de alinea eromheen.
		// Een mislukte ophaalronde: dan is de lijst leeg omdat er niets binnenkwam, en herschrijft de
		// pagina de melding — precies het moment waarop de knop verdween.
		window.BerichtenboxKeten = { ...nepKeten(async () => ({ inhoud: "x", bijlagen: [] })), berichten: async () => null };
		bouwDemoDetailPagina(KETEN_BERICHT, { berichten: [] });

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		const blok = document.querySelector("[data-demo-niet-gevonden]");
		expect(blok.hidden).toBe(false);
		expect(blok.querySelector("p").textContent).toContain("Wij konden uw berichten niet ophalen");
		expect(blok.querySelector("a.btn-cta")).not.toBeNull();
	});

	it("maakt van een leeg antwoord geen uitspraak over de organisatie", async () => {
		// De bron gaf niets terug — geen inhoud en geen fout. Er is dan niets gevraagd, en dat is
		// iets anders dan een organisatie die niets heeft. Zonder deze tak leest de bezoeker het
		// tweede terwijl het eerste waar is.
		window.BerichtenboxKeten = nepKeten(async () => null);
		bouwDemoDetailPagina(KETEN_BERICHT);

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		expect(tekst()).toContain("niet opvragen");
		expect(tekst()).not.toContain("kregen wij alleen de afzender");
	});

	it("zegt het als het keten-script geen inhoudVan kent", async () => {
		// Een bedradingsfout — bijvoorbeeld een gecacht ouder script naast een nieuwe module. Stil
		// niets teruggeven liet de pagina zeggen dat de organisatie de inhoud niet heeft, terwijl er
		// nooit iets gevraagd is.
		const zonder = nepKeten(undefined);
		delete zonder.inhoudVan;
		window.BerichtenboxKeten = zonder;
		bouwDemoDetailPagina(KETEN_BERICHT);

		await laadBerichtenbox();
		await laatLaden();
		await laatLaden();

		expect(tekst()).toContain("niet opvragen");
		expect(tekst()).not.toContain("kregen wij alleen de afzender");
	});
});
