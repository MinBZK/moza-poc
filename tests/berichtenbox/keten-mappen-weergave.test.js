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
	return { id, magazijnId: "00000001823288444000", afzender: "Belastingdienst", onderwerp: "Onderwerp " + id, datum: "2026-09-21", isOngelezen: false, plek: "inbox", map, inhoud: "", uitKeten: true, ...extra };
}

// Zoals het transport het levert: het archief en de prullenbak zijn bij het stelsel mappen, maar
// komen hier als `plek` en zonder `map`.
const opPlek = (uitkomst, plekken) => ({ ...uitkomst, berichten: uitkomst.berichten.map((b) => (plekken[b.id] ? { ...b, plek: plekken[b.id], map: null } : b)) });

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
	let huidig = uitkomst === undefined ? null : uitkomst;
	// Zoals het transport: de lijst is meteen bijgewerkt en gemeld, vóór het antwoord terugkomt.
	const wijzig = (maak) => {
		huidig = { ...huidig, berichten: maak(huidig.berichten) };
		kijkers.forEach((k) => k({ melding: null, voortgang: null, uitkomst: huidig }));
		return {};
	};
	const keten = {
		verplaats: vi.fn(async (id, plek) => wijzig((berichten) => berichten.map((b) => (b.id === id ? { ...b, plek, map: null } : b)))),
		verwijder: vi.fn(async (id) => wijzig((berichten) => berichten.filter((b) => b.id !== id))),
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
			if (toestand.uitkomst) huidig = toestand.uitkomst;
			kijkers.forEach((k) => k({ melding: null, voortgang: null, uitkomst: null, ...toestand }));
		},
		klaar(u) {
			huidig = u;
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

	// Het archief en de prullenbak zijn bij het stelsel mappen, maar ze hebben hun eigen tabblad: in
	// het mappenoverzicht horen ze niet, en een bericht dat daar staat telt bij geen andere map mee.
	it("telt een gearchiveerd of weggegooid bericht niet mee, en zet het archief niet tussen de mappen", async () => {
		bouwPagina([], { mappenbalk: true });
		zetKeten({ uitkomst: opPlek(UITKOMST, { b2: "archief", r2: "prullenbak" }) });

		await laadBerichtenbox();
		await laatLaden();

		expect(mappenInBalk()).toEqual(["Boekhouding 2026 (1 bericht)", "Subsidies (1 bericht)"]);
		expect(scheiding().hidden).toBe(false);
		expect(rijen().map((r) => r.dataset.berichtId)).not.toContain("b2");
	});

	it("archiveert en gooit weg bij het stelsel, en werkt het overzicht daarna bij", async () => {
		bouwPagina([], { mappenbalk: true });
		const keten = zetKeten({ uitkomst: UITKOMST });
		await laadBerichtenbox();
		await laatLaden();

		const rij = (id) => rijen().find((r) => r.dataset.berichtId === id);
		rij("b2").querySelector('[data-row-actie="archiveren"]').click();
		await laatLaden();
		expect(keten.keten.verplaats).toHaveBeenCalledWith("b2", "archief");
		expect(rij("b2")).toBeUndefined();
		expect(mappenInBalk()).toEqual(["Boekhouding 2026 (2 berichten)", "Subsidies (1 bericht)"]);

		rij("r2").querySelector('[data-row-actie="verwijderen"]').click();
		await laatLaden();
		expect(keten.keten.verplaats).toHaveBeenCalledWith("r2", "prullenbak");
		expect(mappenInBalk()).toEqual(["Boekhouding 2026 (1 bericht)", "Subsidies (1 bericht)"]);
		expect(scheiding().hidden).toBe(false);
		// Niets in deze browser: wie van persona wisselt en terugkomt, vindt het bericht waar het stond.
		const bewaard = JSON.parse(window.localStorage.getItem("berichtenbox"));
		expect(bewaard.gearchiveerd || {}).toEqual({});
		expect(bewaard.verwijderd || {}).toEqual({});
	});

	it("laat het bericht staan en zegt wat er misging als het stelsel het verplaatsen weigert", async () => {
		bouwPagina([], { mappenbalk: true });
		const keten = zetKeten({ uitkomst: UITKOMST });
		keten.keten.verplaats = vi.fn(async () => ({ fout: "Wij konden dit bericht niet verplaatsen. Het staat nog waar het stond. Probeer het opnieuw." }));
		await laadBerichtenbox();
		await laatLaden();

		rijen()
			.find((r) => r.dataset.berichtId === "b2")
			.querySelector('[data-row-actie="archiveren"]')
			.click();
		await laatLaden();

		expect(rijen().map((r) => r.dataset.berichtId)).toContain("b2");
		expect(document.querySelector("[data-berichtenbox-storing-tekst]").textContent).toContain("niet verplaatsen");
		expect(mappenInBalk()).toContain("Te bespreken met adviseur (1 bericht)");
	});

	it("toont in het archief wat bij het stelsel in het archief staat", async () => {
		bouwPagina([], { view: "archief" });
		zetKeten({ uitkomst: opPlek(UITKOMST, { b2: "archief", r2: "prullenbak" }) });

		await laadBerichtenbox();
		await laatLaden();

		expect(rijen().map((r) => r.dataset.berichtId)).toEqual(["b2"]);
	});

	// Het tabblad is het enige op de pagina dat zegt welke map er openstaat. Verdwijnt het met het
	// laatste bericht, dan staat de bezoeker voor een lege lijst zonder te weten waarom.
	it("laat de map die openstaat staan als het laatste bericht eruit gearchiveerd wordt", async () => {
		bouwPagina([], { mappenbalk: true, pad: "/moza/berichtenbox/?map=" + encodeURIComponent("Te bespreken met adviseur") });
		zetKeten({ uitkomst: UITKOMST });
		await laadBerichtenbox();
		await laatLaden();

		rijen()[0].querySelector('[data-row-actie="archiveren"]').click();
		await laatLaden();

		expect(rijen()).toEqual([]);
		expect(mappenInBalk()).toEqual(["Boekhouding 2026 (2 berichten)", "Subsidies (1 bericht)", "Te bespreken met adviseur (0 berichten)"]);
		const actief = document.querySelector('.tablist [aria-current="page"]');
		expect(actief && actief.textContent).toContain("Te bespreken met adviseur");
	});

	// De algemene lege staat wijst naar een filter en belooft een eerste bericht. In een lege map
	// klopt geen van beide: de berichten zijn er, alleen in het archief of de prullenbak.
	it("zegt in een lege map waar de berichten gebleven zijn, en bij een zoekterm weer het algemene", async () => {
		const leeg = () => document.querySelector("[data-berichtenbox-empty]");
		const leegMap = () => document.querySelector("[data-berichtenbox-empty-map]");
		bouwPagina([], { mappenbalk: true, pad: "/moza/berichtenbox/?map=" + encodeURIComponent("Te bespreken met adviseur") });
		zetKeten({ uitkomst: UITKOMST });
		await laadBerichtenbox();
		await laatLaden();

		expect(leeg().hidden).toBe(true);
		expect(leegMap().hidden).toBe(true);

		rijen()[0].querySelector('[data-row-actie="archiveren"]').click();
		await laatLaden();
		expect(leegMap().hidden).toBe(false);
		expect(leeg().hidden).toBe(true);

		const zoek = document.querySelector("[data-berichtenbox-search-input]");
		zoek.value = "bestaat nergens";
		zoek.dispatchEvent(new Event("input", { bubbles: true }));
		await laatLaden();
		expect(leegMap().hidden).toBe(true);
		expect(leeg().hidden).toBe(false);
	});

	it("laat de algemene lege staat staan in een inbox zonder map", async () => {
		bouwPagina([], { mappenbalk: true });
		zetKeten({ uitkomst: { ...UITKOMST, berichten: [ketenBericht("b3", null, { plek: "archief" })] } });
		await laadBerichtenbox();
		await laatLaden();

		expect(document.querySelector("[data-berichtenbox-empty]").hidden).toBe(false);
		expect(document.querySelector("[data-berichtenbox-empty-map]").hidden).toBe(true);
	});

	// Tijdens de ronde staat een map er met het aantal van de organisatie. Staat het bericht aan het
	// eind ergens anders, dan verdwijnt de map onder het toetsenbord vandaan.
	it("zet de focus op een tabblad dat blijft als de map met de focus verdwijnt", async () => {
		bouwPagina([], { mappenbalk: true });
		const keten = zetKeten({});
		await laadBerichtenbox();
		await laatLaden();

		keten.meld({ voortgang: { bevraagd: 2, klaar: 2, gevonden: 5, mappen: [{ naam: "Te bespreken met adviseur", aantalBerichten: 1 }] } });
		const map = document.querySelector('.tablist [data-map-slug="Te bespreken met adviseur"]');
		map.querySelector("a").focus();
		expect(map.contains(document.activeElement)).toBe(true);

		keten.klaar(opPlek(UITKOMST, { b2: "archief" }));
		await laatLaden();

		expect(map.isConnected).toBe(false);
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
		bouwPagina([], { mappenbalk: true });
		zetKeten({ uitkomst: { ...UITKOMST, berichten: [ketenBericht("b2", null, { plek: "archief" }), ketenBericht("b3", null)] } });

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

describe("archiveren en weggooien op de detailpagina van een bericht uit het stelsel", () => {
	const actie = (naam) => document.querySelector('[data-actie="' + naam + '"]');

	async function open(bericht) {
		bouwDemoDetailPagina(bericht);
		const keten = zetKeten({ uitkomst: { ...UITKOMST, berichten: [bericht] } });
		await laadBerichtenbox();
		await laatLaden();
		return keten.keten;
	}

	it.each([
		["archiveren", "archief"],
		["verwijderen", "prullenbak"],
	])("zet het bericht met %s bij het stelsel in het %s", async (naam, plek) => {
		const keten = await open(ketenBericht("b2", "Te bespreken met adviseur"));

		actie(naam).click();
		await laatLaden();

		expect(keten.verplaats).toHaveBeenCalledWith("b2", plek);
		const bewaard = JSON.parse(window.localStorage.getItem("berichtenbox"));
		expect(bewaard.gearchiveerd || {}).toEqual({});
		expect(bewaard.verwijderd || {}).toEqual({});
	});

	it.each([
		["archiveren", "archief", "Terugplaatsen in inbox"],
		["verwijderen", "prullenbak", "Terugzetten"],
	])("zet het met dezelfde knop (%s) terug in de inbox als het in het %s staat", async (naam, plek, label) => {
		const keten = await open(ketenBericht("b2", null, { plek }));
		expect(actie(naam).textContent).toContain(label);

		actie(naam).click();
		await laatLaden();

		expect(keten.verplaats).toHaveBeenCalledWith("b2", "inbox");
	});

	it("blijft op de pagina en zegt wat er misging als het stelsel weigert", async () => {
		const keten = await open(ketenBericht("b2", "Te bespreken met adviseur"));
		keten.verplaats = vi.fn(async () => ({ fout: "Wij konden dit bericht niet verplaatsen. Het staat nog waar het stond. Probeer het opnieuw." }));
		const pad = location.pathname;

		actie("archiveren").click();
		await laatLaden();

		expect(location.pathname).toBe(pad);
		expect(document.querySelector("[data-berichtenbox-storing-tekst]").textContent).toContain("niet verplaatsen");
		expect(actie("archiveren").getAttribute("aria-disabled")).toBeNull();
	});

	it("verwijdert een bericht uit de prullenbak voorgoed bij het stelsel, na bevestiging", async () => {
		const keten = await open(ketenBericht("b2", null, { plek: "prullenbak" }));
		expect(actie("voorgoed-verwijderen").hidden).toBe(false);

		actie("voorgoed-verwijderen").click();
		expect(keten.verwijder).not.toHaveBeenCalled();
		document.querySelector("[data-voorgoed-bevestig]").click();
		await laatLaden();

		expect(keten.verwijder).toHaveBeenCalledWith("b2");
		const bewaard = JSON.parse(window.localStorage.getItem("berichtenbox"));
		expect(bewaard.voorgoedVerwijderd || {}).toEqual({});
	});

	it("laat het paneel staan en zegt wat er misging als het stelsel het verwijderen weigert", async () => {
		const keten = await open(ketenBericht("b2", null, { plek: "prullenbak" }));
		keten.verwijder = vi.fn(async () => ({ fout: "Wij konden dit bericht niet verwijderen. Het staat nog in de prullenbak. Probeer het opnieuw." }));

		actie("voorgoed-verwijderen").click();
		document.querySelector("[data-voorgoed-bevestig]").click();
		await laatLaden();

		expect(document.querySelector("[data-voorgoed-paneel]")).not.toBeNull();
		expect(document.querySelector("[data-berichtenbox-storing-tekst]").textContent).toContain("niet verwijderen");
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

	// In het archief of de prullenbak staat al een knop die het bericht terugzet in de inbox.
	it.each([
		["het archief", "archief"],
		["de prullenbak", "prullenbak"],
	])("biedt de knop niet aan voor een bericht in %s", async (_, plek) => {
		const bericht = ketenBericht("b2", null, { plek });
		bouwDemoDetailPagina(bericht);
		zetKeten({ uitkomst: { ...UITKOMST, berichten: [bericht] } });

		await laadBerichtenbox();
		await laatLaden();

		expect(knop().hidden).toBe(true);
	});

	// Archiveren stuurt de bezoeker naar de lijst; met de terugknop komt deze pagina terug zoals ze
	// was, met de knop er nog op.
	it("haalt niets uit de map als het bericht intussen gearchiveerd is", async () => {
		bouwDemoDetailPagina(ketenBericht("b2", "Te bespreken met adviseur"));
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
