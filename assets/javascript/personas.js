/**
 * personas.js
 *
 * Schakelt tussen persona's zodat het prototype met verschillende
 * gebruikers getoond kan worden in gebruikerstests. De actieve persona
 * wordt opgeslagen in localStorage onder de key "persona".
 *
 * Elementen met data-profiel-* attributen worden door dit script gevuld:
 *   data-profiel="voornaam"          → persoon.voornaam
 *   data-profiel="achternaam"        → persoon.achternaam
 *   data-profiel="initialen"         → persoon.initialen
 *   data-profiel="naam"              → persoon.voornaam + " " + persoon.achternaam
 *   data-profiel="initialen-bedrijf" → persoon.initialen + " " + persoon.achternaam + " van " + bedrijf.handelsnaam
 *   data-profiel="handelsnaam"       → bedrijf.handelsnaam
 *   data-profiel="kvkNummer"         → bedrijf.kvkNummer
 *   data-profiel="vestigingsnummer"  → bedrijf.vestigingsnummer
 *   data-profiel="rsinNummer"        → bedrijf.rsinNummer
 *   data-profiel="btwNummer"         → bedrijf.btwNummer
 *   data-profiel="omzetbelastingnummer" → bedrijf.omzetbelastingnummer
 *   data-profiel="loonheffingennummer"  → bedrijf.loonheffingennummer
 *   data-profiel="startdatum"        → bedrijf.startdatum
 *   data-profiel="rechtsvorm"        → bedrijf.rechtsvorm
 *   data-profiel="iban"              → bedrijf.iban
 *   data-profiel="werkzamePersonenFulltime" → bedrijf.werkzamePersonenFulltime
 *   data-profiel="werkzamePersonenParttime" → bedrijf.werkzamePersonenParttime
 *   data-profiel="vestigingsadres"   → bedrijf.vestigingsadres
 *   data-profiel="gemeente"          → bedrijf.gemeente
 *   data-profiel="rol"               → bedrijf.rol
 *
 * <dd data-profiel="..."> in een <dl> wordt automatisch verborgen (samen met
 * de voorafgaande <dt>) als de waarde leeg is. Voor parttime werkzame personen
 * geldt extra: bij 0 wordt de rij ook verborgen.
 *
 * Voor lijsten met variabele lengte gebruik je data-profiel-lijst:
 *   <dl data-profiel-lijst="sbi"> … </dl>             → { code, omschrijving }
 *   <dl data-profiel-lijst="jaarrekeningen"> … </dl>   → { jaar, gedeponeerd }
 *   <ul data-profiel-lijst="vestigingen"> … </ul>      → { nummer, type, adres }
 *   <ul data-profiel-lijst="ubo"> … </ul>              → { naam, aardVanBelang, groottevanBelang }
 *
 * Bij een lege array wordt de container verborgen en, indien aanwezig, een
 * sibling <div data-profiel-leeg="sleutel" hidden> getoond als feedback-bericht.
 *
 * Elementen die alleen voor specifieke persona's bedoeld zijn, krijgen
 * data-persona-toon="id" (meerdere id's gescheiden door spaties) plus het
 * hidden-attribuut; dit script toont ze alleen bij de juiste actieve persona.
 * Het spiegelbeeld data-persona-verberg="id" (zonder hidden-attribuut)
 * verbergt een element juist bij die persona's.
 */

(function () {
	"use strict";

	var LS_KEY = "persona";

	// Persona's worden door Eleventy als JSON in de pagina geïnjecteerd.
	var personas = window.personasData;
	if (!personas || !personas.length) return;

	function leesActiefId() {
		try {
			return localStorage.getItem(LS_KEY);
		} catch (e) {
			return null;
		}
	}

	function slaActiefOp(id) {
		try {
			localStorage.setItem(LS_KEY, id);
		} catch (e) { /* localStorage niet toegankelijk */ }
	}

	function vindPersona(id) {
		return personas.find(function (p) { return p.id === id; });
	}

	function vindPersonaOpLabel(label) {
		return personas.find(function (p) { return p.label === label; });
	}

	function urlLabel(persona) {
		return persona.label || persona.id;
	}

	function personaUitUrl() {
		var params = new URLSearchParams(location.search);
		return params.get("persona");
	}

	function actievePersona() {
		// 1. URL-parameter heeft voorrang (deelbaar, zelfde voor iedereen).
		var urlParam = personaUitUrl();
		if (urlParam) {
			// Zoek op label eerst, dan op id als fallback.
			var urlPersona = vindPersonaOpLabel(urlParam) || vindPersona(urlParam);
			if (urlPersona) return urlPersona;
		}
		// 2. localStorage (persoonlijke keuze via Flags-paneel).
		var opgeslagen = leesActiefId();
		if (opgeslagen) {
			var persona = vindPersona(opgeslagen);
			if (persona) return persona;
		}
		// 3. Fallback: de persona die als actief is gemarkeerd in de data.
		return personas.find(function (p) { return p.actief; }) || personas[0];
	}

	function waarde(persona, sleutel) {
		var p = persona.persoon;
		var b = persona.bedrijf;
		switch (sleutel) {
			case "voornaam": return p.voornaam;
			case "achternaam": return p.achternaam;
			case "initialen": return p.initialen;
			case "naam": return p.voornaam + " " + p.achternaam;
			case "initialen-bedrijf": return p.initialen + " " + p.achternaam + " van " + b.handelsnaam;
			case "handelsnaam": return b.handelsnaam;
			case "kvkNummer": return b.kvkNummer;
			case "vestigingsnummer": return b.vestigingsnummer;
			case "rsinNummer": return b.rsinNummer;
			case "btwNummer": return b.btwNummer;
			case "omzetbelastingnummer": return b.omzetbelastingnummer;
			case "loonheffingennummer": return b.loonheffingennummer;
			case "startdatum": return b.startdatum;
			case "rechtsvorm": return b.rechtsvorm;
			case "iban": return b.iban;
			case "werkzamePersonenFulltime": return b.werkzamePersonenFulltime;
			case "werkzamePersonenParttime": return b.werkzamePersonenParttime;
			case "vestigingsadres": return b.vestigingsadres;
			case "vestigingsadresVolledig": return b.vestigingsadresVolledig;
			case "postadres": return b.postadres;
			case "gemeente": return b.gemeente;
			case "branche": return b.branche;
			case "rol": return b.rol;
			default: return "";
		}
	}

	// Bouw één <div><dt>…</dt><dd>…</dd></div> voor in een <dl class="data-overview">.
	function maakDlPaar(term, omschrijving) {
		var div = document.createElement("div");
		var dt = document.createElement("dt");
		var dd = document.createElement("dd");
		dt.textContent = term || "";
		dd.textContent = omschrijving || "";
		div.appendChild(dt);
		div.appendChild(dd);
		return div;
	}

	// Bouw één <li><h3>…</h3><dl>…</dl></li> voor in een <ul class="list-content-links">.
	function maakLijstItemMetDl(titel, paren) {
		var li = document.createElement("li");
		var h3 = document.createElement("h3");
		h3.textContent = titel || "";
		li.appendChild(h3);
		var dl = document.createElement("dl");
		dl.className = "data-overview";
		paren.forEach(function (paar) {
			dl.appendChild(maakDlPaar(paar[0], paar[1]));
		});
		li.appendChild(dl);
		return li;
	}

	function pasToe(persona) {
		// Vul alle data-profiel elementen.
		document.querySelectorAll("[data-profiel]").forEach(function (el) {
			var sleutel = el.getAttribute("data-profiel");
			var tekst = waarde(persona, sleutel);

			// Voor <dd> in een <dl>: verberg de rij als de waarde leeg is, of bij
			// parttime werkzame personen ook bij 0. Wanneer het paar in een
			// <div>-wrapper zit (voor kolom-layout), verbergen we de wrapper als
			// geheel; anders <dt> en <dd> afzonderlijk.
			if (el.tagName === "DD") {
				var leeg = tekst === "" || tekst === null || tekst === undefined;
				var nulParttime = sleutel === "werkzamePersonenParttime" && tekst === 0;
				var verbergen = leeg || nulParttime;
				var ouder = el.parentElement;
				var wrapper = ouder && ouder.tagName === "DIV" && ouder.parentElement && ouder.parentElement.tagName === "DL" ? ouder : null;
				if (wrapper) {
					wrapper.hidden = verbergen;
				} else {
					var dt = el.previousElementSibling;
					el.hidden = verbergen;
					if (dt && dt.tagName === "DT") dt.hidden = verbergen;
				}
				if (verbergen) return;
			}

			if (tekst !== "" && tekst !== null && tekst !== undefined) {
				el.textContent = String(tekst);
			}
		});

		// Vul lijsten op basis van persona.bedrijf[sleutel]. Voor elke lijst-soort
		// een eigen render-strategie, omdat de velden per type verschillen.
		document.querySelectorAll("[data-profiel-lijst]").forEach(function (container) {
			var sleutel = container.getAttribute("data-profiel-lijst");
			var items = persona.bedrijf && persona.bedrijf[sleutel];
			if (!Array.isArray(items)) return;
			container.replaceChildren();

			switch (sleutel) {
				case "sbi":
					items.forEach(function (item) {
						container.appendChild(maakDlPaar(item.code, item.omschrijving));
					});
					break;
				case "jaarrekeningen":
					var kvkUrl = "https://www.kvk.nl/orderstraat/product-kiezen/?kvknummer=" + encodeURIComponent(persona.bedrijf.kvkNummer || "");
					items.forEach(function (item) {
						var div = document.createElement("div");
						var dt = document.createElement("dt");
						dt.textContent = "Jaarrekening " + item.jaar;
						var dd = document.createElement("dd");
						var p = document.createElement("p");
						p.textContent = "Gedeponeerd op " + item.gedeponeerd;
						dd.appendChild(p);
						var link = document.createElement("a");
						link.href = kvkUrl;
						link.target = "_blank";
						link.rel = "external noopener";
						var verborgen = document.createElement("span");
						verborgen.className = "visually-hidden";
						verborgen.textContent = "Jaarrekening " + item.jaar + " ";
						link.appendChild(verborgen);
						link.appendChild(document.createTextNode("Inzien bij KVK"));
						dd.appendChild(link);
						div.appendChild(dt);
						div.appendChild(dd);
						container.appendChild(div);
					});
					break;
				case "vestigingen":
					items.forEach(function (item) {
						container.appendChild(maakLijstItemMetDl(item.type, [
							["Vestigingsnummer", item.nummer],
							["Adres", item.adres]
						]));
					});
					break;
				case "ubo":
					items.forEach(function (item) {
						container.appendChild(maakLijstItemMetDl(item.naam, [
							["Aard van belang", item.aardVanBelang],
							["Grootte van belang", item.groottevanBelang]
						]));
					});
					break;
			}

			// Toon/verberg lege-staat melding bij dezelfde sleutel.
			var leegMelding = document.querySelector('[data-profiel-leeg="' + sleutel + '"]');
			if (leegMelding) {
				leegMelding.hidden = items.length > 0;
				container.hidden = items.length === 0;
			}
		});

		// Toon elementen die alleen voor specifieke persona's bedoeld zijn.
		document.querySelectorAll("[data-persona-toon]").forEach(function (el) {
			var ids = el.getAttribute("data-persona-toon").split(/\s+/);
			el.hidden = ids.indexOf(persona.id) === -1;
		});

		// Spiegelbeeld: verberg elementen juist bij specifieke persona's.
		document.querySelectorAll("[data-persona-verberg]").forEach(function (el) {
			var ids = el.getAttribute("data-persona-verberg").split(/\s+/);
			el.hidden = ids.indexOf(persona.id) !== -1;
		});

		// Markeer de actieve persona (bv. in de accountwisselaar). Alleen in de
		// eigenaar-context van /moza/: in belang- of /mobu/-contexten is geen
		// onderneming "huidig" en bepaalt de server-side aria-current het actieve item.
		var pad = location.pathname;
		var eigenaarContext = pad.indexOf("/moza/") !== -1 && pad.indexOf("/moza/belang-") === -1;
		document.querySelectorAll("[data-profiel-id]").forEach(function (el) {
			var isActief = eigenaarContext && el.getAttribute("data-profiel-id") === persona.id;
			if (isActief) {
				el.setAttribute("aria-current", "true");
			} else {
				el.removeAttribute("aria-current");
			}
		});
	}

	// Bouw de persona-kiezer in het feature flags paneel.
	function bouwKiezer() {
		var panel = document.querySelector(".feature-flags-panel");
		if (!panel) return;

		var actief = actievePersona();

		// Voeg de kiezer toe vóór de "localStorage wissen" knop.
		var clearBtn = panel.querySelector(".feature-flags-clear");

		var heading = document.createElement("p");
		heading.className = "feature-flags-group-heading";
		heading.textContent = "Persona's";
		panel.insertBefore(heading, clearBtn);

		var list = document.createElement("ul");

		personas.forEach(function (persona, i) {
			var li = document.createElement("li");
			var label = document.createElement("label");
			var radio = document.createElement("input");
			radio.type = "radio";
			radio.name = "persona";
			radio.value = persona.id;
			radio.checked = persona.id === actief.id;
			radio.addEventListener("change", function () {
				slaActiefOp(persona.id);
				var params = new URLSearchParams(location.search);
				params.set("persona", urlLabel(persona));
				location.search = params.toString();
			});
			label.appendChild(radio);
			var kiezerLabel = persona.label || ("Persona " + i);
			label.appendChild(document.createTextNode(" " + kiezerLabel + ": " + persona.bedrijf.handelsnaam));
			li.appendChild(label);
			list.appendChild(li);
		});

		panel.insertBefore(list, clearBtn);
	}

	// Initialisatie.
	var persona = actievePersona();
	pasToe(persona);
	bouwKiezer();

	// Behoud ?persona= parameter op alle interne links.
	var urlPersonaId = personaUitUrl();
	if (urlPersonaId) {
		document.querySelectorAll("a[href]").forEach(function (a) {
			var href = a.getAttribute("href");
			// Alleen interne links (beginnen met / of zijn relatief, geen http/mailto/tel).
			if (!href || /^(https?:|mailto:|tel:)/.test(href)) return;
			// Voeg de parameter toe als die er nog niet in zit.
			if (href.indexOf("persona=") !== -1) return;
			var separator = href.indexOf("?") !== -1 ? "&" : "?";
			a.setAttribute("href", href + separator + "persona=" + encodeURIComponent(urlPersonaId));
		});
	}

	// Publieke API voor debugging.
	window.Personas = {
		actief: function () { return actievePersona(); },
		wissel: function (id) {
			var p = vindPersona(id) || vindPersonaOpLabel(id);
			if (!p) return;
			slaActiefOp(p.id);
			var params = new URLSearchParams(location.search);
			params.set("persona", urlLabel(p));
			location.search = params.toString();
		},
		personas: personas,
	};
})();
