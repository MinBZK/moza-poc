/**
 * prototype-links.js
 *
 * De MijnOverheid-schermen in deze map zijn een nagebouwde omgeving: alleen de
 * routes die in het onderzoek nodig zijn, zijn echt uitgewerkt. De rest van de
 * links staat op href="#" en zou de pagina alleen naar boven springen — wat een
 * respondent leest als "er gebeurt niets, het is stuk".
 *
 * Deze melding zegt in plaats daarvan wat er aan de hand is. Bewust een alert:
 * die onderbreekt, is niet te missen en wordt door een schermlezer voorgelezen.
 * Voor een prototype is dat precies genoeg; in een echt product zou je hier iets
 * rustigers voor kiezen.
 *
 * Eén listener op document in plaats van per link: links die later worden
 * toegevoegd doen vanzelf mee.
 */

(function () {
	"use strict";

	var MELDING = "Dit is een prototype, niet alle links werken.";

	document.addEventListener("click", function (e) {
		// Ook href="" meenemen: dat springt naar de pagina zelf en is net zo goed
		// een niet-uitgewerkte link.
		var link = e.target.closest('a[href="#"], a[href=""]');
		if (!link) return;
		e.preventDefault();
		window.alert(MELDING);
	});
})();
