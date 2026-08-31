/**
 * regelbord.js
 *
 * Het bord op /moza/regelgeving/: kaarten uit de actieve persona, ingedeeld
 * volgens het voorstel van de assistent (regelbord-logica.js) of de keuze van
 * de ondernemer, met verplaatsen via een knopmenu. Geen slepen: toetsenbord en
 * screenreader kunnen alles wat de muis kan.
 */
(function () {
	"use strict";

	var wortel = document.querySelector("[data-regelbord]");
	if (!wortel || !window.MozaRegelbord) return;

	var logica = window.MozaRegelbord;
	var melding = document.querySelector("[data-bord-melding]");
	var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

	function persona() {
		return window.Personas && window.Personas.actief ? window.Personas.actief() : null;
	}
	function kvk() {
		var p = persona();
		return (p && p.bedrijf && p.bedrijf.kvkNummer) || "";
	}
	function zaken() {
		try {
			return JSON.parse(localStorage.getItem("zaken")) || [];
		} catch (e) {
			return [];
		}
	}
	function verborgenTitels() {
		var set = new Set();
		try {
			for (var i = 0; i < localStorage.length; i++) {
				var k = localStorage.key(i);
				if (k && k.indexOf("hidden:") === 0) set.add(k.slice(7));
			}
		} catch (e) {
			/* localStorage niet toegankelijk: dan geen eerder verborgen items */
		}
		return set;
	}
	function context() {
		return { vandaag: new Date(), zaken: zaken(), verborgenTitels: verborgenTitels() };
	}
	function datumNL(iso) {
		var d = new Date(iso);
		if (isNaN(d.getTime())) return "";
		return d.getUTCDate() + " " + MAANDEN[d.getUTCMonth()] + " " + d.getUTCFullYear();
	}
	function kolomLabel(id) {
		var k = logica.KOLOMMEN.filter(function (kolom) {
			return kolom.id === id;
		})[0];
		return k ? k.label : id;
	}
	function zeg(tekst) {
		if (melding) melding.textContent = tekst;
	}
	function el(tag, klasse, tekst) {
		var e = document.createElement(tag);
		if (klasse) e.className = klasse;
		if (tekst != null) e.textContent = tekst;
		return e;
	}

	// Alle kaarten uit het corpus, voor kaarten die de ondernemer via zoeken
	// aan het bord toevoegde (die staan niet in de persona-lijst).
	function alleKaarten() {
		return (window.regelgevingData || [])
			.map(function (r) {
				return { id: r.id, soort: "regeling", item: r };
			})
			.concat(
				(window.subsidiesData || []).map(function (s) {
					return { id: s.id, soort: "subsidie", item: s };
				})
			);
	}

	function kaartenVanBord(bord) {
		var kaarten = logica.kaartenVoor(persona(), window.regelgevingData || [], window.subsidiesData || []);
		var alle = alleKaarten();
		Object.keys(bord).forEach(function (id) {
			if (
				kaarten.some(function (k) {
					return k.id === id;
				})
			)
				return;
			var extra = alle.filter(function (k) {
				return k.id === id;
			})[0];
			if (extra) kaarten.push(extra);
		});
		return kaarten;
	}

	// De strook "Wat we weten": alleen feiten met een bron. Geen aannames.
	function feitenVoor(kaart, ctx) {
		var item = kaart.item;
		var feiten = [];
		var start = logica.parseDatum(item.inwerkingtreding);
		if (start) feiten.push([start.getTime() > ctx.vandaag.getTime() ? "Geldt vanaf" : "Geldt sinds", item.inwerkingtreding]);
		if (item.aanvraagperiode) feiten.push(["Aanvragen", item.aanvraagperiode]);
		var zaak = null;
		ctx.zaken.forEach(function (z) {
			var onderwerp = String(z.onderwerp || z.titel || "");
			if (!zaak && (z.regelId === kaart.id || (kaart.id === "milieubeheer" && /energiebespar|informatieplicht/i.test(onderwerp)))) zaak = z;
		});
		if (zaak) {
			var status = zaak.status ? zaak.status.charAt(0).toUpperCase() + zaak.status.slice(1) : "Aangemaakt";
			feiten.push(["Zaak", status + (zaak.referentienummer ? ", referentie " + zaak.referentienummer : "")]);
		}
		feiten.push(["Toets", item.regelrechtRegel ? "Automatisch te toetsen (RegelRecht)" : "Niet automatisch te toetsen"]);
		return feiten;
	}

	function maakMenu(kaart, huidigeKolom) {
		var wrap = el("div", "regelkaart-menu");
		var knop = el("button", "secondary", "Verplaats naar…");
		knop.type = "button";
		knop.setAttribute("aria-haspopup", "true");
		knop.setAttribute("aria-expanded", "false");
		var lijst = el("ul");
		lijst.hidden = true;
		logica.KOLOMMEN.forEach(function (kolom) {
			if (kolom.id === huidigeKolom) return;
			var li = el("li");
			var b = el("button", "link-button", kolom.label);
			b.type = "button";
			b.addEventListener("click", function () {
				sluit();
				verplaats(kaart, kolom.id, knop);
			});
			li.appendChild(b);
			lijst.appendChild(li);
		});
		function open() {
			lijst.hidden = false;
			knop.setAttribute("aria-expanded", "true");
			var eerste = lijst.querySelector("button");
			if (eerste) eerste.focus();
		}
		function sluit() {
			lijst.hidden = true;
			knop.setAttribute("aria-expanded", "false");
		}
		knop.addEventListener("click", function () {
			if (lijst.hidden) open();
			else sluit();
		});
		wrap.addEventListener("keydown", function (e) {
			if (e.key === "Escape" && !lijst.hidden) {
				e.preventDefault();
				sluit();
				knop.focus();
			}
		});
		wrap.addEventListener("focusout", function (e) {
			if (!wrap.contains(e.relatedTarget)) sluit();
		});
		wrap.appendChild(knop);
		wrap.appendChild(lijst);
		return wrap;
	}

	// "Niet beoordelen" vraagt een reden: die blijft op de kaart staan, zodat de
	// ondernemer (en wie meekijkt) later ziet waarom.
	function vraagReden(kaart, artikel, terugNaar) {
		if (artikel.querySelector(".regelkaart-reden")) return;
		var form = el("form", "regelkaart-reden");
		var label = el("label", null, "Waarom wilt u deze regel niet beoordelen?");
		var veld = document.createElement("input");
		veld.type = "text";
		veld.required = true;
		veld.id = "reden-" + kaart.id;
		label.htmlFor = veld.id;
		var acties = el("div", "action-group");
		var ok = el("button", null, "Opslaan");
		ok.type = "submit";
		var annuleer = el("button", "secondary", "Annuleren");
		annuleer.type = "button";
		annuleer.addEventListener("click", function () {
			form.remove();
			terugNaar.focus();
		});
		acties.appendChild(ok);
		acties.appendChild(annuleer);
		form.appendChild(label);
		form.appendChild(veld);
		form.appendChild(acties);
		form.addEventListener("submit", function (e) {
			e.preventDefault();
			var reden = veld.value.trim();
			if (!reden) return;
			bewaarPlaatsing(kaart, "niet-beoordelen", reden);
			render();
			focusKaart(kaart.id);
			zeg("Verplaatst naar Niet beoordelen.");
		});
		artikel.appendChild(form);
		veld.focus();
	}

	function bewaarPlaatsing(kaart, kolomId, reden) {
		var bord = logica.leesBord(localStorage, kvk());
		bord[kaart.id] = { kolom: kolomId, door: "ondernemer", op: new Date().toISOString().slice(0, 10) };
		if (reden) bord[kaart.id].reden = reden;
		logica.schrijfBord(localStorage, kvk(), bord);
	}

	function verplaats(kaart, kolomId, knop) {
		if (kolomId === "niet-beoordelen") {
			vraagReden(kaart, knop.closest(".regelkaart"), knop);
			return;
		}
		bewaarPlaatsing(kaart, kolomId, null);
		render();
		focusKaart(kaart.id);
		zeg("Verplaatst naar " + kolomLabel(kolomId) + ".");
	}

	function focusKaart(id) {
		var knop = wortel.querySelector('[data-kaart="' + id + '"] .regelkaart-menu > button');
		if (knop) knop.focus();
	}

	function maakKaart(kaart, stand, ctx) {
		var item = kaart.item;
		var li = el("li");
		var artikel = el("article", "regelkaart");
		artikel.setAttribute("data-kaart", kaart.id);
		artikel.setAttribute("aria-labelledby", "kaart-" + kaart.id);
		artikel.appendChild(el("p", "regelkaart-label", (kaart.soort === "subsidie" ? "Subsidie" : "Wet") + " · " + (item.bron || item.verstrekker || "")));
		var h3 = el("h3", null, item.titel);
		h3.id = "kaart-" + kaart.id;
		artikel.appendChild(h3);
		artikel.appendChild(el("p", null, item.beschrijving || ""));

		var dl = el("dl", "regelkaart-feiten");
		feitenVoor(kaart, ctx).forEach(function (f) {
			dl.appendChild(el("dt", null, f[0]));
			dl.appendChild(el("dd", null, f[1]));
		});
		artikel.appendChild(dl);

		var herkomst = stand.door === "ondernemer" ? "Door u geplaatst op " + datumNL(stand.op) : "Voorgesteld door de assistent";
		if (stand.reden) herkomst += " · Reden: " + stand.reden;
		artikel.appendChild(el("p", "regelkaart-herkomst", herkomst));

		var acties = el("div", "regelkaart-acties");
		if (item.regelrechtRegel) {
			var toets = el("button", null, "Geldt dit voor mij?");
			toets.type = "button";
			toets.setAttribute("data-actie", "toets");
			toets.addEventListener("click", function () {
				window.MozaRegelbordUI.open(kaart, "toets");
			});
			acties.appendChild(toets);
		}
		var vraag = el("button", "secondary", "Vraag de assistent");
		vraag.type = "button";
		vraag.setAttribute("data-actie", "assistent");
		vraag.addEventListener("click", function () {
			window.MozaRegelbordUI.open(kaart, "vraag");
		});
		acties.appendChild(vraag);
		acties.appendChild(maakMenu(kaart, stand.kolom));
		if (item.externUrl) {
			var lees = el("a", "link-button", "Lees de regel");
			lees.href = item.externUrl;
			lees.target = "_blank";
			lees.rel = "noopener";
			acties.appendChild(lees);
		}
		artikel.appendChild(acties);
		li.appendChild(artikel);
		return li;
	}

	function render() {
		var ctx = context();
		var bord = logica.leesBord(localStorage, kvk());
		var kaarten = kaartenVanBord(bord);
		wortel.querySelectorAll("[data-kolom] ul").forEach(function (ul) {
			while (ul.firstChild) ul.removeChild(ul.firstChild);
		});
		kaarten.forEach(function (kaart) {
			var stand = logica.plaatsing(kaart, bord, ctx);
			var ul = wortel.querySelector('[data-kolom="' + stand.kolom + '"] ul');
			if (ul) ul.appendChild(maakKaart(kaart, stand, ctx));
		});
	}

	// Zijpaneel: dezelfde chat-elementen als /moza/digitale-assistent/, dus
	// digitale-assistent.js werkt ongewijzigd. De scope (welke regel) gaat via
	// window.MozaRegelScope (gesprekssleutel) en de openingsvraag.
	var paneel = document.getElementById("assistent-paneel");
	var paneelScope = document.querySelector("[data-paneel-scope]");
	var paneelSluit = document.getElementById("assistent-paneel-sluit");
	var laatsteKnop = null;

	function sluitPaneel() {
		if (!paneel || paneel.hidden) return;
		paneel.hidden = true;
		window.MozaRegelScope = { id: null };
		if (laatsteKnop && document.contains(laatsteKnop)) laatsteKnop.focus();
	}

	function openPaneel(kaart, modus) {
		if (!paneel) return;
		laatsteKnop = document.activeElement;
		window.MozaRegelScope = { id: kaart.id };
		if (paneelScope) paneelScope.textContent = "Dit gesprek gaat over: " + kaart.item.titel;
		paneel.hidden = false;
		if (window.MozaChat && window.MozaAssistentVraag) {
			window.MozaChat.herlaad();
			var vraag = window.MozaAssistentVraag.scopeVraag(kaart.item, kaart.soort, modus);
			var berichten = document.getElementById("chat-messages");
			// Een gesprek dat al liep gaat gewoon verder; alleen een toets start
			// altijd opnieuw met de toetsvraag.
			if (modus === "toets" || !berichten || !berichten.childElementCount) window.MozaChat.stel(vraag);
		}
		if (paneelSluit) paneelSluit.focus();
	}

	if (paneelSluit) paneelSluit.addEventListener("click", sluitPaneel);
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && paneel && !paneel.hidden) sluitPaneel();
	});

	// Zoekbalk over het hele corpus. Het model (optioneel, /zoektermen) mag
	// alleen zoektermen teruggeven; de frontend toont nooit modeltekst als
	// resultaat. Zonder endpoint gewoon zonder extra termen zoeken.
	var zoekForm = document.getElementById("regel-zoek-form");
	var zoekInput = document.getElementById("regel-zoek-input");
	var zoekUit = document.querySelector("[data-zoekresultaten]");
	var slimZoeken = document.querySelector("[data-slim-zoeken]");

	function chatApiBasis() {
		var basis = window.MOZA_CHAT_API || (window.chatApi && window.chatApi.base) || "";
		return String(basis).replace(/\/$/, "");
	}

	function extraTermen(vraag) {
		var basis = chatApiBasis();
		if (!slimZoeken || slimZoeken.hidden || !basis || typeof fetch !== "function") return Promise.resolve([]);
		return fetch(basis + "/zoektermen", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ vraag: vraag }),
			signal: AbortSignal.timeout(4000),
		})
			.then(function (r) {
				return r.ok ? r.json() : { termen: [] };
			})
			.then(function (d) {
				return Array.isArray(d.termen) ? d.termen.slice(0, 8) : [];
			})
			.catch(function () {
				return [];
			});
	}

	function toonResultaten(vraag, resultaten) {
		if (!zoekUit) return;
		while (zoekUit.firstChild) zoekUit.removeChild(zoekUit.firstChild);
		zoekUit.appendChild(el("h3", null, resultaten.length ? resultaten.length + " gevonden voor “" + vraag + "”" : "Geen regel gevonden voor “" + vraag + "”"));
		if (!resultaten.length) {
			var p = el("p", null, "Probeer een ander woord, of kijk op ");
			var a = el("a", null, "wetten.overheid.nl");
			a.href = "https://wetten.overheid.nl/";
			a.target = "_blank";
			a.rel = "noopener";
			p.appendChild(a);
			p.appendChild(document.createTextNode("."));
			zoekUit.appendChild(p);
			return;
		}
		var ctx = context();
		var bord = logica.leesBord(localStorage, kvk());
		var eigen = kaartenVanBord(bord).map(function (k) {
			return k.id;
		});
		var ul = el("ul");
		resultaten.slice(0, 10).forEach(function (kaart) {
			var opBord = eigen.indexOf(kaart.id) >= 0;
			var stand = opBord ? logica.plaatsing(kaart, bord, ctx) : { kolom: "te-doen", door: "assistent" };
			var li = maakKaart(kaart, stand, ctx);
			var artikel = li.querySelector(".regelkaart");
			var status = el("p", "regelkaart-herkomst");
			if (opBord) {
				status.textContent = "Staat op uw bord: " + kolomLabel(stand.kolom);
			} else {
				var voeg = el("button", "secondary", "Toevoegen aan bord");
				voeg.type = "button";
				voeg.addEventListener("click", function () {
					bewaarPlaatsing(kaart, "te-doen", null);
					render();
					toonResultaten(vraag, resultaten);
					zeg("“" + kaart.item.titel + "” toegevoegd aan Te doen.");
				});
				status.appendChild(voeg);
			}
			artikel.insertBefore(status, artikel.querySelector(".regelkaart-acties"));
			ul.appendChild(li);
		});
		zoekUit.appendChild(ul);
	}

	if (zoekForm) {
		zoekForm.addEventListener("submit", function (e) {
			e.preventDefault();
			var vraag = zoekInput.value.trim();
			if (!vraag) return;
			extraTermen(vraag).then(function (termen) {
				toonResultaten(vraag, logica.zoek(vraag, window.regelgevingData || [], window.subsidiesData || [], termen));
			});
		});
	}

	window.MozaRegelbordUI = {
		render: render,
		open: openPaneel,
		sluit: sluitPaneel,
		bewaarPlaatsing: bewaarPlaatsing,
	};

	render();
	document.addEventListener("persona:changed", render);
	window.addEventListener("pageshow", render);
	window.addEventListener("storage", function (e) {
		if (e.key === "zaken" || e.key === "persona" || (e.key && e.key.indexOf("bord:") === 0)) render();
	});
})();
