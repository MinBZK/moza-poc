// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Wisselen van persona gooit de opgeslagen gegevens van de vorige weg.
 *
 * Tussen persona's bestaat geen verband: het zijn andere mensen bij andere bedrijven, met andere
 * post en andere keuzes. Wat de een bewaarde, gearchiveerd of weggeklikt heeft, hoort de ander niet
 * te zien. Vlaggen en instellingen zijn gereedschap van wie het prototype bekijkt en blijven staan.
 */

const PERSONAS = process.cwd() + "/assets/javascript/personas.js";
const VLAGGEN = process.cwd() + "/assets/javascript/feature-flags.js";

function nepOpslag(begin = {}) {
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
		_kluis: kluis,
	};
}

const GEGEVENS = {
	berichtenbox: JSON.stringify({ persona: "koffiezaak", gearchiveerd: { "msg-1": true } }),
	"berichtenbox-keten": JSON.stringify({ ontvanger: "KVK:90000011", berichten: [] }),
	"hidden:Subsidie voor verduurzaming": JSON.stringify({ title: "x" }),
	"read:msg-1": "true",
	"favorite:msg-2": "true",
	"dismissed:banner": "true",
	"unread:count": "7",
	"feature:Dynamische berichten": "true",
	"setting:test-user-kvk": "85234567",
};

function draaiPersonas(opslag) {
	vi.stubGlobal("localStorage", opslag);
	document.body.innerHTML = "";
	window.personasData = [
		{ id: "koffiezaak", label: "Horeca", actief: true, persoon: {}, bedrijf: { kvkNummer: "85234567" } },
		{ id: "bloemenkweker", label: "Kweker", persoon: {}, bedrijf: { kvkNummer: "62345681" } },
	];
	new Function(readFileSync(PERSONAS, "utf8")).call(window);
}

beforeEach(() => {
	vi.spyOn(console, "info").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	window.history.replaceState({}, "", "/moza/berichtenbox/");
});

afterEach(() => {
	delete window.Personas;
	delete window.personasData;
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("de persona-kiezer", () => {
	it("verschijnt in het flags-paneel", () => {
		// De kiezer hangt aan .feature-flags-panel, dat feature-flags.js bouwt. Draait personas.js
		// eerder, dan is er geen paneel en verschijnt de kiezer niet — zonder fout en zonder
		// melding. Zie ook tests/scriptvolgorde.test.js.
		const opslag = nepOpslag({ persona: "koffiezaak" });
		vi.stubGlobal("localStorage", opslag);
		// Het paneel wordt alleen gebouwd als er iets te schakelen valt.
		document.body.innerHTML = '<span hidden data-feature="Iets" data-feature-type="functionaliteit"></span>';
		window.personasData = [
			{ id: "koffiezaak", label: "Horeca", actief: true, persoon: {}, bedrijf: { kvkNummer: "85234567" } },
			{ id: "bloemenkweker", label: "Kweker", persoon: {}, bedrijf: { kvkNummer: "62345681" } },
		];
		new Function(readFileSync(VLAGGEN, "utf8")).call(window);
		new Function(readFileSync(PERSONAS, "utf8")).call(window);

		const paneel = document.querySelector(".feature-flags-panel");
		expect(paneel).not.toBe(null);
		expect(paneel.textContent).toContain("Persona's");
		expect(paneel.querySelectorAll("input[name=persona]").length).toBe(2);
	});
});

describe("wisselen van persona", () => {
	it("wist wat bij de vorige persona hoorde", () => {
		const opslag = nepOpslag({ ...GEGEVENS, "persona:gegevens-van": "bloemenkweker", persona: "koffiezaak" });
		draaiPersonas(opslag);

		expect(opslag._kluis.berichtenbox).toBeUndefined();
		expect(opslag._kluis["berichtenbox-keten"]).toBeUndefined();
		expect(opslag._kluis["hidden:Subsidie voor verduurzaming"]).toBeUndefined();
		expect(opslag._kluis["read:msg-1"]).toBeUndefined();
		expect(opslag._kluis["favorite:msg-2"]).toBeUndefined();
		expect(opslag._kluis["dismissed:banner"]).toBeUndefined();
		expect(opslag._kluis["unread:count"]).toBeUndefined();
	});

	it("laat vlaggen en instellingen met rust", () => {
		// Gereedschap van wie het prototype bekijkt, geen gegevens van een bedrijf.
		const opslag = nepOpslag({ ...GEGEVENS, "persona:gegevens-van": "bloemenkweker", persona: "koffiezaak" });
		draaiPersonas(opslag);

		expect(opslag._kluis["feature:Dynamische berichten"]).toBe("true");
		expect(opslag._kluis["setting:test-user-kvk"]).toBe("85234567");
		expect(opslag._kluis.persona).toBe("koffiezaak");
	});

	it("noteert bij wie de gegevens nu horen", () => {
		const opslag = nepOpslag({ ...GEGEVENS, "persona:gegevens-van": "bloemenkweker", persona: "koffiezaak" });
		draaiPersonas(opslag);

		expect(opslag._kluis["persona:gegevens-van"]).toBe("koffiezaak");
	});

	it("laat alles staan als de persona niet wisselt", () => {
		const opslag = nepOpslag({ ...GEGEVENS, "persona:gegevens-van": "koffiezaak", persona: "koffiezaak" });
		draaiPersonas(opslag);

		expect(opslag._kluis.berichtenbox).toBe(GEGEVENS.berichtenbox);
		expect(opslag._kluis["unread:count"]).toBe("7");
	});

	it("werkt ook via ?persona=, dat niets opschrijft", () => {
		// Die weg zou langs een hook op de wisselaar heen glippen.
		const opslag = nepOpslag({ ...GEGEVENS, "persona:gegevens-van": "koffiezaak", persona: "koffiezaak" });
		window.history.replaceState({}, "", "/moza/berichtenbox/?persona=bloemenkweker");
		draaiPersonas(opslag);

		expect(opslag._kluis.berichtenbox).toBeUndefined();
		expect(opslag._kluis["persona:gegevens-van"]).toBe("bloemenkweker");
	});

	it("wist het ontvanger-cookie, zodat een bijlage niet van de vorige persona komt", () => {
		// Dat cookie zegt de proxy namens wie hij bijlagen ophaalt. Blijft dat van de vorige staan,
		// dan levert een klik op een bijlage het document van iemand anders — of een 404 die de
		// bezoeker nergens kan plaatsen. De keten-bron zet hem opnieuw zodra zijn ronde loopt.
		document.cookie = "ontvanger=KVK:90000011; path=/";
		expect(document.cookie).toContain("ontvanger=KVK:90000011");

		const opslag = nepOpslag({ ...GEGEVENS, "persona:gegevens-van": "bloemenkweker", persona: "koffiezaak" });
		draaiPersonas(opslag);

		expect(document.cookie).not.toContain("KVK:90000011");
	});

	it("ruimt stil op als er wél een persona gekozen was", () => {
		// Geen herkomst bekend, maar er staat een keuze in de opslag: dan is er wel degelijk
		// gewisseld, alleen weten we niet waarvandaan. Opruimen dus — en er valt niets te melden,
		// want er is geen vorige naam om te noemen.
		const opslag = nepOpslag({ ...GEGEVENS, persona: "koffiezaak" });
		draaiPersonas(opslag);

		// Dít is wat de titel belooft. Zonder deze regel bleef de test groen terwijl er niets
		// opgeruimd werd.
		expect(opslag._kluis.berichtenbox).toBeUndefined();
		expect(opslag._kluis["read:msg-1"]).toBeUndefined();
		expect(opslag._kluis["persona:gegevens-van"]).toBe("koffiezaak");
		expect(console.info).not.toHaveBeenCalled();
	});

	it("neemt gegevens aan als niemand een persona koos", () => {
		// Gegevens van vóór de scheiding, en de bezoeker kwam gewoon op de standaardpersona uit.
		// Er is niet gewisseld, dus er valt niets weg te gooien: dit is zijn eigen archief.
		const opslag = nepOpslag({ ...GEGEVENS });
		draaiPersonas(opslag);

		expect(opslag._kluis.berichtenbox).toBeDefined();
		expect(opslag._kluis["read:msg-1"]).toBe("true");
		expect(opslag._kluis["persona:gegevens-van"]).toBeDefined();
	});

	it("ruimt tóch op als het merk niet weggeschreven kan worden", () => {
		// Anders valt élke volgende wissel weer in de aanname-tak — het merk komt er immers nooit —
		// en wordt er nooit meer opgeruimd. De guard hoort de veilige kant op te falen.
		const opslag = nepOpslag({ ...GEGEVENS });
		opslag.setItem = (sleutel) => {
			if (sleutel === "persona:gegevens-van") throw new Error("vol");
		};
		draaiPersonas(opslag);

		expect(opslag._kluis.berichtenbox).toBeUndefined();
		expect(console.error).toHaveBeenCalled();
	});
});
