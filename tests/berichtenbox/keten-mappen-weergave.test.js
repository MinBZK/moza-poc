// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bouwPagina, bouwDemoDetailPagina, laadBerichtenbox, laatLaden, rijen } from "./dom.js";

/**
 * Mappen uit het Federatief Berichtenstelsel op het scherm.
 *
 * Een map is daar een eigenschap van een bericht, dus het overzicht in de tabbalk volgt de berichten:
 * het groeit mee terwijl organisaties leveren, en een map zonder berichten verdwijnt. De mappen van
 * de gegenereerde dataset, die het sjabloon neerzet, horen daar niet tussen.
 */

function ketenBericht(id, map, extra = {}) {
	return { id, magazijnId: "00000001823288444000", afzender: "Belastingdienst", onderwerp: "Onderwerp " + id, datum: "2026-09-21", isOngelezen: false, map, inhoud: "", uitKeten: true, ...extra };
}

const UITKOMST = {
	berichten: [ketenBericht("r1", "Subsidies", { magazijnId: "rvo", afzender: "RVO" }), ketenBericht("b1", "Boekhouding 2026"), ketenBericht("r2", "Boekhouding 2026", { magazijnId: "rvo", afzender: "RVO" }), ketenBericht("b2", "Te bespreken met adviseur"), ketenBericht("b3", null)],
	magazijnen: [
		{ id: "rvo", naam: "RVO", type: "instantie" },
		{ id: "00000001823288444000", naam: "Belastingdienst", type: "instantie" },
	],
};

/** Een dubbel voor berichtenbox-keten.js. */
function zetKeten({ uitkomst, haalUitMap = vi.fn(async () => ({})) } = {}) {
	const kijkers = [];
	let losmaken;
	const wachten = new Promise((klaar) => {
		losmaken = klaar;
	});
	const keten = {
		bezig: true,
		aangesloten: true,
		melding: null,
		voortgang: null,
		huidigeUitkomst: null,
		berichten: () => (uitkomst === undefined ? wachten : Promise.resolve(uitkomst)),
		opWijziging: (kijker) => kijkers.push(kijker),
		meldVerwerkingsfout: vi.fn(),
		stopPollen: vi.fn(),
		haalUitMap,
	};
	window.BerichtenboxKeten = keten;
	return {
		keten,
		meld(toestand) {
			if ("voortgang" in toestand) keten.voortgang = toestand.voortgang;
			kijkers.forEach((k) => k({ melding: null, voortgang: null, uitkomst: null, ...toestand }));
		},
		klaar(u) {
			losmaken(u);
		},
	};
}

// Zoals een schermlezer het hoort: "Subsidies (3 berichten)".
const mappenInBalk = () => [...document.querySelectorAll(".tablist .berichtenbox-folder-user")].filter((li) => !li.hidden).map((li) => li.textContent.replace(/\s+/g, " ").trim());
const scheiding = () => document.querySelector(".tablist .list-separation");

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	delete window.BerichtenboxKeten;
	vi.restoreAllMocks();
});

describe("het mappenoverzicht in de tabbalk", () => {
	it("toont geen mappen van de dataset zolang niet bekend is welke mappen de bron heeft", async () => {
		bouwPagina([], { mappenbalk: true });
		zetKeten({}); // de ronde loopt nog

		await laadBerichtenbox();
		await laatLaden();

		expect(mappenInBalk()).toEqual([]);
		expect(scheiding().hidden).toBe(true);
	});

	it("groeit mee met wat de organisaties tijdens de ronde melden", async () => {
		bouwPagina([], { mappenbalk: true });
		const keten = zetKeten({});
		await laadBerichtenbox();
		await laatLaden();

		keten.meld({
			voortgang: {
				bevraagd: 2,
				klaar: 1,
				gevonden: 5,
				mappen: [
					{ naam: "Boekhouding 2026", aantalBerichten: 1 },
					{ naam: "Subsidies", aantalBerichten: 3 },
				],
			},
		});
		expect(mappenInBalk()).toEqual(["Boekhouding 2026 (1 bericht)", "Subsidies (3 berichten)"]);
		expect(scheiding().hidden).toBe(false);

		keten.meld({
			voortgang: {
				bevraagd: 2,
				klaar: 2,
				gevonden: 10,
				mappen: [
					{ naam: "Belasting", aantalBerichten: 3 },
					{ naam: "Boekhouding 2026", aantalBerichten: 2 },
					{ naam: "Subsidies", aantalBerichten: 3 },
					{ naam: "Te bespreken met adviseur", aantalBerichten: 1 },
				],
			},
		});
		expect(mappenInBalk()).toEqual(["Belasting (3 berichten)", "Boekhouding 2026 (2 berichten)", "Subsidies (3 berichten)", "Te bespreken met adviseur (1 bericht)"]);
	});

	it("neemt na afloop de mappen uit de lijst, en laat die van de dataset weg", async () => {
		bouwPagina([], { mappenbalk: true });
		zetKeten({ uitkomst: UITKOMST });

		await laadBerichtenbox();
		await laatLaden();

		expect(mappenInBalk()).toEqual(["Boekhouding 2026 (2 berichten)", "Subsidies (1 bericht)", "Te bespreken met adviseur (1 bericht)"]);
		expect(document.querySelector('[data-map-slug="belastingen-2025"]')).toBeNull();
	});

	it("laat een map verdwijnen met zijn laatste bericht", async () => {
		bouwPagina([], { mappenbalk: true });
		const keten = zetKeten({ uitkomst: UITKOMST });
		await laadBerichtenbox();
		await laatLaden();

		const zonder = { ...UITKOMST, berichten: UITKOMST.berichten.map((b) => (b.id === "b2" ? { ...b, map: null } : b)) };
		keten.meld({ uitkomst: zonder });

		expect(mappenInBalk()).toEqual(["Boekhouding 2026 (2 berichten)", "Subsidies (1 bericht)"]);
	});

	// Een mapweergave toont alleen wat in de inbox staat. Telt het overzicht ook mee wat de bezoeker
	// archiveerde of weggooide, dan staat er "(1 bericht)" bij een map die leeg opent.
	it("telt alleen de berichten die de map ook toont, en laat een map zonder zulke berichten weg", async () => {
		bouwPagina([], { mappenbalk: true, state: { gearchiveerd: { b2: true }, verwijderd: { r2: true } } });
		zetKeten({ uitkomst: UITKOMST });

		await laadBerichtenbox();
		await laatLaden();

		expect(mappenInBalk()).toEqual(["Boekhouding 2026 (1 bericht)", "Subsidies (1 bericht)"]);
		expect(scheiding().hidden).toBe(false);
	});

	it("werkt het overzicht bij zodra de bezoeker een bericht archiveert of weggooit", async () => {
		bouwPagina([], { mappenbalk: true });
		zetKeten({ uitkomst: UITKOMST });
		await laadBerichtenbox();
		await laatLaden();

		const rij = (id) => rijen().find((r) => r.dataset.berichtId === id);
		rij("b2").querySelector('[data-row-actie="archiveren"]').click();
		expect(mappenInBalk()).toEqual(["Boekhouding 2026 (2 berichten)", "Subsidies (1 bericht)"]);

		rij("r2").querySelector('[data-row-actie="verwijderen"]').click();
		expect(mappenInBalk()).toEqual(["Boekhouding 2026 (1 bericht)", "Subsidies (1 bericht)"]);
		expect(scheiding().hidden).toBe(false);
	});

	// Het tabblad is het enige op de pagina dat zegt welke map er openstaat. Verdwijnt het met het
	// laatste bericht, dan staat de bezoeker voor een lege lijst zonder te weten waarom.
	it("laat de map die openstaat staan als het laatste bericht eruit gearchiveerd wordt", async () => {
		bouwPagina([], { mappenbalk: true, pad: "/moza/berichtenbox/?map=" + encodeURIComponent("Te bespreken met adviseur") });
		zetKeten({ uitkomst: UITKOMST });
		await laadBerichtenbox();
		await laatLaden();

		rijen()[0].querySelector('[data-row-actie="archiveren"]').click();

		expect(rijen()).toEqual([]);
		expect(mappenInBalk()).toEqual(["Boekhouding 2026 (2 berichten)", "Subsidies (1 bericht)", "Te bespreken met adviseur (0 berichten)"]);
		const actief = document.querySelector('.tablist [aria-current="page"]');
		expect(actief && actief.textContent).toContain("Te bespreken met adviseur");
	});

	it("houdt een map zonder zichtbare berichten weg als de lijst daarna verandert", async () => {
		bouwPagina([], { mappenbalk: true, state: { gearchiveerd: { b2: true } } });
		const keten = zetKeten({ uitkomst: UITKOMST });
		await laadBerichtenbox();
		await laatLaden();

		keten.meld({ uitkomst: { ...UITKOMST, berichten: UITKOMST.berichten.map((b) => (b.id === "r1" ? { ...b, map: null } : b)) } });

		expect(mappenInBalk()).toEqual(["Boekhouding 2026 (2 berichten)"]);
	});

	// Tijdens de ronde staat een map er met het aantal van de organisatie. Blijkt daarna dat de
	// bezoeker dat ene bericht al archiveerde, dan verdwijnt de map onder het toetsenbord vandaan.
	it("zet de focus op een tabblad dat blijft als de map met de focus verdwijnt", async () => {
		bouwPagina([], { mappenbalk: true, state: { gearchiveerd: { b2: true } } });
		const keten = zetKeten({});
		await laadBerichtenbox();
		await laatLaden();

		keten.meld({ voortgang: { bevraagd: 2, klaar: 2, gevonden: 5, mappen: [{ naam: "Te bespreken met adviseur", aantalBerichten: 1 }] } });
		const map = document.querySelector('.tablist [data-map-slug="Te bespreken met adviseur"]');
		map.querySelector("a").focus();
		expect(map.contains(document.activeElement)).toBe(true);

		keten.klaar(UITKOMST);
		await laatLaden();

		expect(map.hidden).toBe(true);
		const metFocus = document.activeElement.closest(".tablist li");
		expect(metFocus).not.toBeNull();
		expect(metFocus.hidden).toBe(false);
	});

	// De mappen van de dataset staan in de stijl verborgen; alleen dit kenmerk maakt een map uit het
	// stelsel zichtbaar. jsdom kent die stijl niet, dus zonder deze toets valt het wegvallen niet op.
	it("merkt een map uit het stelsel als zichtbaar", async () => {
		bouwPagina([], { mappenbalk: true });
		zetKeten({ uitkomst: UITKOMST });
		await laadBerichtenbox();
		await laatLaden();

		const mappen = [...document.querySelectorAll(".tablist .berichtenbox-folder-user")];
		expect(mappen).toHaveLength(3);
		mappen.forEach((li) => expect(li.hasAttribute("data-map-uit-berichten")).toBe(true));
	});

	it("verbergt het kopje Mappen als alle berichten in mappen gearchiveerd zijn", async () => {
		bouwPagina([], { mappenbalk: true, state: { gearchiveerd: { b2: true } } });
		zetKeten({ uitkomst: { ...UITKOMST, berichten: [ketenBericht("b2", "Te bespreken met adviseur"), ketenBericht("b3", null)] } });

		await laadBerichtenbox();
		await laatLaden();

		expect(mappenInBalk()).toEqual([]);
		expect(scheiding().hidden).toBe(true);
	});

	it("verbergt het kopje Mappen als er geen enkele map is", async () => {
		bouwPagina([], { mappenbalk: true });
		zetKeten({ uitkomst: { ...UITKOMST, berichten: [ketenBericht("b3", null)] } });

		await laadBerichtenbox();
		await laatLaden();

		expect(mappenInBalk()).toEqual([]);
		expect(scheiding().hidden).toBe(true);
	});

	it("filtert de inbox op een map met een naam zoals de organisatie die schreef", async () => {
		bouwPagina([], { mappenbalk: true, pad: "/moza/berichtenbox/?map=" + encodeURIComponent("Boekhouding 2026") });
		zetKeten({ uitkomst: UITKOMST });

		await laadBerichtenbox();
		await laatLaden();

		expect(
			rijen()
				.map((r) => r.dataset.berichtId)
				.sort()
		).toEqual(["b1", "r2"]);
		const actief = document.querySelector('.tablist [aria-current="page"]');
		expect(actief && actief.textContent).toContain("Boekhouding 2026");
	});

	it("struikelt niet over een aanhalingsteken in de naam van een map", async () => {
		// Namen komen woordelijk van de organisatie. Ongeëscaped in een selector breekt de hele weergave.
		const naam = 'Project "Noord" \\ 2026';
		bouwPagina([], { mappenbalk: true, pad: "/moza/berichtenbox/?map=" + encodeURIComponent(naam) });
		zetKeten({ uitkomst: { ...UITKOMST, berichten: [ketenBericht("q1", naam), ketenBericht("b3", null)] } });

		await laadBerichtenbox();
		await laatLaden();

		expect(mappenInBalk()).toEqual([naam + " (1 bericht)"]);
		expect(rijen().map((r) => r.dataset.berichtId)).toEqual(["q1"]);
		expect(document.querySelector("[data-berichtenbox-storing]").hidden).toBe(true);
	});

	it("laat het overzicht met rust tijdens een latere ronde, want dan is de lijst de bron", async () => {
		// Een herstelronde na een verlopen sessie meldt opnieuw voortgang. Die tussenstand zou mappen
		// die nog niet gemeld zijn even weghalen, met de focus en de actieve map erbij.
		bouwPagina([], { mappenbalk: true });
		const keten = zetKeten({ uitkomst: UITKOMST });
		await laadBerichtenbox();
		await laatLaden();

		keten.meld({ voortgang: { bevraagd: 2, klaar: 1, gevonden: 1, mappen: [{ naam: "Subsidies", aantalBerichten: 1 }] } });

		expect(mappenInBalk()).toEqual(["Boekhouding 2026 (2 berichten)", "Subsidies (1 bericht)", "Te bespreken met adviseur (1 bericht)"]);
	});

	it("toont de mappen van de dataset gewoon voor een persona zonder stelsel", async () => {
		bouwPagina([{ id: "d1", magazijnId: "rvo", afzender: "RVO", onderwerp: "x", datum: "2026-01-01", isOngelezen: false, map: "belastingen-2025", inhoud: "x" }], { mappenbalk: true });

		await laadBerichtenbox();
		await laatLaden();

		expect(mappenInBalk()).toEqual(["Belastingen 2025"]);
		expect(scheiding().hidden).toBe(false);
	});
});

describe("een bericht uit zijn map halen op de detailpagina", () => {
	const knop = () => document.querySelector('[data-actie="uit-map"]');

	it("biedt de knop alleen aan voor een bericht in een map", async () => {
		bouwDemoDetailPagina(ketenBericht("b3", null));
		zetKeten({ uitkomst: { ...UITKOMST, berichten: [ketenBericht("b3", null)] } });

		await laadBerichtenbox();
		await laatLaden();

		expect(knop().hidden).toBe(true);
	});

	// In het archief of de prullenbak belooft de melding na "Haal uit map" iets wat niet klopt: het
	// bericht komt er niet mee in de inbox, en daar staat al een knop voor die dat wel doet.
	it.each([
		["het archief", { gearchiveerd: { b2: true } }],
		["de prullenbak", { verwijderd: { b2: true } }],
	])("biedt de knop niet aan voor een bericht in %s", async (_, state) => {
		bouwDemoDetailPagina(ketenBericht("b2", "Te bespreken met adviseur"));
		window.localStorage.setItem("berichtenbox", JSON.stringify({ eersteBezoekGehad: true, ...state }));
		zetKeten({ uitkomst: { ...UITKOMST, berichten: [ketenBericht("b2", "Te bespreken met adviseur")] } });

		await laadBerichtenbox();
		await laatLaden();

		expect(knop().hidden).toBe(true);
	});

	// Archiveren stuurt de bezoeker naar de lijst; met de terugknop komt deze pagina terug zoals ze
	// was, met de knop er nog op.
	it("haalt niets uit de map als het bericht intussen gearchiveerd is", async () => {
		bouwDemoDetailPagina(ketenBericht("b2", "Te bespreken met adviseur"));
		knop().insertAdjacentHTML("afterend", '<button class="icon-button" data-actie="archiveren">Archiveren</button>');
		const keten = zetKeten({ uitkomst: { ...UITKOMST, berichten: [ketenBericht("b2", "Te bespreken met adviseur")] } });

		await laadBerichtenbox();
		await laatLaden();
		expect(knop().hidden).toBe(false);

		document.querySelector('[data-actie="archiveren"]').click();
		knop().click();
		await laatLaden();

		expect(keten.keten.haalUitMap).not.toHaveBeenCalled();
		expect(knop().hidden).toBe(true);
		expect(document.querySelector("[data-berichtenbox-storing-tekst]").textContent).toContain("niet meer in uw inbox");
		expect(document.querySelector("[data-demo-inhoud-status]").textContent).not.toContain("U vindt het in uw inbox");
	});

	it("haalt het bericht uit zijn map en laat zien dat het weer in de inbox staat", async () => {
		const bericht = ketenBericht("b2", "Te bespreken met adviseur");
		bouwDemoDetailPagina(bericht);
		document.querySelector("[data-demo-detail]").insertAdjacentHTML("beforebegin", '<nav><ol><li data-berichtenbox-map-kruimel><a href="/moza/berichtenbox/">Inbox</a></li></ol></nav>');
		const uitkomst = { ...UITKOMST, berichten: [bericht] };
		const keten = zetKeten({ uitkomst });
		keten.keten.haalUitMap = vi.fn(async () => {
			// Zoals het transport: de lijst is meteen bijgewerkt, vóór het antwoord terugkomt.
			keten.meld({ uitkomst: { ...uitkomst, berichten: [{ ...bericht, map: null }] } });
			return {};
		});

		await laadBerichtenbox();
		await laatLaden();

		expect(knop().hidden).toBe(false);
		expect(document.querySelector("[data-demo-meta]").textContent).toContain("Te bespreken met adviseur");
		expect(document.querySelector("[data-berichtenbox-map-kruimel] a").textContent).toBe("Te bespreken met adviseur");

		knop().click();
		await laatLaden();

		expect(keten.keten.haalUitMap).toHaveBeenCalledWith("b2");
		expect(knop().hidden).toBe(true);
		expect(document.querySelector("[data-demo-meta]").textContent).not.toContain("Te bespreken met adviseur");
		expect(document.querySelector("[data-berichtenbox-map-kruimel] a").textContent).toBe("Inbox");
		expect(document.querySelector("[data-demo-inhoud-status]").textContent).toContain("inbox");
		expect(document.activeElement).toBe(document.querySelector('[data-actie="markeren"]'));
	});

	it("laat de knop staan en zegt wat er misging als het stelsel weigert", async () => {
		const bericht = ketenBericht("b2", "Te bespreken met adviseur");
		bouwDemoDetailPagina(bericht);
		const keten = zetKeten({ uitkomst: { ...UITKOMST, berichten: [bericht] } });
		keten.keten.haalUitMap = vi.fn(async () => ({ fout: "Wij konden dit bericht niet uit de map halen. Het staat nog in de map. Probeer het opnieuw." }));

		await laadBerichtenbox();
		await laatLaden();
		knop().click();
		await laatLaden();

		expect(knop().hidden).toBe(false);
		expect(knop().getAttribute("aria-disabled")).toBeNull();
		expect(document.querySelector("[data-berichtenbox-storing-tekst]").textContent).toContain("niet uit de map halen");
		expect(document.querySelector("[data-demo-meta]").textContent).toContain("Te bespreken met adviseur");
	});
});
