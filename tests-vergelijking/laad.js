/**
 * Laadt een écht gebouwde pagina uit _site in de jsdom van vitest, en draait daar de
 * berichtenbox van één van beide versies op. Geen nagebouwde fixture: dit is de HTML
 * die Eleventy oplevert.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { vi } from "vitest";

// De branch is de werkmap; main komt uit een tweede werkmap die apart gebouwd is.
// Zie tests-vergelijking/README.md voor hoe u die maakt.
const PROJECT = process.cwd();
const MAIN = process.env.VGL_MAIN ? resolve(process.env.VGL_MAIN) : resolve(PROJECT, "..", "moza-poc-main");

export const BOUW = {
	main: { site: MAIN + "/_site", js: MAIN + "/assets/javascript/berichtenbox.js", module: false },
	branch: { site: PROJECT + "/_site", js: PROJECT + "/assets/javascript/berichtenbox.js", module: true },
};

/** Nepopslag die zich als localStorage gedraagt en die de test kan uitlezen. */
export function maakOpslag(begin = {}) {
	const kluis = { ...begin };
	return {
		getItem: (k) => (k in kluis ? kluis[k] : null),
		setItem: (k, v) => {
			kluis[k] = String(v);
		},
		removeItem: (k) => {
			delete kluis[k];
		},
		clear: () => {
			for (const k of Object.keys(kluis)) delete kluis[k];
		},
		key: (i) => Object.keys(kluis)[i] ?? null,
		get length() {
			return Object.keys(kluis).length;
		},
		_kluis: kluis,
	};
}

/** De scripts die de berichtenbox echt nodig heeft. De rest laat de pagina met rust. */
const NODIG = ["feature-flags.js", "personas.js"];

/**
 * @param versie  "main" of "branch"
 * @param pad     pad binnen _site, bv. "moza/berichtenbox/index.html"
 * @param opties  { opslag, zoekterm, cookie }
 */
/**
 * Wacht tot de pagina klaar is met tekenen.
 *
 * Main rendert synchroon; de branch loopt door een keten van beloftes. Een vast aantal ticks is
 * daar het verkeerde gereedschap voor: het waren er twee, tot er een bron bij kwam die eerst iets
 * moest afwachten, en toen bleef het beeld leeg — wat op een geslaagde vergelijking lijkt, want
 * leeg is leeg. Puur op stilstand wachten heeft hetzelfde gat: vóór de eerste tekening staat
 * alles óók stil.
 *
 * Dus eerst wachten op het bewijs dát er getekend is — rijen, of een zichtbare lege staat, want
 * de render-laag komt altijd op één van beide uit — en daarna pas op stilstand.
 */
async function totGetekend(deadlineMs = 5000) {
	const lijst = document.querySelector("[data-berichtenbox-list]");
	// Geen lijst op deze pagina: er valt niets te tekenen en dus niets af te wachten.
	if (!lijst) return;

	const leeg = document.querySelector("[data-berichtenbox-empty]");
	// Zíchtbaar, niet alleen aanwezig. De branch bouwt de rijen op terwijl de tbody nog verborgen
	// is voor de voortgangsanimatie; op enkel "er staan rijen" wachten levert precies het beeld op
	// dat beeld() als leeg telt.
	const zichtbaar = (el) => el && !el.hidden && !el.closest("[hidden]");
	const getekend = () => [...lijst.querySelectorAll("tbody tr")].some(zichtbaar) || zichtbaar(leeg);

	const einde = Date.now() + deadlineMs;
	while (Date.now() < einde && !getekend()) {
		await new Promise((r) => setTimeout(r, 5));
	}

	// Hardop, niet stilletjes uitlopen. Een lege pagina vergelijkt gelijk met een lege pagina; dat
	// is precies hoe deze functie eerder wegkeek van een branch die niets tekende.
	if (!getekend()) throw new Error("Er is binnen " + deadlineMs + " ms niets zichtbaars getekend.");

	// En dan tot rust: een tweede tekening (paginanav, tellers) hoort er nog bij.
	let vorige = null;
	let stil = 0;
	while (Date.now() < einde) {
		await new Promise((r) => setTimeout(r, 10));
		const nu = [...lijst.querySelectorAll("tbody tr")].filter(zichtbaar).length + "|" + document.body.textContent.length;
		stil = nu === vorige ? stil + 1 : 0;
		vorige = nu;
		if (stil >= 3) return;
	}
}

export async function laadPagina(versie, pad, { opslag = maakOpslag(), cookie = "" } = {}) {
	const bouw = BOUW[versie];
	if (!existsSync(bouw.site)) {
		throw new Error("Geen gebouwde site voor '" + versie + "' op " + bouw.site + ". Bouw die werkmap eerst met `npm run build`, " + "of wijs met VGL_MAIN naar de werkmap van main. Zie tests-vergelijking/README.md.");
	}
	const html = readFileSync(bouw.site + "/" + pad, "utf8");

	// Ontleden zonder scripts te draaien; daarna zetten we de inhoud in de globale jsdom.
	const kaal = new JSDOM(html);
	const doc = kaal.window.document;

	const inline = [...doc.querySelectorAll("script:not([src])")].map((s) => s.textContent);
	const extern = [...doc.querySelectorAll("script[src]")].map((s) => s.getAttribute("src")).filter((src) => NODIG.some((n) => src.endsWith(n)));

	document.documentElement.innerHTML = doc.documentElement.innerHTML;
	// De scripttags zelf weg: jsdom draait ze niet, en de render-laag hoort ze niet te zien.
	document.querySelectorAll("script").forEach((s) => s.remove());

	// De URL blijft anders staan tussen twee versies in dezelfde worker: zet main ?pagina=2, dan
	// begint de branch op pagina 2 en vergelijken we twee verschillende pagina's.
	window.history.replaceState({}, "", "/" + pad.replace(/index\.html$/, ""));

	vi.stubGlobal("localStorage", opslag);
	Object.defineProperty(document, "cookie", { value: cookie, configurable: true, writable: true });

	const meldingen = [];
	for (const soort of ["log", "warn", "error"]) {
		vi.spyOn(console, soort).mockImplementation((...a) => meldingen.push([soort, String(a[0])]));
	}

	// Inline scripts eerst: die zetten window.berichtenboxData, PATH_PREFIX en personasData.
	for (const code of inline) {
		try {
			new Function(code).call(window);
		} catch (fout) {
			meldingen.push(["inline", String(fout)]);
		}
	}
	for (const src of extern) {
		const bestand = bouw.site + src;
		try {
			new Function(readFileSync(bestand, "utf8")).call(window);
		} catch (fout) {
			meldingen.push(["extern", src + ": " + fout]);
		}
	}

	// Gedelegeerde listeners op document en window blijven anders leven als de volgende versie
	// geladen wordt, en handelen dan mee op háár DOM. Vandaar dat we ze opnemen en opruimen.
	const opgenomen = [];
	const origineel = new Map();
	for (const doel of [document, window]) {
		const echt = doel.addEventListener.bind(doel);
		origineel.set(doel, doel.addEventListener);
		doel.addEventListener = (type, fn, opt) => {
			opgenomen.push([doel, type, fn, opt]);
			echt(type, fn, opt);
		};
	}
	const klokken = [];
	const echteInterval = globalThis.setInterval;
	globalThis.setInterval = (...a) => {
		const id = echteInterval(...a);
		klokken.push(id);
		return id;
	};

	if (bouw.module) {
		await import(bouw.js + "?t=" + Date.now());
	} else {
		new Function(readFileSync(bouw.js, "utf8")).call(window);
	}

	// Main rendert synchroon; de branch loopt door een keten van beloftes — bronnen bevragen,
	// state lezen, dan pas tekenen. Een vast aantal ticks is daar het verkeerde gereedschap voor:
	// het waren er twee, tot er een bron bij kwam die eerst iets moest afwachten, en toen bleef
	// het beeld leeg zonder dat er iets stukging. Wachten tot het beeld niet meer verandert, dus.
	await totGetekend();

	function ruimOp() {
		opgenomen.forEach(([doel, type, fn, opt]) => doel.removeEventListener(type, fn, opt));
		origineel.forEach((fn, doel) => {
			doel.addEventListener = fn;
		});
		klokken.forEach((id) => clearInterval(id));
		globalThis.setInterval = echteInterval;
	}

	return { meldingen, ruimOp };
}
