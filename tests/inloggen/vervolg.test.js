// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * De DigiD-schermen dragen `?vervolg=<pad>` door de flow heen. Dat pad komt uit de URL, dus iemand
 * anders kan het in een link zetten: alleen een pad binnen deze site mag door.
 */
const BRON = readFileSync(process.cwd() + "/assets/inloggen/js/vervolg.js", "utf8");

function pagina(vervolg) {
	window.history.replaceState({}, "", "/inloggen/digid-zakelijk/" + (vervolg === undefined ? "" : "?vervolg=" + encodeURIComponent(vervolg)));
	document.body.innerHTML = '<a class="authentication" href="/inloggen/digid-app-zakelijk/">DigiD app</a>';

	// Elke test voert het script opnieuw uit; vang de DOMContentLoaded-listener op en roep hem één
	// keer aan, anders draaien de scripts van eerdere tests mee.
	let opStart = null;
	const echt = document.addEventListener;
	document.addEventListener = (type, luisteraar, ...rest) => (type === "DOMContentLoaded" ? (opStart = luisteraar) : echt.call(document, type, luisteraar, ...rest));
	try {
		new Function(BRON).call(window);
	} finally {
		document.addEventListener = echt;
	}
	if (opStart) opStart(new Event("DOMContentLoaded"));
}

const linkHref = () => document.querySelector("a.authentication").getAttribute("href");

beforeEach(() => {
	document.body.innerHTML = "";
});

describe("vervolgpad door de DigiD-schermen", () => {
	it("geeft een pad binnen deze site door aan het volgende scherm", () => {
		pagina("/mox/portaal/");
		expect(linkHref()).toBe("/inloggen/digid-app-zakelijk/?vervolg=" + encodeURIComponent("/mox/portaal/"));
	});

	it("laat de flow met rust zonder vervolgpad", () => {
		pagina();
		expect(linkHref()).toBe("/inloggen/digid-app-zakelijk/");
	});

	// Elk van deze leest een browser als een andere site: "\" telt als "/", en tabs en regeleinden
	// vallen weg.
	it.each([
		["een absolute URL", "https://evil.example/"],
		["een protocol-relatief pad", "//evil.example/"],
		["een backslash na de schuine streep", "/\\evil.example/"],
		["een backslash verderop", "/moza/\\..\\evil"],
		["een tab tussen twee schuine strepen", "/\t/evil.example/"],
		["een regeleinde tussen twee schuine strepen", "/\n/evil.example/"],
	])("negeert een vervolgpad met %s", (_, pad) => {
		pagina(pad);
		expect(linkHref()).toBe("/inloggen/digid-app-zakelijk/");
	});
});
