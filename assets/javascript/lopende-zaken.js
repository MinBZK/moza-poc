/**
 * lopende-zaken.js
 *
 * Zaken die de Digitale Assistent aanmaakt (case-event → localStorage, key "zaken")
 * verschijnen als rij bovenaan het overzicht en tellen mee in de side-nav telbadge
 * (data-badge-id="zaken-count").
 *
 * De pagina bevat voorbeeldrijen zodat het overzicht ook zonder gesprek gevuld is.
 * Dient de gebruiker een rapportage in over hetzelfde onderwerp, dan vervangt zijn
 * eigen zaak die voorbeeldrij: twee regels over dezelfde verplichting laten hem
 * denken dat hij het twee keer heeft ingediend.
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

	function updateBadge(zaken) {
		var aantal = zaken.length;
		document.querySelectorAll('[data-badge-id="zaken-count"]').forEach(function (el) {
			el.textContent = aantal;
			el.hidden = aantal === 0;
		});
	}

	// "2026-08-11T09:12:33+00:00" → "11 augustus 2026" (schrijfwijzer: volledige maandnaam).
	var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

	function datumDelen(waarde) {
		var d = waarde ? new Date(waarde) : new Date();
		if (isNaN(d.getTime())) d = new Date();
		var iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
		return { iso: iso, leesbaar: d.getDate() + " " + MAANDEN[d.getMonth()] + " " + d.getFullYear() };
	}

	function cel(tekst) {
		var td = document.createElement("td");
		td.textContent = tekst || "";
		return td;
	}

	function maakRij(zaak, detailUrl) {
		var tr = document.createElement("tr");
		var datum = datumDelen(zaak.ingediend_op);

		tr.appendChild(cel(zaak.organisatie || "Rijksdienst voor Ondernemend Nederland"));

		var onderwerp = document.createElement("td");
		var link = document.createElement("a");
		link.href = detailUrl;
		link.textContent = zaak.onderwerp || zaak.zaak_type || "Ingediende rapportage";
		onderwerp.appendChild(link);
		tr.appendChild(onderwerp);

		var datumCel = document.createElement("td");
		var tijd = document.createElement("time");
		tijd.setAttribute("datetime", datum.iso);
		tijd.textContent = datum.leesbaar;
		datumCel.appendChild(tijd);
		tr.appendChild(datumCel);

		tr.appendChild(cel(zaak.status || "In behandeling"));
		return tr;
	}

	function toonZaken(zaken) {
		var lijst = document.querySelector("[data-zaken-lijst]");
		if (!lijst) return;
		var detailUrl = lijst.dataset.zaakDetailUrl || "";

		// Eerder ingevoegde rijen weg, zodat een tweede aanroep niet dupliceert.
		lijst.querySelectorAll("[data-zaak-eigen]").forEach(function (rij) {
			rij.remove();
		});
		lijst.querySelectorAll("[data-zaak-voorbeeld]").forEach(function (rij) {
			rij.hidden = false;
		});

		zaken.forEach(function (zaak) {
			var rij = maakRij(zaak, detailUrl);
			rij.setAttribute("data-zaak-eigen", "");
			lijst.insertBefore(rij, lijst.firstElementChild);

			// Voorbeeldrij over hetzelfde onderwerp wijkt voor de echte zaak.
			var onderwerp = zaak.onderwerp || "";
			lijst.querySelectorAll("[data-zaak-voorbeeld]").forEach(function (voorbeeld) {
				if (voorbeeld.dataset.zaakVoorbeeld === onderwerp) voorbeeld.hidden = true;
			});
		});
	}

	function ververs() {
		var zaken = leesZaken();
		updateBadge(zaken);
		toonZaken(zaken);
	}

	// Bij laden, en live zodra de assistent een zaak toevoegt.
	ververs();
	window.addEventListener("zaken-changed", ververs);
})();
