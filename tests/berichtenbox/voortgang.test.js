// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bericht, bouwPagina, laadBerichtenbox, laatLaden } from "./dom.js";

/**
 * De voortgangsanimatie bij het eerste bezoek.
 *
 * Het punt van deze tests is niet de animatie zelf, maar het moment waarop de lijst verdwijnt. Die
 * verborg zichzelf pas als de bron geladen was, en tot dat moment stond de tabel op het scherm. De
 * rijen komen nu uit de datalaag, dus er staat geen inhoud meer in — maar de tabelkoppen wel, en
 * die horen ook niet even te verschijnen om meteen weer weg te gaan.
 */

const BERICHTEN = Array.from({ length: 12 }, (_, i) => bericht({ id: "msg-" + i, magazijnId: i % 3 === 0 ? "rdw" : "belastingdienst", datum: "2026-04-0" + ((i % 9) + 1) }));

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

		// Zonder deze regel slaagt every() ook als de render-laag de nav helemaal niet meer aanraakt.
		expect(zichtbaarGeweest.length).toBeGreaterThan(0);
		expect(zichtbaarGeweest.every((verborgen) => verborgen === true)).toBe(true);
		expect(nav.hidden).toBe(true);
	});

	it("laat de lijst ná het laden verborgen tot de ronde klaar is", async () => {
		bouwPagina(BERICHTEN);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		await laad();

		expect(lijst().hidden).toBe(true);
		expect(pagnav().hidden).toBe(true);

		// De balk zelf komt pas als de ronde na de drempel nog loopt; een ronde die meteen klaar
		// is, hoort niemand te zien. De nagebootste duurt ruim langer dan dat.
		await new Promise((r) => setTimeout(r, 550));
		expect(voortgang().hidden).toBe(false);
		expect(lijst().hidden).toBe(true);
	});

	it("zet lijst en navigatie terug zodra de ronde klaar is", async () => {
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
		// De bron bewaart dat zelf, aan het eind van de ronde. Wachten tot het er staat, niet tot de
		// balk weg is: die is er misschien nooit geweest.
		bouwPagina(BERICHTEN);
		window.localStorage.setItem("berichtenbox", JSON.stringify({}));
		await laad();

		const bewaard = () => JSON.parse(window.localStorage.getItem("berichtenbox") || "{}").eersteBezoekGehad;
		for (let i = 0; i < 400 && !bewaard(); i += 1) await new Promise((r) => setTimeout(r, 25));

		expect(bewaard()).toBe(true);
	}, 20000);
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

describe("een bron die niets te melden heeft", () => {
	it("laat de lijst niet even zien voordat de animerende bron begint", async () => {
		// Het stelsel is niet van toepassing voor deze persona en meldt daarom meteen `null`. Dat
		// betekent "ik heb niets te melden", niet "mijn ronde is klaar" — maar de render-laag las het
		// als het tweede en toonde de lijst. Dat gebeurde vóórdat de dataset-bron zijn animatie
		// startte, dus stonden de rijen een paar tellen op het scherm, waarna het voortgangsblok ze
		// alsnog wegnam. Precies de flits die de vroege verberging moest voorkomen.
		window.BerichtenboxKeten = {
			bezig: false,
			aangesloten: false,
			melding: null,
			voortgang: null,
			berichten: async () => null,
			// De echte keten meldt zich hier wél: een testdubbel die zwijgt verbergt deze fout.
			opWijziging: (kijker) => kijker({ voortgang: null, melding: null }),
		};

		const berichten = [1, 2, 3].map((n) => bericht({ id: "m" + n, magazijnId: "rdw", afzender: "RDW" }));
		bouwPagina(berichten, { state: { eersteBezoekGehad: false } });
		window.localStorage.removeItem("berichtenbox");

		const lijst = document.querySelector("[data-berichtenbox-list]");
		const body = lijst.querySelector("tbody");
		const zichtbaarMetRijen = [];
		new MutationObserver(() => {
			if (!lijst.hidden && body.querySelectorAll("tr").length) zichtbaarMetRijen.push(true);
		}).observe(document.querySelector(".berichtenbox-content"), { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });

		await laadBerichtenbox();
		for (let i = 0; i < 6; i += 1) await laatLaden();

		// Zolang de animatie loopt hoort er geen enkel moment te zijn waarop de rijen zichtbaar zijn.
		expect(zichtbaarMetRijen).toEqual([]);
	});
});
