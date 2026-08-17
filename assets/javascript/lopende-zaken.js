/**
 * lopende-zaken.js
 *
 * Twee taken op de Lopende zaken-pagina's:
 *
 *  1. Zaken die de Digitale Assistent via het case-event in localStorage (key
 *     "zaken") heeft gezet, tonen als rij bovenaan het overzicht (#zaken-overzicht)
 *     en de side-nav telbadge (data-badge-id="zaken-count") bijwerken. De gegevens
 *     komen uit de lopende_zaak van de backend; veldnamen worden tolerant gemapt
 *     zodat de weergave niet afhangt van het exacte backend-schema.
 *  2. De statische zaak-datums relatief aan "vandaag" tonen i.p.v. vaste datums,
 *     zodat de demo altijd actueel oogt. Elke <time> binnen #hoofd-inhoud schuift
 *     met hetzelfde aantal dagen mee als het verschil tussen vandaag en de
 *     ankerdatum (DEMO_NU), waardoor de onderlinge volgorde behouden blijft.
 */

(function () {
	"use strict";

	var LS_KEY = "zaken";

	// Ankerdatum: de datum waarop de statische zaak-inhoud "nu" voorstelt. Alle
	// <time>-datums op de Lopende zaken-pagina's verschuiven met (vandaag - DEMO_NU),
	// zodat de demo meeloopt zonder de ~45 vaste datums met de hand bij te werken.
	var DEMO_NU = new Date(2026, 5, 18); // 18 juni 2026

	// Bekende zaak-typen → detailpagina-route. Alleen routing: de routing naar een
	// detailpagina is en blijft een frontend-zaak (de backend stuurt geen
	// frontend-URL mee). organisatie, onderwerp en status komen uit het case-event.
	var ZAAK_ROUTES = [{ test: /energiebespar|informatieplicht/i, url: "/moza/lopende-zaken/informatieplicht-energiebesparing/" }];

	var PREFIX = typeof window.PATH_PREFIX === "string" && window.PATH_PREFIX !== "/" ? window.PATH_PREFIX.replace(/\/$/, "") : "";

	function pad(p) {
		return /^https?:/.test(p) ? p : PREFIX + p;
	}

	function escapeHTML(value) {
		return String(value == null ? "" : value)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	function leesZaken() {
		try {
			var lijst = JSON.parse(localStorage.getItem(LS_KEY)) || [];
			// Tolerant: oudere entries zijn als wrapper { type:"case", data:{…} }
			// bewaard (van vóór de addZaak-unwrap); pak dan de zaak uit data en
			// behoud aangemaaktOp, zodat de rij toch uit de juiste velden rendert.
			return lijst.map(function (z) {
				if (z && z.type === "case" && z.data && typeof z.data === "object") {
					return Object.assign({ aangemaaktOp: z.aangemaaktOp }, z.data);
				}
				return z;
			});
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

	// --- Datums ---------------------------------------------------------------

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

	// Verschuif op datum-componenten (niet op milliseconden), zodat de zomertijd-
	// overgang nooit een dag naast schiet.
	function verschoven(d, dagen) {
		return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dagen);
	}

	// Schuif de statische zaak-datums mee met vandaag. Alleen op Lopende zaken-
	// pagina's (herkenbaar aan de tabs) en alleen binnen de pagina-inhoud, zodat
	// <time> elders ongemoeid blijft.
	function toonRelatieveDatums() {
		if (!document.querySelector(".lopende-zaken-tabs")) return;
		var nu = new Date();
		var vandaag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
		var dagen = Math.round((vandaag - DEMO_NU) / 86400000);
		if (!dagen) return;
		var root = document.getElementById("hoofd-inhoud") || document;
		root.querySelectorAll("time[datetime]").forEach(function (t) {
			var orig = toDate(t.getAttribute("datetime"));
			if (!orig) return;
			var nieuw = verschoven(orig, dagen);
			t.setAttribute("datetime", isoDatum(nieuw));
			t.textContent = formatDatum(nieuw);
		});
	}

	// --- Badge + dynamische rijen ---------------------------------------------

	function updateBadge() {
		var aantal = leesZaken().length;
		document.querySelectorAll('[data-badge-id="zaken-count"]').forEach(function (el) {
			el.textContent = aantal;
			el.hidden = aantal === 0;
		});
	}

	// Match een zaak op een bekende detailpagina-route (frontend-routing).
	function zaakRoute(zaak) {
		var sleutel = [veld(zaak, ["onderwerp", "titel"], ""), veld(zaak, ["zaak_type"], ""), veld(zaak, ["regeling"], ""), veld(zaak, ["referentienummer"], "")].join(" ");
		for (var i = 0; i < ZAAK_ROUTES.length; i++) {
			if (ZAAK_ROUTES[i].test.test(sleutel)) return ZAAK_ROUTES[i].url;
		}
		return "";
	}

	function datumCel(zaak) {
		var d = toDate(veld(zaak, ["ingediend_op", "datum", "laatsteWijziging", "ingediend", "date", "submitted_date"], zaak.aangemaaktOp));
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
			// Velden komen rechtstreeks uit het case-event (lopende_zaak van de
			// backend); de frontend verzint ze niet. Alleen de detailpagina-route
			// wordt frontend-side bepaald.
			var organisatie = veld(zaak, ["organisatie", "organization", "org"], "");
			var onderwerp = veld(zaak, ["onderwerp", "titel"], veld(zaak, ["zaak_type"], "Zaak"));
			var status = veld(zaak, ["status", "statusLabel"], "");
			var url = zaakRoute(zaak);
			var onderwerpHTML = url ? '<a href="' + escapeHTML(pad(url)) + '">' + escapeHTML(onderwerp) + "</a>" : escapeHTML(onderwerp);

			var tr = document.createElement("tr");
			tr.innerHTML = "<td>" + escapeHTML(organisatie) + "</td>" + "<td>" + onderwerpHTML + "</td>" + "<td>" + datumCel(zaak) + "</td>" + "<td>" + escapeHTML(status) + "</td>";
			frag.appendChild(tr);
		});
		tbody.insertBefore(frag, tbody.firstChild);
	}

	// Init: eerst de statische datums verschuiven, dan de dynamische rijen
	// injecteren (die hebben hun datum al definitief uit het case-event), dan de
	// badge. Op elke pagina werkt de badge ook live bij als de assistent een zaak
	// toevoegt.
	toonRelatieveDatums();
	var tbody = document.getElementById("zaken-overzicht");
	if (tbody) renderOverzicht(tbody);
	updateBadge();
	window.addEventListener("zaken-changed", updateBadge);
})();
