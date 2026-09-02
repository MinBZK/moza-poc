/**
 * assistent-vraag.js
 *
 * De vraag waarmee de digitale assistent opent als iemand vanaf een subsidie,
 * regeling of buurtbericht doorklikt.
 *
 * Eén bron voor twee gebruikers: Eleventy laadt dit bestand als filter voor de
 * detailpagina's (_includes/action-group.njk), de browser laadt het als script
 * voor de kaarten die homepage-profiel.js opbouwt. Zonder die gedeelde bron
 * lopen de twee uit elkaar en stelt dezelfde knop op twee plekken een andere
 * vraag.
 */

(function (root, maak) {
	var api = maak();
	if (typeof module === "object" && module.exports) module.exports = api;
	else root.MozaAssistentVraag = api;
})(typeof self !== "undefined" ? self : this, function () {
	"use strict";

	/**
	 * De titels van regelingen dragen hun toelichting achter een dubbele punt:
	 * "Wijziging Wwft: verscherpt cliëntenonderzoek". Zo'n titel middenin een zin
	 * plakken levert een onleesbare vraag op. Aanhalingstekens eromheen lossen dat
	 * op zonder iets weg te gooien: de lezer ziet één benoemd ding.
	 *
	 * Afkappen bij de dubbele punt was het alternatief, maar dan verdwijnt juist
	 * de wijziging waar de pagina over gaat — en krijgen de twee Arbowet-items
	 * dezelfde vraag.
	 */
	function tussenAanhalingstekens(titel) {
		return "“" + String(titel == null ? "" : titel).trim() + "”";
	}

	/**
	 * @param {object} item   Een subsidie, regeling of buurtbericht uit _data/.
	 * @param {string} soort  "subsidie" | "regeling" | "bericht"
	 * @returns {string} De vraag die als ?vraag= meegaat naar de assistent.
	 */
	function vraag(item, soort) {
		if (!item) return "";
		// Een redactioneel geformuleerde vraag in de data wint altijd: die is
		// geschreven met de regeling erbij, en dat wint van elke automatische vorm.
		if (item.assistentVraag) return item.assistentVraag;
		var titel = tussenAanhalingstekens(item.titel);
		if (soort === "subsidie") return "Kom ik in aanmerking voor " + titel + "?";
		if (soort === "bericht") return "Wat betekent " + titel + " voor mijn bedrijf?";
		return "Geldt " + titel + " voor mijn bedrijf?";
	}

	return { vraag: vraag };
});
