// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { laadBerichtenbox } from "./dom.js";

// De homepage toont een paar berichtrijen zonder de volledige berichtenbox eromheen. Het script
// stopt daar vlak na het binden van de markeerknop. Die code was ongetest, terwijl hij wel
// rechtstreeks in de gedeelde localStorage-state schrijft.
const HOMEPAGE = `
<ul>
	<li class="berichtenbox-row" data-bericht-id="msg-0001">
		<button type="button" data-mark-toggle aria-pressed="false"><span class="visually-hidden">Markeren</span></button>
	</li>
</ul>`;

function kluis(inhoud) {
	const opslag = { ...inhoud };
	return {
		getItem: (k) => (k in opslag ? opslag[k] : null),
		setItem: (k, v) => { opslag[k] = String(v); },
		removeItem: () => {},
		clear: () => {},
		_lees: () => opslag.berichtenbox,
	};
}

function zetPagina(opslag) {
	document.body.innerHTML = HOMEPAGE;
	vi.stubGlobal("localStorage", opslag);
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("markeren buiten de berichtenbox", () => {
	it("bewaart een markering in de gedeelde state", async () => {
		const opslag = kluis({});
		zetPagina(opslag);
		await laadBerichtenbox();

		document.querySelector("[data-mark-toggle]").click();
		expect(JSON.parse(opslag._lees()).gemarkeerd).toEqual({ "msg-0001": true });
	});

	it("laat de rest van de state met rust", async () => {
		const opslag = kluis({ berichtenbox: JSON.stringify({ gearchiveerd: { "msg-0009": true } }) });
		zetPagina(opslag);
		await laadBerichtenbox();

		document.querySelector("[data-mark-toggle]").click();
		expect(JSON.parse(opslag._lees()).gearchiveerd).toEqual({ "msg-0009": true });
	});

	it("schrijft niet over onleesbare state heen", async () => {
		const opslag = kluis({ berichtenbox: "{niet json" });
		zetPagina(opslag);
		await laadBerichtenbox();

		document.querySelector("[data-mark-toggle]").click();
		// Overschrijven zou archief, prullenbak en eigen mappen onherstelbaar wissen.
		expect(opslag._lees()).toBe("{niet json");
	});

	it("schrijft niet over een bewaarde array heen", async () => {
		const opslag = kluis({ berichtenbox: "[1,2,3]" });
		zetPagina(opslag);
		await laadBerichtenbox();

		document.querySelector("[data-mark-toggle]").click();
		expect(opslag._lees()).toBe("[1,2,3]");
	});

	it("doet niet alsof de markering gelukt is als er niets bewaard kan worden", async () => {
		const opslag = kluis({});
		opslag.setItem = () => { throw new Error("QuotaExceededError"); };
		zetPagina(opslag);
		await laadBerichtenbox();

		const knop = document.querySelector("[data-mark-toggle]");
		knop.click();
		// Deze pagina heeft geen meldingsblok; de knop zelf is het enige dat de waarheid kan vertellen.
		expect(knop.classList.contains("is-marked")).toBe(false);
		expect(knop.getAttribute("aria-disabled")).toBe("true");
	});
});
