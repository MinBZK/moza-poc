// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Waar je terechtkomt na een persona-wissel.
 *
 * Binnen de berichtenbox hoort dat de inbox van dít portaal te zijn. Een bericht is van één persona:
 * blijf je op de detailpagina staan, dan zoekt de nieuwe persona een bericht dat niet van hem is —
 * en bij een persona die zijn berichten uit het stelsel haalt bestaat die pagina niet eens.
 */
const BRON = readFileSync("assets/javascript/personas.js", "utf8");

const PERSONAS = [
	{ id: "koffiezaak", label: "Koffiezaak", actief: true, persoon: { voornaam: "A", achternaam: "B" }, bedrijf: { handelsnaam: "Koffie", kvkNummer: "1" } },
	{ id: "bloemenkweker", label: "Bloemenkweker", actief: false, persoon: { voornaam: "C", achternaam: "D" }, bedrijf: { handelsnaam: "Bloem", kvkNummer: "2" } },
];

function draai(pad) {
	document.body.innerHTML = '<div class="feature-flags-panel"><button class="feature-flags-clear"></button></div>';
	window.history.replaceState(null, "", pad);
	window.personasData = PERSONAS;
	window.localStorage.clear();
	new Function(BRON).call(window);
}

/** Kiest de tweede persona in het Flags-paneel en geeft terug waarheen genavigeerd zou worden. */
function wisselViaPaneel() {
	let doel = null;
	Object.defineProperty(window, "location", {
		value: new Proxy(window.location, {
			set(mik, sleutel, waarde) {
				if (sleutel === "href") {
					doel = waarde;
					return true;
				}
				mik[sleutel] = waarde;
				return true;
			},
			get: (mik, sleutel) => mik[sleutel],
		}),
		configurable: true,
	});
	const radios = [...document.querySelectorAll('input[name="persona"]')];
	radios[1].dispatchEvent(new window.Event("change"));
	return doel;
}

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("waar een persona-wissel op uitkomt", () => {
	it("gaat vanaf een detailpagina naar de inbox", () => {
		draai("/moza/berichtenbox/bericht/msg-0001/");
		expect(wisselViaPaneel()).toBe("/moza/berichtenbox/?persona=Bloemenkweker");
	});

	it("gaat vanaf het archief naar de inbox", () => {
		draai("/moza/berichtenbox/berichtenbox-archief/");
		expect(wisselViaPaneel()).toBe("/moza/berichtenbox/?persona=Bloemenkweker");
	});

	it("laat een ?pagina= niet meereizen naar een lijst met een andere lengte", () => {
		draai("/moza/berichtenbox/?pagina=7");
		expect(wisselViaPaneel()).toBe("/moza/berichtenbox/?persona=Bloemenkweker");
	});

	it("blijft binnen het portaal waar u was", () => {
		draai("/mijn-belastingdienst/berichtenbox/bericht-demo/");
		expect(wisselViaPaneel()).toBe("/mijn-belastingdienst/berichtenbox/?persona=Bloemenkweker");
	});

	it("laat pagina's buiten de berichtenbox staan waar ze staan", () => {
		// Daar is een wissel geen reden om ergens anders heen te gaan.
		draai("/moza/lopende-zaken/");
		expect(wisselViaPaneel()).toBe("/moza/lopende-zaken/?persona=Bloemenkweker");
	});
});
