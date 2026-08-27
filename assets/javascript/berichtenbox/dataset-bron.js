/**
 * De gegenereerde dataset als berichtenbron.
 *
 * Deze bron is altijd van toepassing en hoort daarom achteraan in het register: hij vangt op wat
 * geen andere bron opeist. `window.berichtenboxData` wordt door Eleventy in de pagina gezet; de
 * kopieën hieronder zorgen dat de render-laag de dataset niet per ongeluk muteert.
 *
 * Het gesimuleerde federatieve gedrag — voortgang per bron, binnendruppelende berichten, een bron
 * die uitvalt — hoort bij déze bron en niet bij de berichtenbox. Het staat nu nog in
 * berichtenbox.js; als het hierheen verhuist, vervalt de noodzaak om dat gedrag elders af te
 * remmen wanneer een echte bron actief is.
 */
export function datasetBron(data) {
	return {
		naam: "dataset",

		// De dataset is er altijd; wie hier komt, komt nergens anders terecht.
		geldtVoor: async () => true,

		laad: async () => ({
			berichten: (data.berichten || []).slice(),
			magazijnen: (data.magazijnen || []).slice(),
			mappen: (data.mappen || []).slice(),
		}),
	};
}
