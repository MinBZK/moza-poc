// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://proeftuin.test/moza/berichtenbox/" }
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Het ontvanger-cookie op een https-pagina.
 *
 * Eigen bestand met een eigen document-URL: het protocol van een jsdom-pagina ligt vast bij het
 * opzetten van de omgeving en is per bestand in te stellen, niet per test. De rest van de
 * cookie-afspraak staat in keten-inhoud.test.js, dat over http draait — daar hoort `Secure` juist
 * níét te staan, want dan weigert de browser het cookie en is elke bijlage-link stuk.
 *
 * Op de proefomgeving en op ZAD gaat alles over https, dus dit is het pad dat een bezoeker raakt.
 */

const BRON = readFileSync(resolve(process.cwd(), "assets/javascript/berichtenbox-keten.js"), "utf8");
const ONTVANGER = "KVK:90000011";

function sseAntwoord() {
	const stroom = new ReadableStream({
		start(regelaar) {
			regelaar.enqueue(new TextEncoder().encode('data:{"event":"ophalen-gereed","totaalBerichten":0,"geslaagd":0,"mislukt":0,"totaalMagazijnen":0}\n\n'));
			regelaar.close();
		},
	});
	return { ok: true, status: 200, body: stroom, headers: { get: () => "text/event-stream" } };
}

function antwoord(body) {
	return {
		ok: true,
		status: 200,
		headers: { get: () => "application/json" },
		json: async () => body,
	};
}

afterEach(() => {
	delete window.BerichtenboxKeten;
	delete window.Personas;
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("het ontvanger-cookie op https", () => {
	it("krijgt Secure erbij", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const geschreven = [];
		const origineel = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
		Object.defineProperty(document, "cookie", {
			configurable: true,
			get: () => origineel.get.call(document),
			set: (waarde) => {
				geschreven.push(waarde);
				origineel.set.call(document, waarde);
			},
		});

		vi.stubGlobal("fetch", async (pad) => {
			if (pad.indexOf("/api/demo/personas") !== -1) {
				return antwoord([{ id: "proeftuin-een", label: "Demo-onderneming 1", ontvanger: ONTVANGER, bron: "keten" }]);
			}
			if (pad.indexOf("_ophalen") !== -1) return sseAntwoord();
			if (pad.indexOf("/api/v1/berichten?") !== -1) return antwoord({ berichten: [] });
			throw new Error("onverwacht adres in de test: " + pad);
		});

		document.body.innerHTML = '<article class="berichtenbox"><table data-berichtenbox-list><tbody></tbody></table></article>';
		window.berichtenboxData = { berichten: [], magazijnen: [], mappen: [] };
		window.Personas = { actief: () => ({ id: "proeftuin-een", stelsel: true, bedrijf: { kvkNummer: "90000011" } }) };

		try {
			new Function(BRON).call(window);
			await window.BerichtenboxKeten.berichten();
		} finally {
			delete document.cookie;
		}

		expect(location.protocol).toBe("https:");
		// Exact, om dezelfde reden als in keten-inhoud.test.js: een prefix-assertie laat een
		// verschoven pad of een teruggekeerde Max-Age door.
		const gezet = geschreven.find((regel) => regel.startsWith("ontvanger=" + ONTVANGER));
		expect(gezet).toBe("ontvanger=" + ONTVANGER + "; path=/api/v1/berichten; SameSite=Strict; Secure");
	});
});
