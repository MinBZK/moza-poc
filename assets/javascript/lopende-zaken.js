/**
 * lopende-zaken.js
 *
 * Toont zaken die via de Digitale Assistent zijn aangemaakt en in localStorage
 * (key "zaken") staan. De gegevens komen uit het case-event van de backend; dit
 * script voegt geen inhoud toe, het leest alleen wat er bewaard is.
 *
 *  - Side-nav badge (data-badge-id="zaken-count") bijwerken op elke pagina.
 *  - Op de Lopende zaken-overzichtspagina dynamische rijen toevoegen bovenaan de
 *    bestaande tabel (#zaken-overzicht).
 *
 * Veldnamen uit de case-payload worden tolerant gemapt (NL + EN), zodat de
 * weergave werkt ongeacht het exacte schema van de backend.
 */

(function () {
	"use strict";

	var LS_KEY = "zaken";

	function escapeHTML(value) {
		return String(value == null ? "" : value)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	function leesZaken() {
		try {
			return JSON.parse(localStorage.getItem(LS_KEY)) || [];
		} catch (e) {
			return [];
		}
	}

	// Eerste niet-lege waarde uit een lijst kandidaat-veldnamen, anders fallback.
	function veld(zaak, namen, fallback) {
		for (var i = 0; i < namen.length; i++) {
			var w = zaak[namen[i]];
			if (w != null && w !== "") return w;
		}
		return fallback;
	}

	function toDate(waarde) {
		if (waarde == null || waarde === "") return null;
		var d;
		if (typeof waarde === "number") {
			d = new Date(waarde);
		} else if (/^\d{4}-\d{2}-\d{2}/.test(String(waarde))) {
			var p = String(waarde).slice(0, 10).split("-");
			d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
		} else {
			d = new Date(waarde);
		}
		return isNaN(d.getTime()) ? null : d;
	}

	function isoDatum(d) {
		return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
	}

	function formatDatum(d) {
		return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
	}

	function updateBadge() {
		var aantal = leesZaken().length;
		document.querySelectorAll('[data-badge-id="zaken-count"]').forEach(function (el) {
			el.textContent = aantal;
			el.hidden = aantal === 0;
		});
	}

	function datumCel(zaak) {
		var d = toDate(veld(zaak, ["datum", "laatsteWijziging", "ingediend", "date", "submitted_date"], zaak.aangemaaktOp));
		if (!d) return "";
		return '<time datetime="' + isoDatum(d) + '">' + escapeHTML(formatDatum(d)) + "</time>";
	}

	function renderOverzicht(tbody) {
		var zaken = leesZaken()
			.slice()
			.sort(function (a, b) {
				return (b.aangemaaktOp || 0) - (a.aangemaaktOp || 0);
			});
		if (zaken.length === 0) return;

		var frag = document.createDocumentFragment();
		zaken.forEach(function (zaak) {
			var organisatie = veld(zaak, ["organisatie", "organization", "org"], "");
			var onderwerp = veld(zaak, ["onderwerp", "titel", "title", "subject", "naam"], "Zaak");
			var status = veld(zaak, ["status", "statusLabel"], "Ingediend");
			var tr = document.createElement("tr");
			tr.innerHTML = "<td>" + escapeHTML(organisatie) + "</td>" + "<td>" + escapeHTML(onderwerp) + "</td>" + "<td>" + datumCel(zaak) + "</td>" + "<td>" + escapeHTML(status) + "</td>";
			frag.appendChild(tr);
		});
		tbody.insertBefore(frag, tbody.firstChild);
	}

	// Badge op elke pagina bijwerken; ook live als de assistent een zaak toevoegt.
	updateBadge();
	window.addEventListener("zaken-changed", updateBadge);

	// Overzicht: dynamische rijen bovenaan de bestaande tabel.
	var tbody = document.getElementById("zaken-overzicht");
	if (tbody) renderOverzicht(tbody);
})();
