/**
 * kvk-gegevens.js
 *
 * De KVK-pagina op de echte MijnOverheid is Vue; in dit prototype is het platte
 * HTML. Twee dingen moeten dan alsnog werken: het open- en dichtklappen van een
 * organisatie, en de ⓘ-knop die de uitleg bij een veld toont.
 *
 * Eén listener op document in plaats van per knop: dat blijft werken als er
 * later organisaties of velden bij komen.
 */

(function () {
	"use strict";

	function toggle(button) {
		var panel = document.getElementById(button.getAttribute("aria-controls"));
		if (!panel) return;
		var open = button.getAttribute("aria-expanded") === "true";
		button.setAttribute("aria-expanded", String(!open));
		panel.hidden = open;
		return !open;
	}

	document.addEventListener("click", function (e) {
		var accordion = e.target.closest(".lo-accordion-item__toggle-btn");
		if (accordion) {
			var open = toggle(accordion);
			var icon = accordion.querySelector(".lo-accordion-item__icon");
			if (icon) icon.classList.toggle("lo-accordion-item__icon--rotated", open);
			accordion.closest(".lo-accordion-item").classList.toggle("lo-accordion-item--opened", open);
			return;
		}

		var info = e.target.closest(".lo-auxiliary-list__button");
		if (info) {
			toggle(info);
			return;
		}

		// Menu op smalle schermen: het menu ligt als overlay over de pagina, dus
		// zowel de hamburger in de paginaheader als de knop in het menu zelf
		// schakelen dezelfde klasse.
		var menuToggle = e.target.closest('[aria-controls="mo-main-menu"]');
		if (menuToggle) {
			var menu = document.getElementById("mo-main-menu");
			if (!menu) return;
			var visible = menu.classList.toggle("mo-main-menu--visible");
			document.querySelectorAll('[aria-controls="mo-main-menu"]').forEach(function (b) {
				b.setAttribute("aria-expanded", String(visible));
			});
		}
	});
})();
