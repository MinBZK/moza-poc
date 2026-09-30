/**
 * Laadt een pagina uit de draaiende demo-stack en voert daar de echte scripts op uit.
 *
 * Geen fixture en geen dubbel: dit is de HTML die nginx serveert, met fetch naar de echte
 * berichtenuitvraag en demo-console. Het enige wat ontbreekt is een browser — jsdom rendert niet en
 * schildert niet, maar hij voert wel dezelfde code uit tegen dezelfde antwoorden.
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { vi } from "vitest";

export const BASIS = process.env.DEMO_BASIS || "http://127.0.0.1:8080";
const PROJECT = process.cwd();

export function maakOpslag(begin = {}) {
	const kluis = { ...begin };
	return {
		getItem: (k) => (k in kluis ? kluis[k] : null),
		setItem: (k, v) => { kluis[k] = String(v); },
		removeItem: (k) => { delete kluis[k]; },
		clear: () => { for (const k of Object.keys(kluis)) delete kluis[k]; },
		key: (i) => Object.keys(kluis)[i] ?? null,
		get length() { return Object.keys(kluis).length; },
		_kluis: kluis,
	};
}

/** Draait de stack? Zonder stack heeft deze hele map geen zin. */
export async function stackDraait() {
	try {
		const respons = await fetch(BASIS + "/api/demo/personas", { signal: AbortSignal.timeout(3000) });
		return respons.ok;
	} catch {
		return false;
	}
}

const NODIG = ["feature-flags.js", "personas.js"];

/**
 * @param pad     bv. "/moza/berichtenbox/?persona=proeftuin-een"
 * @param opties  { opslag }
 */
export async function laadLive(pad, { opslag = maakOpslag() } = {}) {
	const url = BASIS + pad;
	const html = await (await fetch(url)).text();

	const kaal = new JSDOM(html);
	const doc = kaal.window.document;
	const inline = [...doc.querySelectorAll("script:not([src])")].map((s) => s.textContent);
	const extern = [...doc.querySelectorAll("script[src]")]
		.map((s) => s.getAttribute("src"))
		.filter((src) => NODIG.some((n) => src.endsWith(n)));

	// De echte URL, zodat ?persona= aankomt en relatieve fetches de juiste basis krijgen.
	window.history.replaceState({}, "", pad);
	document.documentElement.innerHTML = doc.documentElement.innerHTML;
	document.querySelectorAll("script").forEach((s) => s.remove());

	vi.stubGlobal("localStorage", opslag);

	// jsdom heeft geen fetch; die van Node praat wél met de stack. De echte eerst vastleggen: het
	// alternatief is een stub die zichzelf aanroept, en dat is van een onbereikbare backend niet te
	// onderscheiden — de aanroeper vangt beide af als "niet bereikbaar".
	const echteFetch = globalThis.fetch.bind(globalThis);
	vi.stubGlobal("fetch", (bron, opties) =>
		echteFetch(typeof bron === "string" && bron.startsWith("/") ? BASIS + bron : bron, opties));

	const meldingen = [];
	for (const soort of ["log", "warn", "error"]) {
		vi.spyOn(console, soort).mockImplementation((...a) => meldingen.push([soort, String(a[0])]));
	}

	for (const code of inline) {
		try { new Function(code).call(window); } catch (fout) { meldingen.push(["inline", String(fout)]); }
	}
	for (const src of extern) {
		const bestand = PROJECT + "/_site" + src;
		try { new Function(readFileSync(bestand, "utf8")).call(window); } catch (fout) { meldingen.push(["extern", src + ": " + fout]); }
	}

	// Een vorige lading blijft anders leven en schrijft in het meldingsblok van de vólgende pagina:
	// gedelegeerde listeners hangen aan document, en een ophaalronde loopt door nadat de test klaar
	// is. In een browser is elke lading een vers document; hier niet.
	const opgenomen = [];
	const origineel = new Map();
	for (const doel of [document, window]) {
		const echt = doel.addEventListener.bind(doel);
		origineel.set(doel, doel.addEventListener);
		doel.addEventListener = (type, fn, opt) => { opgenomen.push([doel, type, fn, opt]); echt(type, fn, opt); };
	}
	const klokken = [];
	const echteInterval = globalThis.setInterval;
	globalThis.setInterval = (...a) => { const id = echteInterval(...a); klokken.push(id); return id; };

	// Klassiek en vóór de module, net als in base.njk.
	new Function(readFileSync(PROJECT + "/assets/javascript/berichtenbox-keten.js", "utf8")).call(window);
	await import(PROJECT + "/assets/javascript/berichtenbox.js?live=" + Math.random());

	function ruimOp() {
		opgenomen.forEach(([doel, type, fn, opt]) => doel.removeEventListener(type, fn, opt));
		origineel.forEach((fn, doel) => { doel.addEventListener = fn; });
		klokken.forEach((id) => clearInterval(id));
		globalThis.setInterval = echteInterval;
		delete window.BerichtenboxKeten;
		delete window.Berichtenbox;
	}

	return { meldingen, ruimOp };
}

/** Wacht tot de ophaalronde klaar is en de rijen staan. */
export async function wachtOpRijen(minimaal = 1, limiet = 20000) {
	const tot = Date.now() + limiet;
	while (Date.now() < tot) {
		if (document.querySelectorAll(".berichtenbox-row").length >= minimaal) return true;
		await new Promise((r) => setTimeout(r, 100));
	}
	return false;
}
