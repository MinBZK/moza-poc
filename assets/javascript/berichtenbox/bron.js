/**
 * Het bronregister: welke bron levert de berichten voor deze bezoeker.
 *
 * Een bron is een object met:
 *
 *     {
 *       naam:          "keten",
 *       geldtVoor:     async (persona) => boolean,   // is deze bron van toepassing?
 *       laad:          async () => ({ berichten, magazijnen, mappen }),
 *       start:         (meld) => {},                 // optioneel: gedrag ná het laden
 *       inhoudVan:     async (berichtId) => string,  // optioneel: inhoud naleveren
 *       volgVoortgang: (kijker) => {},               // optioneel: hoe ver het ophalen is
 *       herhaalOphalen: (klaar) => {},               // optioneel: nog een keer, op verzoek
 *     }
 *
 * `volgVoortgang` meldt `{ bevraagd, klaar, gevonden }` zolang er opgehaald wordt, en `null` zodra
 * er niets meer te melden valt. Of die getallen gemeten zijn of nagebootst, hoort de render-laag
 * niet te kunnen zien. Let op: de render-laag abonneert zich hierop vóór de bronkeuze — `geldtVoor`
 * wacht een ophaalronde af, en daarna is de voortgang voorbij.
 *
 * `herhaalOphalen` is er voor de bezoeker die erom vraagt: een hersteld magazijn, een verruimd
 * organisatiefilter. Wie het niet aanbiedt, wordt niet gevraagd.
 *
 * De volgorde van registreren is de voorrang: de eerste bron waarvoor `geldtVoor` waar is, wint.
 * De dataset-bron hoort daarom achteraan — die is altijd van toepassing en vangt op wat geen
 * andere bron opeist.
 *
 * Geen DOM, geen netwerk, geen kennis van welke bronnen er bestaan.
 */

export function maakRegister() {
	const bronnen = [];
	const luisteraars = [];
	const storingen = [];
	let gekozen = null;

	return {
		registreer(bron) {
			bronnen.push(bron);
		},

		/** Alles wat geregistreerd is, in volgorde van voorrang. */
		bronnen() {
			return bronnen.slice();
		},

		/** De eerste bron die van toepassing is, of null als geen enkele dat is. */
		async kies(persona) {
			for (const bron of bronnen) {
				try {
					if (await bron.geldtVoor(persona)) {
						gekozen = bron;
						return bron;
					}
				} catch (fout) {
					// Nooit stil overslaan: een kapotte bron is anders niet te onderscheiden van een
					// bron die simpelweg niet van toepassing is, en dan valt de bezoeker ongemerkt
					// terug op de bron erachter. De console alleen is niet genoeg — dat ziet niemand
					// zonder ontwikkelaarsvenster — dus wordt de storing ook bewaard.
					console.error("[Berichtenbox] Bron '" + bron.naam + "' kon niet bepalen of hij van toepassing is.", fout);
					storingen.push({ bron: bron.naam, fase: "geldtVoor", fout });
				}
			}
			gekozen = null;
			return null;
		},

		actief() {
			return gekozen;
		},

		/** Bronnen die onderweg omvielen. Leeg betekent: de keuze is te vertrouwen. */
		storingen() {
			return storingen.slice();
		},

		opWijziging(callback) {
			luisteraars.push(callback);
		},

		/**
		 * Een bron meldt hiermee dat zijn berichten veranderd zijn.
		 *
		 * Eén luisteraar die omvalt mag de rest niet meesleuren, maar de aanroeper moet het wél
		 * weten: anders staat er een halve weergave op het scherm die van een geslaagde niet te
		 * onderscheiden is. Geeft de fouten terug in plaats van ze op te eten.
		 */
		meld(inhoud) {
			const mislukt = [];

			luisteraars.forEach((callback) => {
				try {
					callback(inhoud);
				} catch (fout) {
					console.error("[Berichtenbox] Verwerken van een bronwijziging mislukte.", fout);
					mislukt.push(fout);
				}
			});

			return mislukt;
		},
	};
}
