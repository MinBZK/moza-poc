import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * De volgorde van de scripts in base.njk is gedrag, geen smaak.
 *
 * Drie afhankelijkheden zitten erin, en alle drie falen stil: er verschijnt gewoon iets niet, en
 * geen enkele test merkt het. Deze wel.
 */

const BASIS = process.cwd() + "/_includes/base.njk";

function scriptVolgorde() {
	// Zonder commentaar, anders telt een bestandsnaam in een toelichting mee.
	const zonderCommentaar = readFileSync(BASIS, "utf8").replace(/<!--[\s\S]*?-->/g, "");
	return [...zonderCommentaar.matchAll(/\/assets\/javascript\/([a-z0-9-]+\.js)/g)].map((m) => m[1]);
}

const positie = (naam) => scriptVolgorde().indexOf(naam);

describe("scriptvolgorde in base.njk", () => {
	it("laadt feature-flags.js vóór personas.js", () => {
		// De persona-kiezer hangt in het flags-paneel dat feature-flags.js bouwt. Andersom is er
		// geen paneel en verschijnt de kiezer niet — zonder fout, zonder melding.
		expect(positie("feature-flags.js")).toBeGreaterThanOrEqual(0);
		expect(positie("feature-flags.js")).toBeLessThan(positie("personas.js"));
	});

	it("laadt personas.js vóór content-interactions.js", () => {
		// personas.js wist bij een wisseling de gegevens van de vorige persona (hidden:, read:,
		// favorite:), en content-interactions.js leest die. Andersom toont die nog één keer wat er
		// van iemand anders stond.
		expect(positie("personas.js")).toBeLessThan(positie("content-interactions.js"));
	});

	it("laadt berichtenbox-keten.js vóór berichtenbox.js", () => {
		// De ophaalronde moet zo vroeg mogelijk beginnen; berichtenbox.js is een module en draait
		// hoe dan ook ná alle defer-scripts.
		expect(positie("berichtenbox-keten.js")).toBeLessThan(positie("berichtenbox.js"));
	});

	it("laadt berichtenbox.js als module en niet met defer", () => {
		const inhoud = readFileSync(BASIS, "utf8");
		expect(inhoud).toMatch(/berichtenbox\.js' \| url \}\}" type="module"/);
	});
});
