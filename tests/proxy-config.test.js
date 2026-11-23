import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * De afspraken in de nginx-template die geen andere test ziet.
 *
 * Een bijlage is een `<a href>`, en die stuurt geen header mee. De proxy maakt van de cookies
 * `ontvanger` en `sessie` daarom de headers die het stelsel eist. Valt een van die regels weg, dan
 * geeft elke bijlage in een uitgerolde omgeving een 400 of 401, en lokaal merkt niemand het: daar
 * draait `server/keten-proxy.js`.
 */

const TEMPLATE = readFileSync(process.cwd() + "/container/default.conf.template", "utf8");

/** Het blok van de location voor bijlagen, zonder commentaarregels. */
function bijlageBlok() {
	const begin = TEMPLATE.indexOf("location ~ ^/api/v1/berichten/[^/]+/bijlagen/");
	expect(begin).toBeGreaterThanOrEqual(0);
	const einde = TEMPLATE.indexOf("\n    }", begin);
	return TEMPLATE.slice(begin, einde)
		.split("\n")
		.filter((regel) => !regel.trim().startsWith("#"))
		.join("\n");
}

describe("nginx: een bijlage uit het stelsel", () => {
	it("maakt van het ontvanger- en het sessie-cookie de headers die het stelsel eist", () => {
		const blok = bijlageBlok();
		expect(blok).toMatch(/proxy_set_header X-Ontvanger \$cookie_ontvanger;/);
		expect(blok).toMatch(/proxy_set_header X-Sessie \$cookie_sessie;/);
	});

	it("gebruikt het sessie-cookie nergens anders: het sessie-id is een geheim en hoort niet in een log", () => {
		const regels = TEMPLATE.split("\n").filter((regel) => !regel.trim().startsWith("#"));
		expect(regels.filter((regel) => regel.includes("$cookie_sessie")).map((regel) => regel.trim())).toEqual(["proxy_set_header X-Sessie $cookie_sessie;"]);
		expect(regels.filter((regel) => regel.includes("$http_cookie"))).toEqual([]);
	});
});

describe("nginx: een fout bij een bijlage", () => {
	// Een bijlage opent in een eigen tabblad, dus de browser toont het antwoord zelf. Een
	// problem+json is daar onleesbaar; een 401 is sinds de sessie het gewone gevolg van een kwartier
	// niets doen.
	const { BIJLAGE_FOUTEN } = require(process.cwd() + "/server/keten-proxy.js");

	function benoemdeLocation(naam) {
		const begin = TEMPLATE.indexOf("location @" + naam + " {");
		expect(begin).toBeGreaterThanOrEqual(0);
		return TEMPLATE.slice(begin, TEMPLATE.indexOf("\n    }", begin));
	}

	it("vangt 401, 429 en 503 van het stelsel af", () => {
		const blok = bijlageBlok();
		expect(blok).toMatch(/proxy_intercept_errors on;/);
		expect(blok).toMatch(/error_page 401 = @bijlage_sessie_verlopen;/);
		expect(blok).toMatch(/error_page 429 503 = @bijlage_even_niet;/);
	});

	it("zegt hetzelfde als de dev-proxy, met dezelfde status", () => {
		expect(benoemdeLocation("bijlage_sessie_verlopen")).toContain("return " + BIJLAGE_FOUTEN[401].status + ' "' + BIJLAGE_FOUTEN[401].tekst + '";');
		expect(benoemdeLocation("bijlage_even_niet")).toContain("return " + BIJLAGE_FOUTEN[503].status + ' "' + BIJLAGE_FOUTEN[503].tekst + '";');
		expect(BIJLAGE_FOUTEN[429]).toEqual(BIJLAGE_FOUTEN[503]);
	});
});
