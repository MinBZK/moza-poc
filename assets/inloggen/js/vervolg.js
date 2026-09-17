/**
 * vervolg.js
 *
 * Geen onderdeel van de DigiD-assets, maar een toevoeging van dit prototype.
 *
 * De DigiD-schermen eindigen standaard in /moza/. De MOZa-landingspagina op
 * /mox/ heeft een eigen portaal, dus die stuurt ?vervolg=<pad> mee. Dit script
 * draagt die parameter door de flow heen en stuurt de gebruiker aan het eind
 * naar dat pad.
 *
 * Zonder parameter eindigt de flow waar het formulier naartoe wijst (/moza/).
 */

(function () {
	"use strict";

	var vervolg = new URLSearchParams(window.location.search).get("vervolg");

	// Alleen een pad binnen deze site. Een absolute URL of een protocol-relatief
	// "//host" pad zou de gebruiker naar een vreemde site kunnen sturen.
	if (!vervolg || vervolg.charAt(0) !== "/" || vervolg.charAt(1) === "/") vervolg = null;

	document.addEventListener("DOMContentLoaded", function () {
		// Tussenstap: de parameter meegeven aan het volgende scherm.
		if (vervolg) {
			document.querySelectorAll('a.authentication[href^="/inloggen/"]').forEach(function (link) {
				link.href = link.getAttribute("href") + "?vervolg=" + encodeURIComponent(vervolg);
			});
		}

		// Laatste stap. Niet via form.action, want dit is een GET-formulier en
		// dan komt de gebruiker met een sliert querystring (inclusief de
		// koppelcode) in het portaal aan.
		var form = document.querySelector("form.app_verification");
		if (!form) return;
		form.addEventListener("submit", function (e) {
			e.preventDefault();
			window.location.href = vervolg || form.getAttribute("action");
		});
	});
})();
