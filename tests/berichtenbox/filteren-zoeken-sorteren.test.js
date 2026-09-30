// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bericht, bouwPagina, laadBerichtenbox, laatLaden, rijen } from "./dom.js";

/**
 * Filteren, zoeken en sorteren in de inbox, over alle berichten die de bron leverde.
 *
 * Het stelsel filtert en sorteert niet; de berichtenbox doet dat in de browser. Daarom moeten de
 * keuzes van de bezoeker blijven staan als de bron een nieuwe lijst levert of er een bericht bij
 * komt, en hoort een binnenkomer te landen waar filter, zoekterm en sortering hem zetten.
 */

const MAGAZIJNEN = [
	{ id: "bd", naam: "Belastingdienst" },
	{ id: "rvo", naam: "RVO" },
	{ id: "kvk", naam: "KVK" },
];

function ketenBericht(id, magazijnId, afzender, onderwerp, tijdstip) {
	return { id, magazijnId, afzender, onderwerp, datum: tijdstip.slice(0, 10), tijdstip, isOngelezen: true, map: null, inhoud: "", uitKeten: true };
}

const BD_OUD = ketenBericht("bd-oud", "bd", "Belastingdienst", "Aanslag 2024", "2025-03-01T09:00:00Z");
const BD_NIEUW = ketenBericht("bd-nieuw", "bd", "Belastingdienst", "Aanslag 2025", "2026-03-01T09:00:00Z");
const BD_TOESLAG = ketenBericht("bd-toeslag", "bd", "Belastingdienst", "Toeslag", "2026-04-01T09:00:00Z");
const RVO_AANSLAG = ketenBericht("rvo-aanslag", "rvo", "RVO", "Aanslag subsidie", "2026-05-01T09:00:00Z");
const KVK_UITTREKSEL = ketenBericht("kvk-uittreksel", "kvk", "KVK", "Uittreksel", "2026-02-01T09:00:00Z");

const ALLE = [RVO_AANSLAG, BD_TOESLAG, BD_NIEUW, KVK_UITTREKSEL, BD_OUD];

/** Een dubbel voor berichtenbox-keten.js; `meldUitkomst` is wat het pollen of `_volgen` doorgeeft. */
function zetKeten(uitkomst) {
	const kijkers = [];
	window.BerichtenboxKeten = {
		bezig: false,
		aangesloten: true,
		melding: null,
		voortgang: null,
		berichten: () => Promise.resolve(uitkomst),
		opWijziging: (kijker) => kijkers.push(kijker),
		meldVerwerkingsfout: vi.fn(),
		stopPollen: vi.fn(),
	};
	return {
		meldUitkomst(u) {
			kijkers.forEach((k) => k({ melding: null, voortgang: null, uitkomst: u }));
		},
	};
}

async function laadKeten(berichten, opties) {
	bouwPagina([bericht()], opties);
	const keten = zetKeten({ berichten, magazijnen: MAGAZIJNEN });
	await laadBerichtenbox();
	await laatLaden();
	return keten;
}

const ids = () => rijen().map((rij) => rij.dataset.berichtId);
const keuze = () => document.querySelector("[data-berichtenbox-afzender-filter]");
const blok = () => document.querySelector("[data-berichtenbox-afzender]");
const live = () => document.querySelector("[data-berichtenbox-live]").textContent;

function kiesAfzender(id) {
	keuze().value = id;
	keuze().dispatchEvent(new window.Event("change", { bubbles: true }));
}

function zoek(term) {
	const veld = document.querySelector("[data-berichtenbox-search-input]");
	veld.value = term;
	veld.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function sorteer(sleutel, keren = 1) {
	for (let i = 0; i < keren; i += 1) document.querySelector('button[data-sort="' + sleutel + '"]').click();
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	delete window.BerichtenboxKeten;
	vi.restoreAllMocks();
});

describe("het afzenderfilter", () => {
	it("biedt de afzenders van de bron aan, op naam gesorteerd", async () => {
		await laadKeten(ALLE);

		expect(blok().hidden).toBe(false);
		expect([...keuze().options].map((o) => o.textContent)).toEqual(["Alle afzenders", "Belastingdienst", "KVK", "RVO"]);
	});

	it("toont alleen de berichten van de gekozen afzender", async () => {
		await laadKeten(ALLE);

		kiesAfzender("bd");

		expect(ids()).toEqual(["bd-toeslag", "bd-nieuw", "bd-oud"]);
	});

	it("toont weer alles bij 'Alle afzenders'", async () => {
		await laadKeten(ALLE);

		kiesAfzender("bd");
		kiesAfzender("");

		expect(ids()).toHaveLength(ALLE.length);
	});

	it("blijft verborgen met één afzender, want dan valt er niets te kiezen", async () => {
		await laadKeten([BD_OUD, BD_NIEUW]);

		expect(blok().hidden).toBe(true);
	});

	it("blijft verborgen zonder berichten en zonder afzenders", async () => {
		bouwPagina([bericht()]);
		zetKeten({ berichten: [], magazijnen: [] });
		await laadBerichtenbox();
		await laatLaden();

		expect(blok().hidden).toBe(true);
		expect(ids()).toEqual([]);
	});

	it("houdt de keuze vast als de bron een nieuwe lijst levert", async () => {
		const keten = await laadKeten(ALLE);
		kiesAfzender("rvo");

		keten.meldUitkomst({ berichten: [...ALLE, ketenBericht("rvo-2", "rvo", "RVO", "Besluit", "2026-06-01T09:00:00Z")], magazijnen: MAGAZIJNEN });
		await laatLaden();

		expect(keuze().value).toBe("rvo");
		expect(ids()).toEqual(["rvo-2", "rvo-aanslag"]);
	});
});

describe("filteren, zoeken en sorteren samen", () => {
	it("past afzender, zoekterm en sortering tegelijk toe, in beide richtingen", async () => {
		await laadKeten(ALLE);

		kiesAfzender("bd");
		zoek("aanslag");
		sorteer("datum");
		expect(ids()).toEqual(["bd-oud", "bd-nieuw"]);

		sorteer("datum");
		expect(ids()).toEqual(["bd-nieuw", "bd-oud"]);
	});

	it("sorteert alfabetisch op onderwerp binnen het filter", async () => {
		await laadKeten(ALLE);

		zoek("aanslag");
		sorteer("onderwerp");

		expect(ids()).toEqual(["bd-oud", "bd-nieuw", "rvo-aanslag"]);
	});

	it("zegt dat er niets is als de combinatie niets oplevert", async () => {
		await laadKeten(ALLE);

		kiesAfzender("kvk");
		zoek("aanslag");

		expect(ids()).toEqual([]);
		expect(document.querySelector("[data-berichtenbox-empty]").hidden).toBe(false);
	});

	it.each([
		["één bericht", [BD_NIEUW], ["bd-nieuw"]],
		["meerdere", ALLE, ["bd-oud", "bd-nieuw"]],
	])("werkt met %s", async (_naam, berichten, verwacht) => {
		await laadKeten(berichten);

		if (!blok().hidden) kiesAfzender("bd");
		zoek("aanslag");
		sorteer("datum");

		expect(ids()).toEqual(verwacht);
	});

	it("houdt de sortering vast als de bron een nieuwe lijst levert", async () => {
		// Voorheen sorteerde de kolomkop de berichten zelf. De volgende lijst van de bron kwam dan in
		// bronvolgorde op het scherm, terwijl aria-sort nog "oplopend" zei.
		const keten = await laadKeten(ALLE);
		sorteer("datum");

		keten.meldUitkomst({ berichten: [...ALLE].reverse(), magazijnen: MAGAZIJNEN });
		await laatLaden();

		expect(ids()).toEqual(["bd-oud", "kvk-uittreksel", "bd-nieuw", "bd-toeslag", "rvo-aanslag"]);
		expect(document.querySelector('button[data-sort="datum"]').closest("th").getAttribute("aria-sort")).toBe("ascending");
	});
});

describe("een bericht dat binnenkomt terwijl de bezoeker filtert, zoekt of sorteert", () => {
	const NIEUW_BD = ketenBericht("bd-binnen", "bd", "Belastingdienst", "Aanslag 2026", "2025-09-01T09:00:00Z");
	const NIEUW_RVO = ketenBericht("rvo-binnen", "rvo", "RVO", "Aanslag lening", "2026-09-30T09:00:00Z");

	it("landt op zijn plek in de gekozen sortering, niet bovenaan", async () => {
		const keten = await laadKeten(ALLE);
		sorteer("datum");

		keten.meldUitkomst({ berichten: [NIEUW_BD, ...ALLE], magazijnen: MAGAZIJNEN });
		await laatLaden();

		expect(ids()).toEqual(["bd-oud", "bd-binnen", "kvk-uittreksel", "bd-nieuw", "bd-toeslag", "rvo-aanslag"]);
		expect(live()).toContain("Nieuw bericht van Belastingdienst: Aanslag 2026");
	});

	it("verschijnt als het past bij afzender en zoekterm, en die blijven staan", async () => {
		const keten = await laadKeten(ALLE);
		kiesAfzender("bd");
		zoek("aanslag");
		sorteer("datum", 2);

		keten.meldUitkomst({ berichten: [NIEUW_BD, ...ALLE], magazijnen: MAGAZIJNEN });
		await laatLaden();

		expect(ids()).toEqual(["bd-nieuw", "bd-binnen", "bd-oud"]);
		expect(keuze().value).toBe("bd");
		expect(document.querySelector("[data-berichtenbox-search-input]").value).toBe("aanslag");
	});

	it("verschijnt niet als het buiten het filter valt, en de melding zegt waarom", async () => {
		const keten = await laadKeten(ALLE);
		kiesAfzender("bd");

		keten.meldUitkomst({ berichten: [NIEUW_RVO, ...ALLE], magazijnen: MAGAZIJNEN });
		await laatLaden();

		expect(ids()).not.toContain("rvo-binnen");
		expect(live()).toContain("Het valt buiten uw filter of zoekterm.");
	});

	it("verschijnt niet als het niet bij de zoekterm past", async () => {
		const keten = await laadKeten(ALLE);
		zoek("toeslag");

		keten.meldUitkomst({ berichten: [NIEUW_RVO, ...ALLE], magazijnen: MAGAZIJNEN });
		await laatLaden();

		expect(ids()).toEqual(["bd-toeslag"]);
	});
});
