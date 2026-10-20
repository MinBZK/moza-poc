// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Het scenario "Iemand aannemen" bouwt op in de browseropslag: pas als alle bronnen zijn
 * aangevinkt werkt "Bereken wat het oplevert", pas na "Verstuur" bestaat de zaak, en de
 * stand (fase) bepaalt welke vastleggingen zichtbaar zijn. Het script rekent niets.
 */

const SCRIPT = readFileSync(process.cwd() + "/assets/javascript/da-iemand-aannemen.js", "utf8");
const BRONNEN = ["uwv", "gemeente", "kvk", "belastingdienst", "eigen"];

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
		kluis,
	};
}

function laad(html, opslag) {
	document.body.innerHTML = html;
	Object.defineProperty(window, "localStorage", { value: opslag, configurable: true });
	new Function(SCRIPT)();
}

describe("gegevens per bron", () => {
	const html = BRONNEN.map((b) => `<input type="checkbox" data-vinkje="${b}">`).join("") + '<p id="da-bronnen-stand"></p><a id="da-bereken" href="/verder" aria-disabled="true">Bereken</a>';

	it("houdt de knop uit tot elke bron is aangevinkt", () => {
		const opslag = nepOpslag();
		laad(html, opslag);
		const knop = document.getElementById("da-bereken");
		expect(knop.getAttribute("aria-disabled")).toBe("true");
		BRONNEN.slice(0, 4).forEach((b) => {
			const v = document.querySelector(`[data-vinkje="${b}"]`);
			v.checked = true;
			v.dispatchEvent(new Event("change"));
		});
		expect(knop.getAttribute("aria-disabled")).toBe("true");
		expect(document.getElementById("da-bronnen-stand").textContent).toContain("4 van 5");
		const laatste = document.querySelector('[data-vinkje="eigen"]');
		laatste.checked = true;
		laatste.dispatchEvent(new Event("change"));
		expect(knop.getAttribute("aria-disabled")).toBe("false");
		expect(JSON.parse(opslag.kluis["da-aannemen"]).bronnen.eigen).toBe(true);
	});
});

describe("de zaak", () => {
	const html = `
		<div id="da-nog-niet-verstuurd" hidden></div>
		<section id="da-zaak">
			<ol id="da-voortgang">
				<li data-fase="ontvangst"><details><summary><span data-stapnaam></span>Ontvangen</summary></details></li>
				<li data-fase="meting"><details><summary><span data-stapnaam></span>Gemeten</summary></details></li>
				<li data-fase="besluit"><details><summary><span data-stapnaam></span>Besluit</summary></details></li>
			</ol>
			<ol id="da-tijdlijn">
				<li data-stap="besluit" data-id="g12"></li>
				<li data-stap="meting" data-id="g10"></li>
				<li data-stap="ontvangst" data-id="g7"></li>
				<li data-stap="vooraf" data-id="g1"></li>
			</ol>
		</section>
		<select id="da-fase"><option value="ontvangst">o</option><option value="meting">m</option><option value="besluit">b</option></select>`;

	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("bestaat niet voordat de aanvraag is verstuurd", () => {
		laad(html, nepOpslag());
		expect(document.getElementById("da-zaak").hidden).toBe(true);
		expect(document.getElementById("da-nog-niet-verstuurd").hidden).toBe(false);
	});

	it("toont na het versturen alleen de vastleggingen tot de gekozen stand", () => {
		laad(html, nepOpslag({ "da-aannemen": JSON.stringify({ ingediend: true, fase: "meting" }) }));
		expect(document.getElementById("da-zaak").hidden).toBe(false);
		const zichtbaar = [...document.querySelectorAll("#da-tijdlijn li")].filter((li) => !li.hidden).map((li) => li.dataset.id);
		expect(zichtbaar).toEqual(["g10", "g7", "g1"]);
		expect(document.querySelector('[data-fase="meting"]').getAttribute("aria-current")).toBe("step");
		expect(document.querySelector('[data-fase="ontvangst"] [data-stapnaam]').textContent).toBe("Voltooide stap: ");
	});

	it("laat de onderzoeker de stand verzetten", () => {
		const opslag = nepOpslag({ "da-aannemen": JSON.stringify({ ingediend: true, fase: "ontvangst" }) });
		laad(html, opslag);
		const keuze = document.getElementById("da-fase");
		keuze.value = "besluit";
		keuze.dispatchEvent(new Event("change"));
		expect(document.querySelector('[data-id="g12"]').hidden).toBe(false);
		expect(JSON.parse(opslag.kluis["da-aannemen"]).fase).toBe("besluit");
	});
});
