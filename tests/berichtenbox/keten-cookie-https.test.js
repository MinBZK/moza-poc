// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://proeftuin.test/moza/berichtenbox/" }
import { describe, it, expect, afterEach, vi } from "vitest";
import { ONTVANGER, PERSONAS, LIJST, sseAntwoord, startKeten, spionOpCookie, ruimKetenOp } from "./keten-harnas.js";

/**
 * Het ontvanger-cookie op een https-pagina.
 *
 * Eigen bestand met een eigen document-URL: het protocol van een jsdom-pagina ligt vast bij het
 * opzetten van de omgeving en is per bestand in te stellen, niet per test. De rest van de
 * cookie-afspraak staat in keten-inhoud.test.js, dat over http draait — daar hoort `Secure` juist
 * níét te staan, want dan weigert de browser het cookie en is elke bijlage-link stuk.
 *
 * Op de proefomgeving en op ZAD gaat alles over https, dus dit is het pad dat een bezoeker raakt.
 *
 * Waarom hier op de geschreven tekst wordt getoetst en niet op wat `document.cookie` teruggeeft:
 * jsdom accepteert een `Secure`-cookie ook op een http-pagina en geeft hem gewoon terug, terwijl
 * een echte browser hem weigert. Terugleeslezen kan het verschil dus niet zien.
 */

afterEach(() => {
	ruimKetenOp();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("het ontvanger-cookie op https", () => {
	it("krijgt Secure erbij", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const geschreven = [];
		const herstel = spionOpCookie(geschreven);
		try {
			await startKeten([
				["/api/demo/personas", PERSONAS],
				["_ophalen", sseAntwoord()],
				["/api/v1/berichten?", LIJST],
			]);
		} finally {
			herstel();
		}

		expect(location.protocol).toBe("https:");
		// Exact, om dezelfde reden als in keten-inhoud.test.js: een prefix-assertie laat een
		// verschoven pad of een teruggekeerde Max-Age door.
		const gezet = geschreven.find((regel) => regel.startsWith("ontvanger=" + ONTVANGER));
		expect(gezet).toBe("ontvanger=" + ONTVANGER + "; path=/api/v1/berichten; SameSite=Strict; Secure");
	});
});
