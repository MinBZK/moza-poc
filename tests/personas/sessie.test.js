// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Een andere persona kiezen is in deze demo uitloggen bij het Federatief Berichtenstelsel: de sessie
 * van de vorige gaat dicht, en de nieuwe start er bij het eerste verzoek zelf een.
 *
 * Bij elke paginalading, niet alleen bij een wissel in dit tabblad: kiest een ander tabblad een
 * andere persona, dan staat de sessie van de vorige hier nog, terwijl de herkomst in localStorage
 * al zegt dat er niets gewisseld is.
 */
const SESSIE = readFileSync("assets/javascript/keten-sessie.js", "utf8");
const PERSONAS = readFileSync("assets/javascript/personas.js", "utf8");

const PERSONA_DATA = [
	{ id: "proeftuin-een", label: "Een", actief: true, stelsel: true, persoon: {}, bedrijf: { kvkNummer: "90000011" } },
	{ id: "proeftuin-twee", label: "Twee", stelsel: true, persoon: {}, bedrijf: { kvkNummer: "90000012" } },
	{ id: "koffiezaak", label: "Koffie", persoon: {}, bedrijf: { kvkNummer: "85234567" } },
];

let aanroepen;

function laad(persona) {
	document.body.innerHTML = "";
	window.history.replaceState(null, "", "/moza/?persona=" + persona);
	window.personasData = PERSONA_DATA;
	new Function(SESSIE).call(window);
	new Function(PERSONAS).call(window);
}

beforeEach(() => {
	sessionStorage.clear();
	localStorage.clear();
	aanroepen = [];
	vi.stubGlobal("fetch", async (pad, opties) => {
		aanroepen.push({ pad, opties });
		return { ok: true, status: 204 };
	});
	vi.spyOn(console, "info").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	delete window.Personas;
	delete window.KetenSessie;
	delete window.personasData;
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("sessies bij een persona-wissel", () => {
	it("beëindigt de sessie van de vorige persona en vergeet haar", () => {
		sessionStorage.setItem("berichtenbox-sessie:KVK:90000011", "sessie_van_de_vorige_1");

		laad("Twee");

		expect(aanroepen).toHaveLength(1);
		expect(aanroepen[0].pad).toBe("/api/v1/sessies/huidige");
		expect(aanroepen[0].opties).toMatchObject({ method: "DELETE", headers: { "X-Ontvanger": "KVK:90000011", "X-Sessie": "sessie_van_de_vorige_1" } });
		expect(sessionStorage.getItem("berichtenbox-sessie:KVK:90000011")).toBe(null);
	});

	it("laat de sessie van de actieve persona staan, ook na een herlading", () => {
		sessionStorage.setItem("berichtenbox-sessie:KVK:90000011", "sessie_van_de_actieve1");

		laad("Een");

		expect(aanroepen).toHaveLength(0);
		expect(sessionStorage.getItem("berichtenbox-sessie:KVK:90000011")).toBe("sessie_van_de_actieve1");
	});

	it("beëindigt elke sessie bij een persona zonder stelsel", () => {
		sessionStorage.setItem("berichtenbox-sessie:KVK:90000011", "sessie_van_de_vorige_1");
		sessionStorage.setItem("berichtenbox-sessie:KVK:90000012", "sessie_van_de_vorige_2");

		laad("Koffie");

		expect(aanroepen.map((aanroep) => aanroep.opties.headers["X-Ontvanger"]).sort()).toEqual(["KVK:90000011", "KVK:90000012"]);
	});
});
