document.querySelectorAll(".side-nav-toggle").forEach(function (toggle) {
	toggle.addEventListener("click", function () {
		var expanded = toggle.getAttribute("aria-expanded") === "true";
		toggle.setAttribute("aria-expanded", String(!expanded));
	});
});

// Belastingdienst-header menu: open/sluit het hoofdmenu. Sluit bij Escape of een
// klik buiten knop en menu, zodat het zich als een dropdown gedraagt.
document.querySelectorAll(".bd-menu[aria-expanded]").forEach(function (knop) {
	function sluit() {
		knop.setAttribute("aria-expanded", "false");
	}
	knop.addEventListener("click", function () {
		var open = knop.getAttribute("aria-expanded") === "true";
		knop.setAttribute("aria-expanded", String(!open));
	});
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape") sluit();
	});
	document.addEventListener("click", function (e) {
		if (knop.getAttribute("aria-expanded") !== "true") return;
		var lijst = document.getElementById(knop.getAttribute("aria-controls"));
		if (knop.contains(e.target)) return;
		if (lijst && lijst.contains(e.target)) return;
		sluit();
	});
});

// Submenu's in het hoofdmenu (accordion): klap het bijbehorende sublijstje open/dicht.
document.querySelectorAll(".bd-submenu-toggle").forEach(function (toggle) {
	toggle.addEventListener("click", function () {
		var open = toggle.getAttribute("aria-expanded") === "true";
		toggle.setAttribute("aria-expanded", String(!open));
	});
});
