/**
 * Het bronregister: welke bron levert de berichten voor deze bezoeker.
 *
 * Een bron is een object met:
 *
 *     {
 *       naam:      "keten",
 *       geldtVoor: async (persona) => boolean,   // is deze bron van toepassing?
 *       laad:      async () => ({ berichten, magazijnen, mappen }),
 *       start:     (meld) => {},                 // optioneel: gedrag ná het laden
 *       inhoudVan: async (berichtId) => string,  // optioneel: inhoud naleveren
 *     }
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
	let gekozen = null;

	return {
		registreer(bron) {
			bronnen.push(bron);
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
					// terug op de bron erachter.
					console.error("[Berichtenbox] Bron '" + bron.naam + "' kon niet bepalen of hij van toepassing is.", fout);
				}
			}
			gekozen = null;
			return null;
		},

		actief() {
			return gekozen;
		},

		opWijziging(callback) {
			luisteraars.push(callback);
		},

		/** Een bron meldt hiermee dat zijn berichten veranderd zijn. */
		meld(inhoud) {
			luisteraars.forEach((callback) => {
				try {
					callback(inhoud);
				} catch (fout) {
					console.error("[Berichtenbox] Verwerken van een bronwijziging mislukte.", fout);
				}
			});
		},
	};
}
