// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bericht, bouwPagina, laadBerichtenbox, laatLaden } from "./dom.js";

/**
 * De voortgangsanimatie bij het eerste bezoek.
 *
 * Het punt van deze tests is niet de animatie zelf, maar het gat ervóór: tussen het uitvoeren van
 * het script en het moment dat de animatie de lijst verbergt, stonden de server-gerenderde rijen op
 * het scherm. Dit script is een module en draait dus ná alle klassieke defer-scripts, en de
 * animatie begon pas als de bron geladen was — samen lang genoeg om de berichten te zien flitsen.
 */

const BERICHTEN = Array.from({ length: 12 }, (_, i) =>
	bericht({ id: "msg-" + i, magazijnId: i % 3 === 0 ? "rdw" : "belastingdienst", datum: "2026-04-0" + ((i % 9) + 1) })
);

const lijst = () => document.querySelector("[data-berichtenbox-list]");
const voortgang = () => document.querySelector("[data-berichtenbox-progress]");
const pagnav = () => document.querySelector("[data-berichtenbox-pagination]");

/** Het script draaien, maar de bron nog niet laten uitladen. */
async function draaiScript() {
	await laadBerichtenbox();
}

async function laad() {
	await laadBerichtenbox();
	await laatLaden();
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("bij het eerste bezoek staat de lijst nooit even te knipperen", () => {
	it("verbergt de lijst vóórdat er ook maar één rij gebouwd wordt", async () => {
		// Dit is het hele punt, en het is een volgorde, geen eindtoestand. Aan het eind is de lijst
		// in beide gevallen verborgen; het verschil zit erin of dat gebeurt voor of na het
		// opbouwen van de rijen. In een browser is dat verschil precies het flitsen.
		bouwPagina(BERICHTEN);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));

		const tabel = lijst();
		const volgorde = [];
		const kijker = new window.MutationObserver((wijzigingen) => {
			for (const wijziging of wijzigingen) {
				if (wijziging.type === "attributes") volgorde.push(tabel.hidden ? "verborgen" : "zichtbaar");
				else volgorde.push("rijen");
			}
		});
		kijker.observe(tabel, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true });

		await laad();
		kijker.disconnect();

		expect(volgorde[0]).toBe("verborgen");
		expect(volgorde.indexOf("verborgen")).toBeLessThan(volgorde.indexOf("rijen"));
	});

	it("laat ook de paginanavigatie niet zichtbaar worden vóór de lijst", async () => {
		// De navigatie hoort bij de lijst. Zij werd tijdens het renderen zichtbaar gemaakt, en dat
		// renderen gebeurt vóór de animatie.
		bouwPagina(BERICHTEN);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));

		const nav = pagnav();
		const zichtbaarGeweest = [];
		const kijker = new window.MutationObserver(() => zichtbaarGeweest.push(nav.hidden));
		kijker.observe(nav, { attributes: true, attributeFilter: ["hidden"] });

		await laad();
		kijker.disconnect();

		expect(zichtbaarGeweest.every((verborgen) => verborgen === true)).toBe(true);
		expect(nav.hidden).toBe(true);
	});

	it("laat de lijst ná het laden verborgen tot de animatie klaar is", async () => {
		bouwPagina(BERICHTEN);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		await laad();

		expect(lijst().hidden).toBe(true);
		expect(voortgang().hidden).toBe(false);
		expect(pagnav().hidden).toBe(true);
	});

	it("zet lijst en navigatie terug zodra de animatie klaar is", async () => {
		bouwPagina(BERICHTEN);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		await laad();

		// De animatie loopt op requestAnimationFrame; even doortikken tot ze klaar is.
		for (let i = 0; i < 400 && !voortgang().hidden; i += 1) await new Promise((r) => setTimeout(r, 25));

		expect(voortgang().hidden).toBe(true);
		expect(lijst().hidden).toBe(false);
		expect(pagnav().hidden).toBe(false);
		expect(document.querySelectorAll(".berichtenbox-row").length).toBeGreaterThan(0);
	}, 20000);

	it("bewaart dat het eerste bezoek gehad is", async () => {
		bouwPagina(BERICHTEN);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		await laad();
		for (let i = 0; i < 400 && !voortgang().hidden; i += 1) await new Promise((r) => setTimeout(r, 25));

		expect(JSON.parse(window.localStorage.getItem("berichtenbox")).eersteBezoekGehad).toBe(true);
	}, 20000);
});

/**
 * De vlag die berichtenbox-voortgang-vooraf.njk vóór het parsen op <html> zet. Blijft die staan,
 * dan houdt de CSS de lijst verborgen — ook nadat de animatie klaar is.
 */
function zetVroegeVlag() {
	document.documentElement.dataset.berichtenboxVoortgang = "wacht";
	window.__berichtenboxVoortgang = {
		overgenomen: false,
		vrijgeven: () => { delete document.documentElement.dataset.berichtenboxVoortgang; },
	};
}

const vlag = () => document.documentElement.dataset.berichtenboxVoortgang;

describe("de vlag van vóór het parsen", () => {
	it("wordt overgenomen, zodat het vangnet bij load niets meer doet", async () => {
		bouwPagina(BERICHTEN);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		zetVroegeVlag();
		await laad();

		expect(window.__berichtenboxVoortgang.overgenomen).toBe(true);
	});

	it("gaat weg zodra de animatie klaar is", async () => {
		// Blijft hij staan, dan houdt de CSS de lijst verborgen en ziet de bezoeker nooit iets.
		bouwPagina(BERICHTEN);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		zetVroegeVlag();
		await laad();

		expect(vlag()).toBe("wacht");
		for (let i = 0; i < 400 && !voortgang().hidden; i += 1) await new Promise((r) => setTimeout(r, 25));

		expect(vlag()).toBe(undefined);
	}, 20000);

	it("gaat meteen weg bij een tweede bezoek", async () => {
		bouwPagina(BERICHTEN);
		zetVroegeVlag();
		await laad();

		expect(vlag()).toBe(undefined);
	});

	it("gaat weg als de lading mislukt", async () => {
		bouwPagina(BERICHTEN);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		window.berichtenboxData = { berichten: null, magazijnen: [], mappen: [] };
		zetVroegeVlag();
		await laad();

		expect(vlag()).toBe(undefined);
	});

	it("gaat weg op een pagina zonder voortgangsblok", async () => {
		bouwPagina(BERICHTEN);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		voortgang().remove();
		zetVroegeVlag();
		await laad();

		expect(vlag()).toBe(undefined);
	});
});

describe("als de animatie tóch niet komt", () => {
	it("laat de lijst gewoon staan bij een tweede bezoek", async () => {
		bouwPagina(BERICHTEN); // bouwPagina zet eersteBezoekGehad standaard aan
		await laad();

		expect(lijst().hidden).toBe(false);
		expect(voortgang().hidden).toBe(true);
	});

	it("laat de lijst niet verborgen achter als de lading mislukt", async () => {
		// Zonder dataset struikelt de lading. Wat vooruitlopend verborgen is, moet dan terug —
		// anders blijft er een lege pagina achter met alleen een storingsmelding.
		bouwPagina(BERICHTEN);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		window.berichtenboxData = { berichten: null, magazijnen: [], mappen: [] };
		await laad();

		expect(voortgang().hidden).toBe(true);
	});

	it("verbergt niets op het archief", async () => {
		// Zonder eersteBezoekGehad, maar met een gevuld archief: de animatie hoort alleen op de
		// inbox te komen, en de lijst hier dus gewoon te staan.
		bouwPagina(BERICHTEN, { pad: "/moza/berichtenbox/berichtenbox-archief/", view: "archief" });
		window.localStorage.setItem("berichtenbox", JSON.stringify({ gearchiveerd: { "msg-0": true, "msg-1": true } }));
		await laad();

		expect(lijst().hidden).toBe(false);
		expect(voortgang().hidden).toBe(true);
	});
});
