/**
 * lopende-zaken.js
 *
 * Werkt de side-nav telbadge (data-badge-id="zaken-count") bij op basis van de
 * zaken in localStorage (key "zaken"), die de Digitale Assistent aanmaakt via het
 * case-event. De energiebesparing-zaak staat als statische rij + detailpagina in de
 * Lopende zaken-pagina's; dit script injecteert dus geen rijen meer, alleen de badge.
 */

(function () {
	"use strict";

	var LS_KEY = "zaken";

	function leesZaken() {
		try {
			return JSON.parse(localStorage.getItem(LS_KEY)) || [];
		} catch (e) {
			return [];
		}
	}

	function updateBadge() {
		var aantal = leesZaken().length;
		document.querySelectorAll('[data-badge-id="zaken-count"]').forEach(function (el) {
			el.textContent = aantal;
			el.hidden = aantal === 0;
		});
	}

	// Badge op elke pagina bijwerken; ook live als de assistent een zaak toevoegt.
	updateBadge();
	window.addEventListener("zaken-changed", updateBadge);
})();
