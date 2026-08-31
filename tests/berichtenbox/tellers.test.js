// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import data from "../../_data/berichtenboxData.js";

/**
 * Het bolletje met het aantal ongelezen berichten hoort niet bij het bouwen ingevuld te worden.
 *
 * Hoeveel er ongelezen zijn hangt af van de persona, en die kiest de bezoeker pas in de browser:
 * berichten met een `relevantVoor`-tag horen bij één persona, de rest is generiek. Een getal uit de
 * dataset telt ze allemaal en is daarmee voor niemand juist — en voor een persona die zijn berichten
 * uit het stelsel haalt slaat het helemaal nergens op. Het bolletje sprong daardoor bij elke lading
 * van het verkeerde getal naar het goede.
 *
 * `.badge:empty` is onzichtbaar, dus leeg laten betekent: geen bolletje tot berichtenbox.js het
 * vult, uit de bewaarde staat of na het laden uit de bron.
 */
describe("het ongelezen-getal in de navigatie", () => {
	const templates = ["_includes/side-nav-overheid.njk", "_includes/header-belastingdienst.njk", "_includes/berichtenbox-tabs.njk"];

	templates.forEach((pad) => {
		it(pad + " vult het bolletje niet bij het bouwen", () => {
			// Zonder de HTML-commentaren: daarin staan uitgezette badges mét een getal, en die tellen
			// niet mee — ze bereiken de pagina niet.
			const bron = readFileSync(pad, "utf8").replace(/<!--[\s\S]*?-->/g, "");
			const badges = bron.match(/<span class="badge" data-berichtenbox-count="[^"]+">[\s\S]*?<\/span>/g) || [];

			expect(badges.length).toBeGreaterThan(0);
			badges.forEach((badge) => {
				const inhoud = badge.replace(/^[^>]*>/, "").replace(/<\/span>$/, "");
				expect(inhoud.trim()).toBe("");
			});
		});
	});

	it("laat zien waarom: het dataset-getal klopt voor niemand", () => {
		// Geen gedragstest maar de rekensom die de reden vastlegt. Gaan deze uit elkaar lopen omdat
		// de dataset verandert, dan blijft de conclusie dezelfde: één getal kan niet voor iedereen
		// kloppen, dus hoort het niet in de HTML.
		const berichten = data.berichten;
		const tags = [...new Set(berichten.flatMap((b) => b.relevantVoor || []))];
		const ongelezenVoor = (tag) => berichten.filter((b) => !b.relevantVoor || (tag && b.relevantVoor.includes(tag))).filter((b) => b.isOngelezen).length;

		const perPersona = new Set([ongelezenVoor(null), ...tags.map(ongelezenVoor)]);

		expect(perPersona.size).toBeGreaterThan(1);
		expect(perPersona.has(data.aantalOngelezen)).toBe(false);
	});
});
