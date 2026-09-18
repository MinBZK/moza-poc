/**
 * nl-wallet-portaal.js
 *
 * "Mijn ondernemingen" in de balk bovenaan, na inloggen met NL Wallet. Markup staat in
 * _includes/header-overheid.njk ([data-nl-wallet-ondernemingen]).
 *
 * NL Wallet deelt per inlog één bevoegdheid. nl-wallet-inloggen.js houdt in sessionStorage onder
 * "inlog:ondernemingen" bij welke bevoegdheden de gebruiker in deze sessie heeft gedeeld; dit script
 * toont die als menu, met per onderneming een link naar de persona met dat KVK-nummer en onderaan
 * "Andere onderneming toevoegen met NL Wallet". Zonder wallet-inlog verandert er niets.
 */

(function () {
	"use strict";

	function lees(sleutel) {
		try {
			return JSON.parse(sessionStorage.getItem(sleutel));
		} catch (e) {
			return null;
		}
	}

	var inlog = lees("inlog:persoon");
	var ondernemingen = lees("inlog:ondernemingen");
	var switcher = document.querySelector("[data-nl-wallet-ondernemingen]");
	if (!switcher || !inlog || inlog.middel !== "NL Wallet" || !Array.isArray(ondernemingen) || ondernemingen.length === 0) return;

	var personas = window.personasData || [];
	var actief = window.Personas && window.Personas.actief ? window.Personas.actief() : null;
	var menu = switcher.querySelector(".account-switcher-menu");
	var toevoegen = menu.querySelector("[data-nl-wallet-toevoegen-item]");

	ondernemingen.forEach(function (onderneming) {
		var persona = personas.filter(function (p) {
			return p.bedrijf && p.bedrijf.kvkNummer === onderneming.kvkNummer;
		})[0];
		if (!persona) return;

		var link = document.createElement("a");
		link.href = "/moza/?persona=" + encodeURIComponent(persona.label || persona.id);
		if (actief && actief.id === persona.id) link.setAttribute("aria-current", "true");
		var naam = document.createElement("span");
		naam.className = "account-switcher-name";
		naam.textContent = onderneming.handelsnaam;
		var functie = document.createElement("span");
		functie.textContent = onderneming.functie || "";
		link.appendChild(naam);
		link.appendChild(document.createTextNode(" "));
		link.appendChild(functie);

		var item = document.createElement("li");
		item.setAttribute("role", "menuitem");
		item.appendChild(link);
		menu.insertBefore(item, toevoegen);
	});

	// Na het toevoegen terug naar waar de gebruiker was.
	var toevoegLink = toevoegen.querySelector("a");
	toevoegLink.href = toevoegLink.getAttribute("href") + "&vervolg=" + encodeURIComponent(location.pathname);

	// Deze wisselaar neemt de plek in van de gewone (achter een vlag) en van de losse naam.
	document.querySelectorAll(".user-menu > .account-switcher:not([data-nl-wallet-ondernemingen]), .user-menu > .account-switcher-fallback").forEach(function (el) {
		el.hidden = true;
	});
	switcher.hidden = false;
})();
