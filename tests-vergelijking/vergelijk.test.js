/**
 * Legt main en de refactor-branch naast elkaar op de écht gebouwde pagina's uit _site.
 *
 * Niet de nagebouwde fixture uit tests/berichtenbox/dom.js, maar de HTML die Eleventy oplevert:
 * precies wat de bezoeker krijgt. Elk verschil dat hieruit komt moet te verklaren zijn.
 *
 * Standaard staat `eersteBezoekGehad` aan, zodat de voortgangsanimatie de vergelijking niet
 * afhankelijk maakt van timing. Eén scenario zet hem juist uit en vergelijkt die animatie wél.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { laadPagina, maakOpslag } from "./laad.js";
import { beeld } from "./beeld.js";
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const RAPPORT = process.env.VGL_RAPPORT || resolve(tmpdir(), "berichtenbox-verschillen.txt");

/** Beschrijft waar twee beelden uiteenlopen, veld voor veld. */
function verschillen(a, b, pad = "") {
	if (JSON.stringify(a) === JSON.stringify(b)) return [];
	if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
		return [pad + ": main=" + JSON.stringify(a) + "  branch=" + JSON.stringify(b)];
	}
	if (Array.isArray(a) !== Array.isArray(b)) return [pad + ": ander type"];
	if (Array.isArray(a)) {
		if (a.length !== b.length) return [pad + ": main heeft " + a.length + ", branch " + b.length];
		return a.flatMap((el, i) => verschillen(el, b[i], pad + "[" + i + "]"));
	}
	const sleutels = new Set([...Object.keys(a), ...Object.keys(b)]);
	return [...sleutels].flatMap((k) => verschillen(a[k], b[k], pad ? pad + "." + k : k));
}

const TWEEDE_BEZOEK = { eersteBezoekGehad: true };

/** Draait dezelfde handeling op beide versies en geeft beide beelden terug. */
async function naastElkaar(pad, { state = TWEEDE_BEZOEK, handeling = async () => {}, cookie = "" } = {}) {
	const uit = {};
	for (const versie of ["main", "branch"]) {
		vi.resetModules();
		const opslag = maakOpslag({ berichtenbox: JSON.stringify(state) });
		const { meldingen, ruimOp } = await laadPagina(versie, pad, { opslag, cookie });
		await handeling();
		await tik();
		const gezien = {
			...beeld(),
			opslag: opslag._kluis.berichtenbox ? JSON.parse(opslag._kluis.berichtenbox) : null,
			fouten: meldingen.filter((m) => m[0] === "error").map((m) => m[1]),
		};
		ruimOp();
		document.documentElement.innerHTML = "";
		uit[versie] = gezien;
	}
	return uit;
}

async function tik(n = 3) {
	for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0));
}

/**
 * Klikt binnen de eerste zichtbare rij. Main houdt álle rijen in de DOM en verbergt wat niet op de
 * pagina staat, dus `querySelectorAll(...)[0]` zou daar een onzichtbare rij raken en de vergelijking
 * over iets anders laten gaan dan wat de bezoeker aanklikt.
 */
function klikInEersteRij(selector) {
	const rij = [...document.querySelectorAll(".berichtenbox-row")].find((r) => !r.hidden && !r.closest("[hidden]"));
	if (!rij) throw new Error("geen zichtbare rij");
	const el = rij.querySelector(selector);
	if (!el) throw new Error("niet gevonden in de eerste rij: " + selector);
	el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
	return el;
}

function klik(selector, index = 0) {
	const el = document.querySelectorAll(selector)[index];
	if (!el) throw new Error("niet gevonden: " + selector + " [" + index + "]");
	el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
	return el;
}

function typ(selector, waarde) {
	const el = document.querySelector(selector);
	if (!el) throw new Error("niet gevonden: " + selector);
	el.value = waarde;
	el.dispatchEvent(new window.Event("input", { bubbles: true }));
}

/**
 * De staat draagt sinds de persona-scheiding de naam van zijn eigenaar. Main kent dat veld niet,
 * dus dit verschil staat in élk scenario waarin de branch iets bewaart. Eén keer benoemen.
 */
const PERSONA_VELD = ["opslag.persona"];

/**
 * Eén scenario: het beeld van beide versies moet gelijk zijn, op de verschillen na die we
 * bewust maken.
 *
 * `aanvaard` is geen filter maar een lijst: elk pad dat erin staat móet ook echt verschillen.
 * Dat is het verschil tussen "we weten hiervan" en "we kijken hier niet meer". Verdwijnt een
 * aanvaard verschil — omdat main het meekreeg of de branch het terugdraaide — dan valt dit
 * scenario om en gaat iemand kijken waarom.
 */
function vergelijk(naam, pad, opties = {}) {
	const { aanvaard = [], ...rest } = opties;
	it(naam, async () => {
		const { main, branch } = await naastElkaar(pad, rest);
		const uiteen = verschillen(main, branch);
		if (uiteen.length) appendFileSync(RAPPORT, "\n## " + naam + "\n" + uiteen.slice(0, 25).join("\n") + "\n");

		const raakt = (regel, pad) => regel.startsWith(pad + ":") || regel.startsWith(pad + " ");
		const paden = [...PERSONA_VELD, ...aanvaard];

		expect(uiteen.filter((regel) => !paden.some((pad) => raakt(regel, pad)))).toEqual([]);

		// Alleen wat dit scenario zelf opgeeft moet er ook echt zijn. Het persona-veld niet: dat
		// staat er alleen in scenario's waarin de branch iets te bewaren had.
		const gemist = aanvaard.filter((pad) => !uiteen.some((regel) => raakt(regel, pad)));
		expect(gemist, "aanvaard verschil dat er niet meer is").toEqual([]);
	});
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	document.documentElement.innerHTML = "";
});

const INBOX = "moza/berichtenbox/index.html";
const ARCHIEF = "moza/berichtenbox/berichtenbox-archief/index.html";
const PRULLENBAK = "moza/berichtenbox/berichtenbox-prullenbak/index.html";
const BD_INBOX = "mijn-belastingdienst/berichtenbox/index.html";
const BD_ARCHIEF = "mijn-belastingdienst/berichtenbox/berichtenbox-archief/index.html";

describe("de eerste weergave", () => {
	vergelijk("moza inbox", INBOX);
	vergelijk("moza archief", ARCHIEF);
	vergelijk("moza prullenbak", PRULLENBAK);
	vergelijk("belastingdienst inbox", BD_INBOX);
	vergelijk("belastingdienst archief", BD_ARCHIEF);
});

describe("een bewaarde staat wordt hetzelfde uitgelegd", () => {
	const GEARCHIVEERD = { ...TWEEDE_BEZOEK, gearchiveerd: { "msg-0001": true, "msg-0002": true } };
	const VERWIJDERD = { ...TWEEDE_BEZOEK, verwijderd: { "msg-0001": true }, gearchiveerd: { "msg-0001": true } };
	const GELEZEN = { ...TWEEDE_BEZOEK, gelezen: { "msg-0001": true, "msg-0002": true } };
	const GEMARKEERD = { ...TWEEDE_BEZOEK, gemarkeerd: { "msg-0001": true } };
	const MAP = { ...TWEEDE_BEZOEK, eigenMappen: ["Belastingen"], mapOverride: { "msg-0001": "Belastingen" } };

	vergelijk("gearchiveerde berichten staan niet in de inbox", INBOX, { state: GEARCHIVEERD });
	// Main geeft archiefrijen zes cellen terwijl de thead er vijf koppen heeft: die zesde cel
	// hangt onder geen enkele kop. De branch bouwt de actiekolom alleen waar hij bestaat.
	vergelijk("gearchiveerde berichten staan wél in het archief", ARCHIEF, { aanvaard: ["rijen[0].cellen", "rijen[1].cellen"], state: GEARCHIVEERD });
	// Dezelfde cel zonder kop.
	vergelijk("prullenbak wint van archief", PRULLENBAK, { aanvaard: ["rijen[0].cellen"], state: VERWIJDERD });
	// Op main blijft een verwijderd bericht in het archief staan. De branch haalt het weg en
	// toont de lege staat, want dan valt er niets meer te tonen.
	vergelijk("een verwijderd bericht staat niet meer in het archief", ARCHIEF, { aanvaard: ["rijen", "aantalRijen", "totaal", "legeStaat"], state: VERWIJDERD });
	// Main laat de verborgen "Ongelezen."-tekst staan bij berichten die al gelezen zijn; een
	// schermlezer noemt ze dan alsnog ongelezen.
	vergelijk("gelezen berichten tellen niet als ongelezen", INBOX, { aanvaard: ["rijen[1].afzender", "rijen[2].afzender"], state: GELEZEN });
	vergelijk("een markering blijft staan", INBOX, { state: GEMARKEERD });
	vergelijk("een eigen map verandert de inbox niet", INBOX, { state: MAP });
});

describe("zoeken, filteren en sorteren", () => {
	vergelijk("zoeken op een afzender", INBOX, { handeling: async () => typ("[data-berichtenbox-search-input]", "belastingdienst") });
	vergelijk("zoeken op een onderwerp", INBOX, { handeling: async () => typ("[data-berichtenbox-search-input]", "aanslag") });
	vergelijk("zoeken met hoofdletters", INBOX, { handeling: async () => typ("[data-berichtenbox-search-input]", "RDW") });
	// Main laat een zoekopdracht zonder resultaat achter als een lege tabel zonder uitleg.
	vergelijk("zoeken zonder resultaat toont de lege staat", INBOX, { aanvaard: ["legeStaat"], handeling: async () => typ("[data-berichtenbox-search-input]", "zzzzz") });
	vergelijk("zoekterm weer wissen", INBOX, {
		handeling: async () => {
			typ("[data-berichtenbox-search-input]", "rdw");
			await tik();
			typ("[data-berichtenbox-search-input]", "");
		},
	});
	vergelijk("sorteren op afzender", INBOX, { handeling: async () => klik("[data-sort='afzender']") });
	vergelijk("sorteren op afzender, andersom", INBOX, {
		handeling: async () => {
			klik("[data-sort='afzender']");
			await tik();
			klik("[data-sort='afzender']");
		},
	});
	vergelijk("sorteren op onderwerp", INBOX, { handeling: async () => klik("[data-sort='onderwerp']") });
	vergelijk("sorteren op datum", INBOX, { handeling: async () => klik("[data-sort='datum']") });
	vergelijk("sorteren binnen een zoekresultaat", INBOX, {
		handeling: async () => {
			typ("[data-berichtenbox-search-input]", "belastingdienst");
			await tik();
			klik("[data-sort='afzender']");
		},
	});
	// Dezelfde cel zonder kop.
	vergelijk("sorteren in het archief", ARCHIEF, {
		aanvaard: ["rijen[0].cellen", "rijen[1].cellen", "rijen[2].cellen"],
		state: { ...TWEEDE_BEZOEK, gearchiveerd: { "msg-0001": true, "msg-0002": true, "msg-0003": true } },
		handeling: async () => klik("[data-sort='afzender']"),
	});
});

describe("acties op een bericht", () => {
	vergelijk("markeren", INBOX, { handeling: async () => klikInEersteRij("[data-mark-toggle]") });
	vergelijk("markeren en weer terug", INBOX, {
		handeling: async () => {
			klikInEersteRij("[data-mark-toggle]");
			await tik();
			klikInEersteRij("[data-mark-toggle]");
		},
	});
	// Main laat de ongelezen-teller staan als een ongelezen bericht wordt weggezet; het cijfer
	// in de menubalk klopt dan niet meer met de lijst.
	vergelijk("archiveren vanuit de rij", INBOX, { aanvaard: ["opslag.aantalOngelezen"], handeling: async () => klikInEersteRij("[data-row-actie='archiveren']") });
	// Dezelfde teller die op main niet meezakt.
	vergelijk("verwijderen vanuit de rij", INBOX, { aanvaard: ["opslag.aantalOngelezen"], handeling: async () => klikInEersteRij("[data-row-actie='verwijderen']") });
	vergelijk("doorsturen aanklikken", INBOX, { handeling: async () => klikInEersteRij("[data-row-actie='doorsturen']") });
	vergelijk("het rijmenu openen", INBOX, { handeling: async () => klikInEersteRij(".row-actions-toggle") });
});

describe("de voortgangsanimatie bij het eerste bezoek", () => {
	it("levert na afloop hetzelfde beeld op", async () => {
		const uit = {};
		for (const versie of ["main", "branch"]) {
			vi.resetModules();
			const opslag = maakOpslag();
			const { ruimOp } = await laadPagina(versie, INBOX, { opslag });
			// Wachten tot de animatie klaar is, in plaats van op de klok te gokken.
			const balk = document.querySelector("[data-berichtenbox-progress]");
			for (let i = 0; i < 400 && balk && !balk.hidden; i += 1) await new Promise((r) => setTimeout(r, 25));
			uit[versie] = {
				...beeld(),
				balkWeg: !balk || balk.hidden,
				opslag: opslag._kluis.berichtenbox ? JSON.parse(opslag._kluis.berichtenbox) : null,
			};
			ruimOp();
			document.documentElement.innerHTML = "";
		}
		const uiteen = verschillen(uit.main, uit.branch);
		if (uiteen.length) appendFileSync(RAPPORT, "\n## voortgangsanimatie\n" + uiteen.slice(0, 25).join("\n") + "\n");
		// Dit scenario bouwt zijn eigen beeld op en gaat dus langs vergelijk() heen; het persona-veld
		// hoort hier net zo goed te mogen verschillen.
		expect(uiteen.filter((regel) => !PERSONA_VELD.some((pad) => regel.startsWith(pad + ":")))).toEqual([]);
	}, 30000);
});

describe("paginering en filters", () => {
	vergelijk("doorklikken naar pagina 2", INBOX, {
		handeling: async () => {
			const nav = document.querySelector("[data-berichtenbox-pagination]");
			// jsdom kent geen layout, dus het aantal paginanummers valt laag uit. De knop "volgende"
			// is er wél, en die brengt de bezoeker net zo goed naar pagina 2.
			const knoppen = [...nav.querySelectorAll("a, button")];
			const twee = knoppen.find((el) => el.textContent.trim() === "2") || knoppen.find((el) => /volgende/i.test(el.textContent + " " + (el.getAttribute("aria-label") || "")));
			if (!twee) throw new Error("geen pagina 2, wel: " + knoppen.map((k) => k.textContent.trim()).join("|"));
			twee.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
		},
	});
	// Zet u op het Belastingdienst-portaal de schakelaar "toon alle overheidsorganisaties" aan, dan
	// blijft de lijst op main leeg: de pagina heeft alleen Belastingdienst-rijen in de HTML staan en
	// er komt niets bij. De branch haalt de lijst uit de datalaag en toont wél wat er dan bij hoort.
	vergelijk("de organisatie-schakelaar van het portaal", BD_INBOX, {
		aanvaard: ["rijen", "aantalRijen", "paginanav"],
		handeling: async () => klik("[data-berichtenbox-org-toggle]"),
	});
});

describe("het zoekverschil dat we accepteren", () => {
	// Op main loopt het zoeken over de tekst in de rijen, inclusief de verborgen "Ongelezen."-tekst.
	// De branch zoekt in de afzender en het onderwerp uit de brongegevens. Dit scenario legt dat
	// verschil vast in plaats van het te verbergen.
	vergelijk("zoeken op 'ongelezen'", INBOX, {
		aanvaard: ["legeStaat", "paginanav"],
		handeling: async () => typ("[data-berichtenbox-search-input]", "ongelezen"),
	});
});

describe("de detailpagina", () => {
	const DETAIL = "moza/berichtenbox/bericht/msg-0001/index.html";
	vergelijk("openen zet het bericht op gelezen", DETAIL);
	vergelijk("markeren vanaf de detailpagina", DETAIL, { handeling: async () => klik("[data-actie='markeren']") });
	vergelijk("archiveren vanaf de detailpagina", DETAIL, { handeling: async () => klik("[data-actie='archiveren']") });
});

describe("pagina's die de berichtenbox alleen als markup hebben", () => {
	for (const pad of ["moza/belang-tuin/berichtenbox/index.html", "moza/belang-vve/berichtenbox/index.html", "moza/belang-winter/berichtenbox/index.html", "mobu/namens-kind/berichtenbox/index.html", "mobu/namens-mantelzorg/berichtenbox/index.html"]) {
		vergelijk(pad, pad);
	}
});
