/**
 * da-iemand-aannemen.js
 *
 * Toestand van het scenario "Iemand aannemen" (Digitale assistent 2.0) in de browser, zodat de
 * stappen op elkaar aansluiten tijdens een onderzoekssessie. Het rekent niets: alle bedragen en
 * uitkomsten staan in _data/daKoen.json en komen uit de regelrecht-engine.
 *
 *  - localStorage "da-aannemen": { bronnen: {uwv: true, …}, ingediend, verstuurdOp, fase, vraag }
 *  - Gegevens per bron: pas als alle bronnen zijn aangevinkt, werkt "Bereken wat het oplevert".
 *  - Concept-aanvraag: "Verstuur" zet de zaak op ontvangen en opent de zaak bij Lopende zaken.
 *  - Zaak en besluit: de stand (fase) bepaalt welke stappen en vastleggingen zichtbaar zijn; de
 *    onderzoeker kiest de stand in het blok "Voor de onderzoeker".
 *  - "Klopt dit niet?": de vraag komt als vastlegging van u in de tijdlijn; het antwoord van de
 *    gemeente verschijnt in de stand "Antwoord op uw vraag".
 */
(function () {
	"use strict";

	var SLEUTEL = "da-aannemen";
	var FASEN = ["indicatie", "ontvangst", "meting", "loonwaarde", "besluit", "antwoord", "betaling"];
	var STAP_VAN_GEBEURTENIS = { vooraf: 0, indicatie: 0, ontvangst: 1, meting: 2, loonwaarde: 3, besluit: 4, antwoord: 5, betaling: 6 };
	var BRONNEN = ["uwv", "gemeente", "kvk", "belastingdienst", "eigen"];

	function lees() {
		try {
			return JSON.parse(localStorage.getItem(SLEUTEL)) || {};
		} catch (e) {
			return {};
		}
	}
	function bewaar(s) {
		try {
			localStorage.setItem(SLEUTEL, JSON.stringify(s));
		} catch (e) {
			/* zonder opslag werkt elke pagina los */
		}
	}
	function faseIndex(s) {
		var i = FASEN.indexOf(s.fase || "ontvangst");
		return i < 0 ? 1 : i;
	}
	function alleBronnen(s) {
		var b = s.bronnen || {};
		return BRONNEN.every(function (id) {
			return b[id];
		});
	}
	function datumNL(iso) {
		var d = new Date(iso);
		return isNaN(d.getTime()) ? "" : d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
	}
	function statusTekst(s) {
		if (!s.ingediend) return "Nog niet verstuurd";
		var i = faseIndex(s);
		return ["", "In behandeling", "Loonwaarde gemeten", "Loonwaarde vastgesteld", "Besluit genomen", "Besluit genomen, vraag beantwoord", "Betaald"][i] || "In behandeling";
	}

	var staat = lees();

	/* Kandidaat: het formulier gaat gewoon naar de volgende pagina; de waarden zijn in daKoen.json. */
	var kandidaatForm = document.getElementById("da-kandidaat-form");
	if (kandidaatForm) {
		kandidaatForm.addEventListener("submit", function (e) {
			e.preventDefault();
			staat.kandidaatIngevuld = true;
			bewaar(staat);
			window.location.href = kandidaatForm.getAttribute("action");
		});
	}

	/* Gegevens per bron: vinkjes. */
	var vinkjes = document.querySelectorAll("input[data-vinkje]");
	if (vinkjes.length) {
		var knop = document.getElementById("da-bereken");
		var stand = document.getElementById("da-bronnen-stand");
		staat.bronnen = staat.bronnen || {};
		function werkBij() {
			var aantal = BRONNEN.filter(function (id) {
				return staat.bronnen[id];
			}).length;
			var klaar = alleBronnen(staat);
			knop.setAttribute("aria-disabled", klaar ? "false" : "true");
			stand.textContent = klaar ? "Alle bronnen bevestigd. U kunt laten berekenen wat het oplevert." : aantal === 0 ? "Nog geen bron bevestigd." : aantal + " van " + BRONNEN.length + " bronnen bevestigd.";
		}
		vinkjes.forEach(function (v) {
			v.checked = !!staat.bronnen[v.dataset.vinkje];
			v.addEventListener("change", function () {
				staat.bronnen[v.dataset.vinkje] = v.checked;
				bewaar(staat);
				werkBij();
			});
		});
		knop.addEventListener("click", function (e) {
			if (knop.getAttribute("aria-disabled") === "true") {
				e.preventDefault();
				stand.textContent = "Vink eerst bij elke bron aan dat de gegevens kloppen.";
			}
		});
		werkBij();
	}

	/* Wat het oplevert: waarschuwing als niet alles bevestigd is. */
	var nietBevestigd = document.getElementById("da-niet-bevestigd");
	if (nietBevestigd) nietBevestigd.hidden = alleBronnen(staat);

	/* Concept-aanvraag: versturen. */
	var verstuur = document.getElementById("da-verstuur");
	if (verstuur) {
		var alVerstuurd = document.getElementById("da-al-verstuurd");
		if (alVerstuurd) alVerstuurd.hidden = !staat.ingediend;
		verstuur.addEventListener("click", function () {
			staat.ingediend = true;
			staat.verstuurdOp = staat.verstuurdOp || "2026-10-05";
			staat.fase = staat.fase || "ontvangst";
			bewaar(staat);
			window.location.href = (window.PATH_PREFIX && window.PATH_PREFIX !== "/" ? window.PATH_PREFIX.replace(/\/$/, "") : "") + "/moza/iemand-aannemen/verstuurd/";
		});
	}
	var verstuurdOp = document.querySelector("[data-da-verstuurd-op]");
	if (verstuurdOp && staat.verstuurdOp) verstuurdOp.textContent = datumNL(staat.verstuurdOp);

	/* Personeel en Lopende zaken: de zaak zichtbaar zodra de aanvraag is verstuurd. */
	document.querySelectorAll("[data-da-zaak]").forEach(function (el) {
		el.hidden = !staat.ingediend;
	});
	document.querySelectorAll("[data-da-status]").forEach(function (el) {
		el.textContent = statusTekst(staat);
	});
	document.querySelectorAll('[data-badge-id="zaken-count"]').forEach(function (el) {
		if (staat.ingediend) {
			el.textContent = String(Math.max(1, parseInt(el.textContent, 10) || 0));
			el.hidden = false;
		}
	});

	/* Zaak en besluit: stand van het verhaal. */
	var zaak = document.getElementById("da-zaak");
	var besluit = document.getElementById("da-besluit");
	var faseKeuze = document.getElementById("da-fase");
	function toonStand() {
		var i = faseIndex(staat);
		var nogNiet = document.getElementById("da-nog-niet-verstuurd");
		if (nogNiet) nogNiet.hidden = !!staat.ingediend;
		if (zaak) zaak.hidden = !staat.ingediend;
		var geenBesluit = document.getElementById("da-nog-geen-besluit");
		if (geenBesluit) geenBesluit.hidden = staat.ingediend && i >= 4;
		if (besluit) besluit.hidden = !(staat.ingediend && i >= 4);
		document.querySelectorAll("#da-voortgang [data-fase]").forEach(function (li) {
			var fi = FASEN.indexOf(li.dataset.fase);
			var naam = li.querySelector("[data-stapnaam]");
			var details = li.querySelector("details");
			li.removeAttribute("aria-current");
			if (fi < i) {
				naam.textContent = "Voltooide stap: ";
				details.open = false;
			} else if (fi === i || (i === 5 && fi === 4)) {
				naam.textContent = "Huidige stap: ";
				li.setAttribute("aria-current", "step");
				details.open = true;
			} else {
				naam.textContent = "Volgende stap: ";
				details.open = false;
			}
		});
		document.querySelectorAll("#da-tijdlijn [data-stap]").forEach(function (li) {
			li.hidden = STAP_VAN_GEBEURTENIS[li.dataset.stap] > i;
		});
		var vraag = document.querySelector('#da-tijdlijn [data-id="g13"] [data-tekst]');
		if (vraag && staat.vraag) vraag.textContent = "“" + staat.vraag + "”";
		if (faseKeuze) faseKeuze.value = FASEN[i];
	}
	if (faseKeuze) {
		faseKeuze.addEventListener("change", function () {
			staat.fase = faseKeuze.value;
			if (!staat.ingediend) {
				staat.ingediend = true;
				staat.verstuurdOp = "2026-10-05";
			}
			bewaar(staat);
			toonStand();
			document.querySelectorAll("[data-da-status]").forEach(function (el) {
				el.textContent = statusTekst(staat);
			});
		});
	}
	if (zaak || besluit) toonStand();

	/* Klopt dit niet? */
	var vraagForm = document.getElementById("da-vraag-form");
	if (vraagForm) {
		var veld = document.getElementById("da-vraag");
		var standVraag = document.getElementById("da-vraag-stand");
		if (staat.vraag) {
			veld.value = staat.vraag;
			standVraag.textContent = "Uw vraag is verstuurd op 3 november 2026 en staat in de zaak. De gemeente antwoordt binnen vijf werkdagen.";
		}
		vraagForm.addEventListener("submit", function (e) {
			e.preventDefault();
			var tekst = veld.value.trim();
			if (!tekst) {
				standVraag.textContent = "Typ eerst uw vraag.";
				veld.focus();
				return;
			}
			staat.vraag = tekst;
			if (faseIndex(staat) < 4) staat.fase = "besluit";
			bewaar(staat);
			standVraag.textContent = "Uw vraag is verstuurd en staat in de zaak. De gemeente antwoordt binnen vijf werkdagen.";
		});
	}

	/* Persona (proeftuin): bij een andere persona begint het scenario opnieuw; keuzelijst voor de onderzoeker.
	   personas.js laadt later (defer-scripts van base.njk), dus pas na DOMContentLoaded. */
	window.addEventListener("DOMContentLoaded", function () {
		var P = window.Personas;
		if (!P) return;
		var actief = P.actief();
		if (actief && staat.persona && staat.persona !== actief.id) {
			staat = { persona: actief.id };
			bewaar(staat);
			window.location.reload();
			return;
		}
		if (actief && staat.persona !== actief.id) {
			staat.persona = actief.id;
			bewaar(staat);
		}
		var keuze = document.getElementById("da-persona");
		if (keuze && P.personas) {
			P.personas.forEach(function (p) {
				var o = document.createElement("option");
				o.value = p.id;
				o.textContent = p.label + (p.bedrijf ? " · " + p.bedrijf.handelsnaam : "");
				if (actief && p.id === actief.id) o.selected = true;
				keuze.appendChild(o);
			});
			keuze.addEventListener("change", function () {
				try {
					localStorage.removeItem(SLEUTEL);
				} catch (e) {
					/* niets */
				}
				P.wissel(keuze.value);
			});
		}
	});

	/* Opnieuw beginnen. */
	document.querySelectorAll("[data-da-reset]").forEach(function (knop) {
		knop.addEventListener("click", function () {
			try {
				localStorage.removeItem(SLEUTEL);
			} catch (e) {
				/* niets te wissen */
			}
			window.location.href = (window.PATH_PREFIX && window.PATH_PREFIX !== "/" ? window.PATH_PREFIX.replace(/\/$/, "") : "") + "/moza/personeel/";
		});
	});
})();
