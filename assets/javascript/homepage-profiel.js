/**
 * homepage-profiel.js
 *
 * Vult dynamische secties op de homepage, overzichtspagina's en
 * detailoverzichtspagina's op basis van de actieve persona.
 */

(function () {
	"use strict";

	var personas = window.personasData;
	var subsidies = window.subsidiesData;
	var regelgeving = window.regelgevingData;
	if (!personas || !subsidies || !regelgeving) return;

	var LS_KEY = "persona";
	var PAGINA_GROOTTE = 5;
	var PATH_PREFIX = (typeof window.PATH_PREFIX === "string" && window.PATH_PREFIX !== "/")
		? window.PATH_PREFIX.replace(/\/$/, "")
		: "";

	function actievePersona() {
		var id;
		try { id = localStorage.getItem(LS_KEY); } catch (e) { /* */ }
		var persona = id ? personas.find(function (p) { return p.id === id; }) : null;
		return persona || personas.find(function (p) { return p.actief; }) || personas[0];
	}

	function vindSubsidie(id) { return subsidies.find(function (s) { return s.id === id; }); }
	function vindRegeling(id) { return regelgeving.find(function (r) { return r.id === id; }); }

	function maakActionGroup(titel) {
		var div = document.createElement("div");
		div.className = "action-group topic-options";
		div.innerHTML = '<label class="save-topic"><input type="checkbox" /> <span class="favorite-label">Bewaar</span> <span class="visually-hidden">' + titel + '</span></label>'
			+ '<button class="link-button share-topic" data-feature="Delen" data-feature-type="functionaliteit">' + ' Deel</button>'
			+ '<button class="link-button hide-topic">Niet relevant voor mij</button>';
		return div;
	}

	function maakSubsidieLi(item) {
		var li = document.createElement("li");
		li.className = "card-topic";
		var a = document.createElement("a");
		a.href = PATH_PREFIX + "/moza/subsidies/" + item.id + "/";
		a.className = "content-link is-unread";
		a.innerHTML = "<h3>" + item.titel + "</h3><span class=\"card-link\"></span>";
		li.appendChild(a);
		var p = document.createElement("p");
		p.textContent = item.beschrijving;
		li.appendChild(p);
		var dl = document.createElement("dl");
		dl.className = "data-overview";
		dl.innerHTML = "<dt>Verstrekker</dt><dd>" + item.verstrekker + "</dd>"
			+ "<dt>Type</dt><dd>" + (item.type || "") + "</dd>"
			+ "<dt>Aanvraagperiode</dt><dd>" + (item.aanvraagperiode || "") + "</dd>"
			+ (item.maximaalBedrag ? "<dt>Maximaal bedrag</dt><dd>" + item.maximaalBedrag + "</dd>" : "")
			+ (item.budgetVergeven ? '<dt>Budget vergeven</dt><dd><div class="progress-bar" role="progressbar" aria-label="Budget vergeven" aria-valuenow="' + item.budgetVergeven + '" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar-fill" style="inline-size: ' + item.budgetVergeven + '%">' + item.budgetVergeven + '%</div></div></dd>' : '');
		li.appendChild(dl);
		li.appendChild(maakActionGroup(item.titel));
		return li;
	}

	function maakRegelingLi(item) {
		var li = document.createElement("li");
		li.className = "card-topic";
		var a = document.createElement("a");
		a.href = PATH_PREFIX + "/moza/regelgeving/" + item.id + "/";
		a.className = "content-link is-unread";
		a.innerHTML = "<h3>" + item.titel + "</h3><span class=\"card-link\"></span>";
		li.appendChild(a);
		var p = document.createElement("p");
		p.textContent = item.beschrijving;
		li.appendChild(p);
		var dl = document.createElement("dl");
		dl.className = "data-overview";
		dl.innerHTML = "<dt>Bron</dt><dd>" + (item.bron || "") + "</dd>"
			+ "<dt>In werking</dt><dd>" + (item.inwerkingtreding || "") + "</dd>"
			+ "<dt>Geldt voor</dt><dd>" + (item.geldtVoor || "") + "</dd>";
		li.appendChild(dl);
		li.appendChild(maakActionGroup(item.titel));
		return li;
	}

	function meldGerenderd(container) {
		container.dispatchEvent(new CustomEvent("content:rendered", { bubbles: true }));
	}

	function vulLijst(container, getagdeItems, limiet) {
		if (!container) return;
		var ul = container.querySelector("ul");
		while (ul.firstChild) ul.removeChild(ul.firstChild);
		var getoond = limiet ? getagdeItems.slice(0, limiet) : getagdeItems;
		getoond.forEach(function (entry) {
			ul.appendChild(entry.maakFn(entry.item));
		});
		ul.setAttribute("aria-busy", "false");
		meldGerenderd(ul);
	}

	function vulPaginering(container, getagdeItems) {
		if (!container) return;
		var paginering = container.querySelector("[data-paginering]");
		var ul = container.querySelector("ul");
		var totaalPaginas = Math.ceil(getagdeItems.length / PAGINA_GROOTTE);
		var huidigePagina = 0;

		function toonPagina(pagina) {
			huidigePagina = pagina;
			while (ul.firstChild) ul.removeChild(ul.firstChild);
			var start = pagina * PAGINA_GROOTTE;
			var eind = Math.min(start + PAGINA_GROOTTE, getagdeItems.length);
			for (var i = start; i < eind; i++) {
				var entry = getagdeItems[i];
				ul.appendChild(entry.maakFn(entry.item));
			}
			ul.setAttribute("aria-busy", "false");
			renderPaginering();
			meldGerenderd(ul);
		}

		function renderPaginering() {
			if (totaalPaginas <= 1) {
				paginering.hidden = true;
				return;
			}
			paginering.hidden = false;
			while (paginering.firstChild) paginering.removeChild(paginering.firstChild);
			var ol = document.createElement("ol");

			if (huidigePagina > 0) {
				var prevLi = document.createElement("li");
				var prevA = document.createElement("a");
				prevA.href = "#hoofd-inhoud";
				prevA.innerHTML = "Vorige<span class=\"visually-hidden\"> pagina</span>";
				prevA.addEventListener("click", function (e) { e.preventDefault(); toonPagina(huidigePagina - 1); document.getElementById("hoofd-inhoud").scrollIntoView(); });
				prevLi.appendChild(prevA);
				ol.appendChild(prevLi);
			}

			for (var i = 0; i < totaalPaginas; i++) {
				var li = document.createElement("li");
				if (i === huidigePagina) {
					var span = document.createElement("span");
					span.setAttribute("aria-current", "page");
					span.textContent = i + 1;
					li.appendChild(span);
				} else {
					var a = document.createElement("a");
					a.href = "#hoofd-inhoud";
					a.textContent = i + 1;
					(function (pag) {
						a.addEventListener("click", function (e) { e.preventDefault(); toonPagina(pag); document.getElementById("hoofd-inhoud").scrollIntoView(); });
					})(i);
					li.appendChild(a);
				}
				ol.appendChild(li);
			}

			if (huidigePagina < totaalPaginas - 1) {
				var nextLi = document.createElement("li");
				var nextA = document.createElement("a");
				nextA.href = "#";
				nextA.innerHTML = "Volgende<span class=\"visually-hidden\"> pagina</span>";
				nextA.addEventListener("click", function (e) { e.preventDefault(); toonPagina(huidigePagina + 1); document.getElementById("hoofd-inhoud").scrollIntoView(); });
				nextLi.appendChild(nextA);
				ol.appendChild(nextLi);
			}

			paginering.appendChild(ol);
		}

		toonPagina(0);
	}

	function resolveIds(ids, vindFn) {
		return ids.map(vindFn).filter(Boolean);
	}

	function tagItems(items, maakFn) {
		return items.map(function (item) { return { item: item, maakFn: maakFn }; });
	}

	// Telt alleen items uit homepageSubsidies/homepageRegelgeving, de gehoogde
	// "nieuw sinds uw laatste bezoek"-items. De overzichten tonen meer items,
	// maar die zijn deel van de algemene branche-lijst en tellen niet als nieuw.
	var huidigeNieuweSubs = [];
	var huidigeNieuweRegs = [];

	function isOngelezen(item) {
		try {
			if (localStorage.getItem("read:" + item.titel)) return false;
			if (localStorage.getItem("hidden:" + item.titel)) return false;
		} catch (e) { /* localStorage niet toegankelijk */ }
		return true;
	}

	function updateSideNavBadges() {
		var ongelezenSubs = huidigeNieuweSubs.filter(function (entry) { return isOngelezen(entry.item); }).length;
		var ongelezenRegs = huidigeNieuweRegs.filter(function (entry) { return isOngelezen(entry.item); }).length;
		setTelling("subsidies-count", ongelezenSubs);
		setTelling("regelgeving-count", ongelezenRegs);
	}

	// Werkt de badge bij en wisselt tussen enkelvoud-/meervoud-formulering.
	function setTelling(badgeId, count) {
		document.querySelectorAll('[data-badge-id="' + badgeId + '"]').forEach(function (el) {
			el.textContent = count;
			el.hidden = count === 0;
		});
		document.querySelectorAll('[data-singular-of="' + badgeId + '"]').forEach(function (el) {
			el.hidden = count !== 1;
		});
		document.querySelectorAll('[data-plural-of="' + badgeId + '"]').forEach(function (el) {
			el.hidden = count === 1;
		});
	}

	function render() {
		var persona = actievePersona();
		var bedrijfSubIds = persona.homepageSubsidies || [];
		var brancheSubIds = (persona.subsidies || []).filter(function (id) { return bedrijfSubIds.indexOf(id) === -1; });
		var bedrijfRegIds = persona.homepageRegelgeving || [];
		var brancheRegIds = (persona.regelgeving || []).filter(function (id) { return bedrijfRegIds.indexOf(id) === -1; });

		var bedrijfSubs = resolveIds(bedrijfSubIds, vindSubsidie);
		var brancheSubs = resolveIds(brancheSubIds, vindSubsidie);
		var bedrijfRegs = resolveIds(bedrijfRegIds, vindRegeling);
		var brancheRegs = resolveIds(brancheRegIds, vindRegeling);

		// Voorkom dat subsidies en regelgeving hetzelfde aantal tonen
		if (brancheSubs.length > 0 && (bedrijfSubs.length + brancheSubs.length) === (bedrijfRegs.length + brancheRegs.length)) {
			brancheSubs = brancheSubs.slice(0, -1);
		}

		// Gecombineerde lijsten: bedrijf-items eerst, dan branche-items
		var alleSubs = tagItems(bedrijfSubs, maakSubsidieLi)
			.concat(tagItems(brancheSubs, maakSubsidieLi));
		var alleRegs = tagItems(bedrijfRegs, maakRegelingLi)
			.concat(tagItems(brancheRegs, maakRegelingLi));

		// Homepage
		var homeSubItems = tagItems(bedrijfSubs, maakSubsidieLi);
		var homeRegItems = tagItems(bedrijfRegs, maakRegelingLi);
		vulLijst(document.querySelector("[data-homepage-subsidies]"), homeSubItems);
		vulLijst(document.querySelector("[data-homepage-regelgeving]"), homeRegItems);

		// Overzichtspagina's (gecombineerd, met paginering)
		var ovzSub = document.querySelector("[data-overzicht-subsidies]");
		var ovzReg = document.querySelector("[data-overzicht-regelgeving]");
		if (ovzSub) vulPaginering(ovzSub, alleSubs);
		if (ovzReg) vulPaginering(ovzReg, alleRegs);

		// Side-nav badges tonen alleen ongelezen "nieuw sinds uw laatste bezoek"-
		// items uit homepageSubsidies/homepageRegelgeving, niet de hele branche-lijst.
		huidigeNieuweSubs = homeSubItems;
		huidigeNieuweRegs = homeRegItems;
		updateSideNavBadges();
	}

	document.addEventListener("content:read", updateSideNavBadges);

	render();
})();
