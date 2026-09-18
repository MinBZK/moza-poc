// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Na inloggen met NL Wallet staat de naam uit de wallet in de balk, niet die van de persona.
 *
 * De persona is het bedrijf; de wallet zegt wie er inlogt. nl-wallet-inloggen.js bewaart die naam
 * in sessionStorage onder "inlog:persoon". Alleen voornaam en achternaam als strings tellen: wat er
 * verder in de opslag staat, is in de browser aan te passen en wordt genegeerd.
 */
const BRON = readFileSync(process.cwd() + "/assets/javascript/personas.js", "utf8");

function opslag(begin = {}) {
	const kluis = { ...begin };
	return {
		getItem: (k) => (k in kluis ? kluis[k] : null),
		setItem: (k, v) => {
			kluis[k] = String(v);
		},
		removeItem: (k) => {
			delete kluis[k];
		},
		key: (i) => Object.keys(kluis)[i] ?? null,
		get length() {
			return Object.keys(kluis).length;
		},
	};
}

function draai(sessie) {
	vi.stubGlobal("localStorage", opslag());
	vi.stubGlobal("sessionStorage", opslag(sessie));
	document.body.innerHTML = '<span data-profiel="naam"></span><span data-profiel="voornaam-bedrijf"></span>';
	window.personasData = [{ id: "koffiezaak", label: "Horeca", actief: true, persoon: { voornaam: "Claudia", achternaam: "van Dam" }, bedrijf: { handelsnaam: "Koffiezaak De Boon", kvkNummer: "85234567" } }];
	new Function(BRON).call(window);
	return [...document.querySelectorAll("[data-profiel]")].map((el) => el.textContent);
}

beforeEach(() => {
	vi.spyOn(console, "info").mockImplementation(() => {});
	window.history.replaceState({}, "", "/moza/");
});

afterEach(() => {
	delete window.Personas;
	delete window.personasData;
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("naam na inloggen met NL Wallet", () => {
	it("toont de persona zolang er niet met de wallet is ingelogd", () => {
		expect(draai({})).toEqual(["Claudia van Dam", "Claudia van Dam van Koffiezaak De Boon"]);
	});

	it("toont de naam uit de wallet bij het bedrijf van de persona", () => {
		const inlog = JSON.stringify({ voornaam: "Frouke", achternaam: "Jansen", middel: "NL Wallet" });
		expect(draai({ "inlog:persoon": inlog })).toEqual(["Frouke Jansen", "Frouke Jansen van Koffiezaak De Boon"]);
	});

	it.each([
		["onleesbare JSON", "{kapot"],
		["een naam zonder achternaam", JSON.stringify({ voornaam: "Frouke" })],
		["geen strings", JSON.stringify({ voornaam: ["<b>"], achternaam: 1 })],
	])("valt terug op de persona bij %s", (_, waarde) => {
		expect(draai({ "inlog:persoon": waarde })[0]).toBe("Claudia van Dam");
	});
});
