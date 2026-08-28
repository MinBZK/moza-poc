import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { laadLive, maakOpslag, stackDraait, wachtOpRijen } from "./laad-live.js";

/**
 * De berichtenbox tegen de draaiende demo-stack van het Federatief Berichtenstelsel.
 *
 * Dit is het enige wat hier de plaats van een browser inneemt. Alle andere tests draaien tegen een
 * fixture of een dubbel; hier komen de berichten echt uit de berichtenuitvraag, langs onze eigen
 * nginx-config, door de ongewijzigde scripts.
 *
 * Eén lading per scenario, en elk scenario een eigen persona: de uitvraag houdt een ophaalronde per
 * ontvanger bij en antwoordt op een tweede ronde terecht met 409. Twee tests op dezelfde persona
 * laten de tweede dus struikelen over de eerste.
 */

// De staat hoort bij één persona; zonder die naam gooit state.js hem weg en telt het weer als
// eerste bezoek — inclusief de ophaalanimatie van de dataset.
const TWEEDE_BEZOEK = (persona) => maakOpslag({ berichtenbox: JSON.stringify({ persona, eersteBezoekGehad: true }) });

const rijen = () => [...document.querySelectorAll(".berichtenbox-row")].filter((r) => !r.hidden && !r.closest("[hidden]"));
const storing = () => {
	const el = document.querySelector("[data-berichtenbox-storing]");
	return el && !el.hidden ? el.textContent.replace(/\s+/g, " ").trim() : null;
};

beforeAll(async () => {
	if (!(await stackDraait())) {
		throw new Error("De demo-stack draait niet. Zie tests-integratie/README.md.");
	}
});

const opruimen = [];

afterEach(() => {
	opruimen.splice(0).forEach((op) => op());
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.documentElement.innerHTML = "";
});

describe("een aangesloten persona", () => {
	it("krijgt de berichten van het stelsel, met een werkende link en zonder melding", async () => {
		const een = await laadLive("/moza/berichtenbox/?persona=proeftuin-een", { opslag: TWEEDE_BEZOEK("proeftuin-een") });
		opruimen.push(een.ruimOp);
		expect(await wachtOpRijen(1)).toBe(true);

		// De dataset heeft 141 berichten met een id als msg-0002; het stelsel levert uuid's.
		const ids = rijen().map((r) => r.dataset.berichtId);
		expect(ids.length).toBeGreaterThan(0);
		expect(ids.every((id) => !/^msg-/.test(id))).toBe(true);

		// Detailpagina's worden bij de build uit de dataset gegenereerd; deze berichten staan daar
		// niet bij, dus een link naar bericht/<id>/ zou een 404 zijn.
		expect(rijen()[0].querySelector("a").getAttribute("href")).toContain("bericht-demo/?id=");

		expect(storing()).toBe(null);
		expect(document.querySelector("[data-berichtenbox-progress]").hidden).toBe(true);
	}, 40000);

	it("krijgt zijn eigen post, niet die van een andere ontvanger", async () => {
		const twee = await laadLive("/moza/berichtenbox/?persona=proeftuin-twee", { opslag: TWEEDE_BEZOEK("proeftuin-twee") });
		opruimen.push(twee.ruimOp);
		expect(await wachtOpRijen(1)).toBe(true);

		expect(rijen().every((r) => !/^msg-/.test(r.dataset.berichtId))).toBe(true);
		expect(storing()).toBe(null);
	}, 40000);
});

describe("een bericht uit het stelsel openen", () => {
	it("zegt dat alleen de kopgegevens opgehaald zijn", async () => {
		// De berichtenuitvraag levert geen inhoud, alleen afzender, onderwerp en datum. Een lege
		// pagina zou dat verzwijgen.
		const opslag = TWEEDE_BEZOEK("proeftuin-drie");
		const drie = await laadLive("/moza/berichtenbox/?persona=proeftuin-drie", { opslag });
		opruimen.push(drie.ruimOp);
		expect(await wachtOpRijen(1)).toBe(true);

		const id = rijen()[0].dataset.berichtId;
		opruimen.splice(0).forEach((op) => op());
		document.documentElement.innerHTML = "";
		const detail = await laadLive("/moza/berichtenbox/bericht-demo/?id=" + id + "&persona=proeftuin-drie", { opslag });
		opruimen.push(detail.ruimOp);

		const tot = Date.now() + 20000;
		let tekst = "";
		while (Date.now() < tot && !tekst) {
			const body = document.querySelector("[data-demo-body]");
			tekst = body ? body.textContent.trim() : "";
			if (!tekst) await new Promise((r) => setTimeout(r, 100));
		}
		expect(tekst).toContain("alleen de afzender, het onderwerp en de datum");
	}, 60000);
});

describe("een persona die niet aangesloten is", () => {
	it("krijgt geen lege voortgangsbalk te zien", async () => {
		// De ronde begint met een vraag aan de demo-console. Voor deze persona is het antwoord
		// "nee", en dan hoort er nooit een balk te zijn geweest. Eerder verscheen hij op nul,
		// bleef leeg zolang de console erover deed, en verdween daarna zonder uitleg.
		const kof = await laadLive("/moza/berichtenbox/?persona=melkveehouder", { opslag: TWEEDE_BEZOEK("melkveehouder") });
		opruimen.push(kof.ruimOp);

		// Meteen meten. De ronde start in het klassieke script, dus als de balk op nul gemeld wordt,
		// staat hij er al zodra de module geladen is — een observer die daarna pas kijkt, mist het.
		const blok = document.querySelector("[data-berichtenbox-progress]");
		expect(blok.hidden).toBe(true);

		const gezien = [];
		const kijker = new window.MutationObserver(() => gezien.push(blok.hidden));
		kijker.observe(blok, { attributes: true, attributeFilter: ["hidden"] });

		expect(await wachtOpRijen(1)).toBe(true);
		await new Promise((r) => setTimeout(r, 2500));
		kijker.disconnect();

		expect(gezien.every((verborgen) => verborgen === true)).toBe(true);
		expect(blok.hidden).toBe(true);
	}, 40000);


	it("krijgt gewoon de dataset, zonder melding", async () => {
		const kof = await laadLive("/moza/berichtenbox/?persona=koffiezaak", { opslag: TWEEDE_BEZOEK("koffiezaak") });
		opruimen.push(kof.ruimOp);
		expect(await wachtOpRijen(1)).toBe(true);

		expect(rijen().every((r) => /^msg-/.test(r.dataset.berichtId))).toBe(true);
		expect(storing()).toBe(null);
	}, 40000);
});
