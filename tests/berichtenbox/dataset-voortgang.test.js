// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { datasetBron } from "../../assets/javascript/berichtenbox/dataset-bron.js";

/**
 * De nagebootste ophaalronde van de dataset-bron.
 *
 * Zij verzint aankomsttijden per bron en is dus brongedrag, geen opmaak. Twee dingen staan hier op
 * het spel: zij moet eindigen op de aantallen die de bezoeker daarna écht ziet, en zij moet altijd
 * een einde melden — de render-laag houdt de lijst verborgen tot dat einde komt.
 *
 * Let op de omgeving hierboven. Zonder jsdom bestaat `localStorage` niet, neemt
 * `dynamischeBerichtenAan()` altijd zijn catch-tak en logt die bij elke ronde. Een spy op de console
 * is dan altijd geraakt, ongeacht wat de test beweert te toetsen.
 */

function bericht(id, magazijnId) {
	return { id, magazijnId, afzender: magazijnId, onderwerp: "Onderwerp " + id, datum: "2026-04-01" };
}

// Drie bronnen, vijf berichten. Bewust ongelijk: vallen die aantallen samen, dan onderscheidt geen
// enkele assertie de teller "bronnen" van de teller "berichten".
const DATA = {
	berichten: [bericht("msg-1", "rdw"), bericht("msg-2", "rdw"), bericht("msg-3", "kvk"), bericht("msg-4", "belastingdienst"), bericht("msg-5", "belastingdienst")],
	magazijnen: [{ id: "rdw" }, { id: "kvk" }, { id: "belastingdienst" }],
	mappen: [],
};

// Eén bron: de animatie duurt dan 1200 ms in plaats van 4000. Voor alles wat geen meerdere bronnen
// nodig heeft, scheelt dat seconden per test.
const SMAL = {
	berichten: [bericht("msg-1", "rdw"), bericht("msg-2", "rdw")],
	magazijnen: [{ id: "rdw" }],
	mappen: [],
};

function nepState() {
	return {
		ruw: { eersteBezoekGehad: false, nieuweBerichten: [] },
		bewaar: vi.fn(() => true),
		waaromNietBewaard: () => null,
	};
}

/**
 * Draait de ronde uit en geeft alles terug wat er gemeld is.
 *
 * Faalt bij een ronde die niet afrondt, in plaats van na de deadline gewoon op te lossen: dan zou
 * een hangende ronde een trage groene test opleveren, want de eindtelling staat al in `gemeld`.
 */
async function draai(opties = {}) {
	const gemeld = [];
	const state = opties.state || nepState();
	const bron = datasetBron(opties.data || SMAL, {
		state,
		magAnimeren: () => true,
		// Kort: de duur van de nabootsing is niet wat deze tests toetsen, en vier seconden per test
		// telt op tot een halve minuut.
		duurMs: 60,
		zichtbaarheid: opties.zichtbaarheid || {},
		...opties.extra,
	});

	bron.volgVoortgang((voortgang) => gemeld.push(voortgang));
	bron.start(opties.meld || (() => []));

	const tot = Date.now() + 12000;
	while (gemeld.at(-1) !== null) {
		if (Date.now() > tot) throw new Error("de ronde is niet afgerond; laatste melding: " + JSON.stringify(gemeld.at(-1)));
		await new Promise((r) => setTimeout(r, 20));
	}

	return { gemeld, state, bron };
}

const eindtelling = (gemeld) => gemeld.filter(Boolean).at(-1);

beforeEach(() => {
	window.localStorage.clear();
	window.history.replaceState({}, "", "/moza/berichtenbox/");
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("de nagebootste ophaalronde", () => {
	it("meldt zich langs volgVoortgang en sluit af met null", async () => {
		const { gemeld } = await draai();

		expect(gemeld.length).toBeGreaterThan(1);
		expect(gemeld[0]).toEqual({ bevraagd: 1, klaar: 0, gevonden: 0 });
		expect(gemeld.at(-1)).toBe(null);
	}, 20000);

	it("eindigt op het aantal bronnen en berichten dat de bezoeker daarna ziet", async () => {
		// Drie bronnen, vijf berichten: verwisselt de bron de twee tellers, dan valt dit om.
		const { gemeld } = await draai({ data: DATA });

		expect(eindtelling(gemeld)).toEqual({ bevraagd: 3, klaar: 3, gevonden: 5 });
	}, 20000);

	it("bevraagt wat het organisatiefilter toelaat, ook wat niet antwoordt", async () => {
		// Breed toegestaan, smal filter: zo hangt `bevraagd` echt aan het filter en `gevonden` niet.
		// Zou `bereikteBerichten` het filter óók toepassen, dan telde de balk anders.
		const { gemeld } = await draai({
			data: DATA,
			zichtbaarheid: { magazijnDoorOrgFilter: (id) => id !== "rdw" },
		});
		const eind = eindtelling(gemeld);

		expect(eind.bevraagd).toBe(2);
		expect(eind.gevonden).toBe(5);
	}, 20000);

	it("laat een onbereikbaar magazijn nooit arriveren", async () => {
		// Bevraagd worden álle bronnen die het filter toelaat, ook een onbereikbare. Die arriveert
		// niet, dus de teller blijft steken — dat is het punt van de nabootsing.
		const { gemeld } = await draai({
			data: DATA,
			zichtbaarheid: { magazijnToegestaan: (id) => id !== "rdw" },
		});
		const eind = eindtelling(gemeld);

		expect(eind.bevraagd).toBe(3);
		expect(eind.klaar).toBe(2);
		expect(eind.gevonden).toBe(3);
	}, 20000);

	it("telt gearchiveerde berichten niet mee", async () => {
		const { gemeld } = await draai({
			data: DATA,
			zichtbaarheid: { statusVan: (id) => (id === "msg-1" ? "archief" : "inbox") },
		});

		expect(eindtelling(gemeld).gevonden).toBe(4);
	}, 20000);

	it("telt berichten van een andere persona niet mee", async () => {
		const { gemeld } = await draai({
			data: DATA,
			zichtbaarheid: { persoonRelevant: (b) => b.magazijnId !== "belastingdienst" },
		});

		expect(eindtelling(gemeld).gevonden).toBe(3);
	}, 20000);

	it("bewaart aan het eind dat het eerste bezoek gehad is", async () => {
		const { state } = await draai();

		expect(state.ruw.eersteBezoekGehad).toBe(true);
		expect(state.bewaar).toHaveBeenCalled();
	}, 20000);

	it("klaagt niet bij de bezoeker als dat bewaren mislukt", async () => {
		// Hinderlijk — de animatie speelt opnieuw af — maar geen reden om iemand lastig te vallen.
		// Wel met de reden erbij in de console, anders is dit niet van ruis te scheiden.
		const fout = vi.spyOn(console, "error").mockImplementation(() => {});
		const meldStoring = vi.fn();
		const state = nepState();
		state.bewaar = () => false;
		state.waaromNietBewaard = () => "vol";
		await draai({ state, extra: { meldStoring } });

		expect(meldStoring).not.toHaveBeenCalled();
		expect(fout.mock.calls.some((c) => String(c[0]).includes("(vol)"))).toBe(true);
	}, 20000);

	it("animeert niet als de render-laag daar geen ruimte voor ziet", async () => {
		const gemeld = [];
		const bron = datasetBron(SMAL, { state: nepState(), magAnimeren: () => false, duurMs: 60 });
		bron.volgVoortgang((v) => gemeld.push(v));
		bron.start(() => []);
		await new Promise((r) => setTimeout(r, 100));

		expect(gemeld).toEqual([]);
	});
});

describe("de volgorde: eerst ophalen, dan binnendruppelen", () => {
	it("begint pas aan het binnendruppelen als de ronde klaar is", async () => {
		// Verzonnen berichten die binnenkomen terwijl de balk nog telt, spreken de nabootsing tegen.
		// magOphalen is het eerste wat begintDruppelen raadpleegt, dus dat verraadt het moment.
		window.localStorage.setItem("feature:Dynamische berichten", "true");
		const volgorde = [];
		const bron = datasetBron(SMAL, {
			state: nepState(),
			magAnimeren: () => true,
			duurMs: 60,
			magOphalen: () => {
				volgorde.push("druppelen");
				return false;
			},
		});

		bron.volgVoortgang((v) => volgorde.push(v === null ? "einde" : "voortgang"));
		bron.start(() => []);

		const tot = Date.now() + 12000;
		while (!volgorde.includes("druppelen")) {
			if (Date.now() > tot) throw new Error("het binnendruppelen is nooit begonnen");
			await new Promise((r) => setTimeout(r, 20));
		}

		expect(volgorde.indexOf("einde")).toBeGreaterThan(-1);
		expect(volgorde.indexOf("einde")).toBeLessThan(volgorde.indexOf("druppelen"));
	}, 20000);
});

describe("een ronde die halverwege omvalt", () => {
	it("meldt een einde als het inplannen van het volgende beeld mislukt", async () => {
		// Een fout die niet uit de kijker komt maar uit de lus zelf. Zonder vangnet in stap() blijft
		// het bij de laatste voortgangsmelding en komt er nooit een null.
		vi.spyOn(console, "error").mockImplementation(() => {});
		const meldStoring = vi.fn();
		const echt = globalThis.requestAnimationFrame;
		let beurten = 0;
		vi.stubGlobal("requestAnimationFrame", (fn) => {
			beurten += 1;
			if (beurten > 2) throw new Error("geen beeld meer in te plannen");
			return echt ? echt(fn) : setTimeout(fn, 16);
		});

		const { gemeld } = await draai({ extra: { meldStoring } });

		expect(gemeld.at(-1)).toBe(null);
		expect(meldStoring).toHaveBeenCalledWith(expect.stringContaining("afgebroken"));
	}, 20000);

	it("laat een struikelende kijker de ronde niet stilzetten", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const gemeld = [];
		const bron = datasetBron(SMAL, { state: nepState(), magAnimeren: () => true, duurMs: 60 });

		bron.volgVoortgang((voortgang) => {
			gemeld.push(voortgang);
			throw new Error("elke melding gaat mis");
		});

		bron.start(() => []);
		const tot = Date.now() + 12000;
		while (gemeld.at(-1) !== null) {
			if (Date.now() > tot) throw new Error("de ronde is niet afgerond");
			await new Promise((r) => setTimeout(r, 20));
		}

		expect(gemeld.length).toBeGreaterThan(2);
	}, 20000);

	it("start het binnendruppelen ook als het melden misging", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const state = nepState();
		const bron = datasetBron(SMAL, { state, magAnimeren: () => true, duurMs: 60 });
		bron.volgVoortgang(() => {
			throw new Error("altijd mis");
		});

		bron.start(() => []);
		const tot = Date.now() + 12000;
		while (!state.ruw.eersteBezoekGehad) {
			if (Date.now() > tot) throw new Error("de ronde is niet afgerond");
			await new Promise((r) => setTimeout(r, 20));
		}

		// klaar() is de enige weg naar het bewaren én naar het binnendruppelen.
		expect(state.ruw.eersteBezoekGehad).toBe(true);
	}, 20000);
});

describe("om een nieuwe ronde vragen", () => {
	it("speelt de ronde opnieuw af op verzoek", async () => {
		// De herstelknop en de organisatie-schakelaar vragen erom; er valt bij de dataset niets écht
		// op te halen, maar de render-laag hoeft dat niet te weten.
		const gemeld = [];
		const bron = datasetBron(SMAL, { state: nepState(), magAnimeren: () => false, duurMs: 60 });
		bron.volgVoortgang((v) => gemeld.push(v));

		await new Promise((klaar) => bron.herhaalOphalen(klaar));

		expect(gemeld.filter(Boolean).length).toBeGreaterThan(1);
		expect(gemeld.at(-1)).toBe(null);
	}, 20000);

	it("draait één ronde als er twee keer om gevraagd wordt, en bedient beide aanvragers", async () => {
		// Twee ronden tegelijk zouden om beurten in hetzelfde voortgangsblok schrijven, en de eerste
		// die klaar is meldt null terwijl de tweede nog telt. Maar de tweede aanvrager laten vallen
		// mag evenmin: aan zijn vervolg hangt het opnieuw renderen en het bijwerken van de mappen.
		// Zonder dat staat de schakelaar aan, is de keuze bewaard, en verandert het scherm niet.
		const gemeld = [];
		const bediend = [];
		const bron = datasetBron(SMAL, { state: nepState(), magAnimeren: () => false, duurMs: 120 });
		bron.volgVoortgang((v) => gemeld.push(v));

		bron.herhaalOphalen(() => bediend.push("eerste"));
		bron.herhaalOphalen(() => bediend.push("tweede"));

		const tot = Date.now() + 10000;
		while (bediend.length < 2) {
			if (Date.now() > tot) throw new Error("niet beide aanvragers bediend: " + bediend.join(","));
			await new Promise((r) => setTimeout(r, 20));
		}

		expect(bediend).toEqual(["eerste", "tweede"]);
		// Eén ronde, dus precies één einde.
		expect(gemeld.filter((v) => v === null)).toHaveLength(1);
	}, 20000);
});
