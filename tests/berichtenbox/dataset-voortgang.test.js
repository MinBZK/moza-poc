import { describe, it, expect, vi, afterEach } from "vitest";
import { datasetBron } from "../../assets/javascript/berichtenbox/dataset-bron.js";

/**
 * De nagebootste ophaalronde van de dataset-bron.
 *
 * Zij verzint aankomsttijden per bron en is dus brongedrag, geen opmaak. Het punt van deze tests:
 * zij moet eindigen op de aantallen die de bezoeker daarna écht ziet, en zij moet zich melden langs
 * dezelfde weg als de echte voortgang van het stelsel.
 */

function bericht(id, magazijnId) {
	return { id, magazijnId, afzender: magazijnId, onderwerp: "Onderwerp " + id, datum: "2026-04-01" };
}

const DATA = {
	berichten: [
		bericht("msg-1", "rdw"),
		bericht("msg-2", "rdw"),
		bericht("msg-3", "kvk"),
		bericht("msg-4", "belastingdienst"),
	],
	magazijnen: [{ id: "rdw" }, { id: "kvk" }, { id: "belastingdienst" }],
	mappen: [],
};

function nepState() {
	return { ruw: { eersteBezoekGehad: false, nieuweBerichten: [] }, bewaar: vi.fn(() => true) };
}

/** Draait de ronde uit en geeft alles terug wat er gemeld is. */
async function draai(opties = {}) {
	const gemeld = [];
	const state = opties.state || nepState();
	const bron = datasetBron(DATA, {
		state,
		magAnimeren: () => true,
		zichtbaarheid: opties.zichtbaarheid || {},
		...opties.extra,
	});

	bron.volgVoortgang((voortgang) => gemeld.push(voortgang));

	await new Promise((klaar) => {
		bron.start(() => []);
		const tot = Date.now() + 15000;
		const kijk = setInterval(() => {
			if (gemeld[gemeld.length - 1] === null || Date.now() > tot) {
				clearInterval(kijk);
				klaar();
			}
		}, 20);
	});

	return { gemeld, state };
}

afterEach(() => vi.restoreAllMocks());

describe("de nagebootste ophaalronde", () => {
	it("meldt zich langs volgVoortgang en sluit af met null", async () => {
		const { gemeld } = await draai();

		expect(gemeld.length).toBeGreaterThan(1);
		expect(gemeld[0]).toEqual({ bevraagd: 3, klaar: 0, gevonden: 0 });
		expect(gemeld[gemeld.length - 1]).toBe(null);
	}, 20000);

	it("eindigt op het aantal bronnen en berichten dat de bezoeker daarna ziet", async () => {
		// Loopt zij naar andere getallen toe, dan telt de balk naar iets anders dan er komt.
		const { gemeld } = await draai();
		const laatste = gemeld.filter(Boolean).at(-1);

		expect(laatste.klaar).toBe(3);
		expect(laatste.gevonden).toBe(4);
	}, 20000);

	it("telt alleen wat door het organisatiefilter komt", async () => {
		const { gemeld } = await draai({
			zichtbaarheid: { magazijnDoorOrgFilter: (id) => id === "belastingdienst", magazijnToegestaan: (id) => id === "belastingdienst" },
		});
		const laatste = gemeld.filter(Boolean).at(-1);

		expect(laatste.bevraagd).toBe(1);
		expect(laatste.gevonden).toBe(1);
	}, 20000);

	it("laat een onbereikbaar magazijn nooit arriveren", async () => {
		// Bevraagd worden álle bronnen die het filter toelaat, ook een onbereikbare. Die arriveert
		// niet, dus de teller blijft steken — dat is het punt van de nabootsing.
		const { gemeld } = await draai({
			zichtbaarheid: { magazijnToegestaan: (id) => id !== "rdw" },
		});
		const laatste = gemeld.filter(Boolean).at(-1);

		expect(laatste.bevraagd).toBe(3);
		expect(laatste.klaar).toBe(2);
	}, 20000);

	it("telt gearchiveerde berichten niet mee", async () => {
		const { gemeld } = await draai({
			zichtbaarheid: { statusVan: (id) => (id === "msg-1" ? "archief" : "inbox") },
		});
		const laatste = gemeld.filter(Boolean).at(-1);

		expect(laatste.gevonden).toBe(3);
	}, 20000);

	it("bewaart aan het eind dat het eerste bezoek gehad is", async () => {
		const { state } = await draai();

		expect(state.ruw.eersteBezoekGehad).toBe(true);
		expect(state.bewaar).toHaveBeenCalled();
	}, 20000);

	it("klaagt niet bij de bezoeker als dat bewaren mislukt", async () => {
		// Hinderlijk — de animatie speelt opnieuw af — maar geen reden om iemand lastig te vallen.
		const waarschuwing = vi.spyOn(console, "warn").mockImplementation(() => {});
		const meldStoring = vi.fn();
		const state = nepState();
		state.bewaar = () => false;
		await draai({ state, extra: { meldStoring } });

		expect(meldStoring).not.toHaveBeenCalled();
		expect(waarschuwing).toHaveBeenCalled();
	}, 20000);

	it("animeert niet als de render-laag daar geen ruimte voor ziet", async () => {
		const gemeld = [];
		const bron = datasetBron(DATA, { state: nepState(), magAnimeren: () => false });
		bron.volgVoortgang((v) => gemeld.push(v));
		bron.start(() => []);
		await new Promise((r) => setTimeout(r, 100));

		expect(gemeld).toEqual([]);
	});

	it("speelt de ronde opnieuw af op verzoek", async () => {
		// De herstelknop en de organisatie-schakelaar vragen erom; er valt bij de dataset niets écht
		// op te halen, maar de render-laag hoeft dat niet te weten.
		const gemeld = [];
		const bron = datasetBron(DATA, { state: nepState(), magAnimeren: () => false });
		bron.volgVoortgang((v) => gemeld.push(v));

		await new Promise((klaar) => bron.herhaalOphalen(klaar));

		expect(gemeld.filter(Boolean).length).toBeGreaterThan(1);
		expect(gemeld.at(-1)).toBe(null);
	}, 20000);
});
