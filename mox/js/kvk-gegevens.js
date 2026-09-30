/**
 * kvk-gegevens.js
 *
 * De KVK-pagina op de echte MijnOverheid is Vue; in dit prototype is het platte
 * HTML. Twee dingen moeten dan alsnog werken: de ⓘ-knop die de uitleg bij een
 * veld toont, en het menu op smalle schermen.
 *
 * Eén listener op document in plaats van per knop: dat blijft werken als er
 * later velden bij komen.
 */

(function () {
	"use strict";

	document.addEventListener("click", function (e) {
		var info = e.target.closest(".lo-auxiliary-list__button");
		if (info) {
			var panel = document.getElementById(info.getAttribute("aria-controls"));
			if (!panel) return;
			var open = info.getAttribute("aria-expanded") === "true";
			info.setAttribute("aria-expanded", String(!open));
			panel.hidden = open;
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
