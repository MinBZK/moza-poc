/**
 * actions-menu.js
 *
 * Toggle-logica voor de "Overige acties"-menu's in een action-group.
 * Opent/sluit bij klik op de knop, sluit na een menukeuze, bij klik buiten
 * het menu of Escape. Volgt hetzelfde patroon als de accountwisselaar.
 */

function sluitAlle() {
	document.querySelectorAll('.actions-menu-toggle[aria-expanded="true"]').forEach((btn) => {
		btn.setAttribute("aria-expanded", "false");
		btn.nextElementSibling.hidden = true;
	});
}

document.addEventListener("click", (e) => {
	const toggle = e.target.closest(".actions-menu-toggle");
	if (toggle) {
		const menu = toggle.nextElementSibling;
		const expanded = toggle.getAttribute("aria-expanded") === "true";
		sluitAlle();
		toggle.setAttribute("aria-expanded", String(!expanded));
		menu.hidden = expanded;
		return;
	}

	// Klik op een menukeuze sluit het menu (de actie zelf wordt door
	// berichtenbox.js afgehandeld).
	const item = e.target.closest('.actions-menu-list [role="menuitem"]');
	if (item) {
		sluitAlle();
		return;
	}

	// Klik buiten een menu sluit alle open menu's.
	if (!e.target.closest(".actions-menu")) {
		sluitAlle();
	}
});

document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") {
		const open = document.querySelector('.actions-menu-toggle[aria-expanded="true"]');
		sluitAlle();
		if (open) open.focus();
	}
});
