/**
 * keten-sessie.js
 *
 * De inlogsessie bij de berichtenuitvraag van het Federatief Berichtenstelsel
 * (MinBZK/MijnOverheidZakelijk#943). Het stelsel bewaart de opgehaalde berichten per ontvanger,
 * zolang er een sessie voor die ontvanger loopt, en elk verzoek onder `/api/v1/berichten` noemt de
 * sessie in de header `X-Sessie`.
 *
 * Deze demo kent geen echte inlog: per tabblad geldt het kiezen van een persona als inloggen. Een
 * andere persona kiezen of op "Uitloggen" klikken beëindigt de sessie van de vorige. Het starten
 * gebeurt in `berichtenbox-keten.js`, bij het eerste verzoek dat er een nodig heeft. Dit bestand
 * bewaart de sessie en ruimt haar op, want dat moet ook kunnen op een pagina zonder berichtenbox.
 *
 * Het sessie-id is een geheim. Het staat in sessionStorage en niet in localStorage: het hoort bij
 * dit tabblad en overleeft een herlading, maar geen gesloten tabblad. Het komt in geen URL, en
 * niet in de console. Een cookie is er wél, om dezelfde reden als bij de ontvanger: een bijlage is
 * een `<a href>`, en die kan geen header meesturen.
 *
 * Er wordt niet afgemeld bij het sluiten van een tabblad. Een browser onderscheidt sluiten niet
 * van herladen, dus `pagehide` zou de sessie ook bij elke herlading beëindigen. Een gesloten
 * tabblad laat zijn sessie verlopen: na een kwartier zonder verkeer ruimt het stelsel haar op.
 *
 * Het portaal is de klok (besluit in MinBZK/moza-poc-fbs-berichtenbox#421 t/m #393): wanneer de
 * bezoeker inactief is, bepaalt de berichtenbox, niet het stelsel. Daarom houdt dit bestand bij
 * wanneer de bezoeker voor het laatst iets deed, en verlengt het de sessie bij activiteit
 * (`POST /api/v1/sessies/huidige/_verlengen`), hoogstens eens per minuut. Niet op een timer, en
 * niet omdat er een verbinding openstaat: een open tabblad op een onbeheerde werkplek hoort na een
 * kwartier uitgelogd te zijn.
 *
 * Draait vóór `personas.js`, dat bij elke paginalading de sessies van een andere persona beëindigt.
 */
(function () {
	"use strict";

	// Eén sleutel per ontvanger, zodat een sessie altijd bij de ontvanger hoort waarvoor ze gestart is.
	const VOORVOEGSEL = "berichtenbox-sessie:";
	// Waar het sessie-cookie voor geldt: hetzelfde pad als het ontvanger-cookie in
	// berichtenbox-keten.js (`ONTVANGER_PAD`), want de proxy heeft ze allebei nodig bij een bijlage.
	const COOKIE_PAD = "/api/v1/berichten";

	// Alleen als sessionStorage niet bruikbaar is: in het geheugen van deze pagina. Dan start elke
	// paginalading een nieuwe sessie, en de oude verloopt vanzelf. Niet als kopie ernaast: wist iets
	// anders sessionStorage, dan hoort de sessie ook hier weg te zijn.
	const geheugen = {};

	// Binnen deze tijd na de laatste klik, toets of navigatie telt de bezoeker als actief. Wat in dat
	// venster gebeurt, mag de sessie verlengen; daarbuiten vraagt de berichtenbox niets meer op
	// zonder dat de bezoeker erom vraagt. Zo leeft een sessie hoogstens een minuut langer dan het
	// kwartier inactiviteit dat het stelsel aanhoudt.
	const ACTIEF_VENSTER_MS = 60 * 1000;
	// Hoogstens zo vaak verlengen. Dat vraagt het stelsel, en vaker levert niets op: een sessie
	// verloopt pas na een kwartier.
	const VERLENG_RITME_MS = 60 * 1000;
	// Wanneer deze sessie voor het laatst verlengd werd, per ontvanger. In sessionStorage, zodat het
	// ritme ook over een navigatie heen geldt: anders verlengt elke paginalading opnieuw.
	const VERLENGD_VOORVOEGSEL = "berichtenbox-sessie-verlengd:";
	const verlengdInGeheugen = {};

	function sleutel(ontvanger) {
		return VOORVOEGSEL + ontvanger;
	}

	/** Het bewaarde sessie-id voor deze ontvanger in dit tabblad, of null. */
	function bewaard(ontvanger) {
		if (!ontvanger) return null;
		try {
			return sessionStorage.getItem(sleutel(ontvanger)) || geheugen[ontvanger] || null;
		} catch (fout) {
			return geheugen[ontvanger] || null;
		}
	}

	function bewaar(ontvanger, id) {
		try {
			sessionStorage.setItem(sleutel(ontvanger), id);
		} catch (fout) {
			console.warn("[Berichtenbox] De sessie kon niet in sessionStorage; na een herlading start er een nieuwe.", fout);
			geheugen[ontvanger] = id;
		}
		zetCookie(ontvanger);
	}

	/**
	 * Vergeet de sessie van deze ontvanger. Met een `id` alleen als dat de bewaarde is: een verzoek
	 * dat met een oude sessie een 401 kreeg, hoort een sessie die intussen vernieuwd is niet weg te
	 * gooien.
	 *
	 * Het cookie blijft staan. Het geldt voor alle tabbladen en kan de sessie van een ander tabblad
	 * dragen, en wat erin staat is vanaf deze pagina niet te lezen: het hoort bij een ander pad. Na
	 * een 401 komt er toch meteen een nieuwe sessie, en die overschrijft het. Alleen het beëindigen
	 * van een sessie wist het: `beeindig` (uitloggen, of personas.js die de sessie van een vorige
	 * persona beëindigt) en de persona-wissel in personas.js.
	 */
	function vergeet(ontvanger, id) {
		const huidige = bewaard(ontvanger);
		if (!huidige || (id && id !== huidige)) return;
		delete geheugen[ontvanger];
		delete verlengdInGeheugen[ontvanger];
		try {
			sessionStorage.removeItem(sleutel(ontvanger));
			sessionStorage.removeItem(VERLENGD_VOORVOEGSEL + ontvanger);
		} catch (fout) {
			/* geen sessionStorage */
		}
	}

	/**
	 * Zet de sessie van deze ontvanger in het cookie dat de proxy bij een bijlage leest.
	 *
	 * Een cookie geldt voor alle tabbladen, een sessie voor één. Daarom zet de berichtenbox dit
	 * opnieuw zodra zijn tabblad weer in beeld komt; anders haalt een klik op een bijlage die op met
	 * de sessie van het tabblad dat het laatst laadde. Rauw, zoals het ontvanger-cookie: het id
	 * bestaat alleen uit letters, cijfers, `-` en `_`.
	 */
	function zetCookie(ontvanger) {
		const id = bewaard(ontvanger);
		if (!id) return;
		try {
			document.cookie = "sessie=" + id + "; path=" + COOKIE_PAD + "; SameSite=Strict" + (location.protocol === "https:" ? "; Secure" : "");
		} catch (fout) {
			console.error("[Berichtenbox] De sessie kon niet in een cookie; bijlagen zijn niet op te halen.", fout);
		}
	}

	function wisCookie() {
		try {
			document.cookie = "sessie=; path=" + COOKIE_PAD + "; SameSite=Strict; Max-Age=0";
		} catch (fout) {
			console.error("[Berichtenbox] De sessie is niet uit het cookie te wissen.", fout);
		}
	}

	/**
	 * Beëindigt de sessie van deze ontvanger bij het stelsel (uitloggen) en vergeet haar hier.
	 *
	 * Eerst vergeten, dan pas het verzoek: lukt dat niet, dan verloopt de sessie na een kwartier
	 * vanzelf, maar dit tabblad gebruikt haar in geen geval meer. `keepalive`, zodat het verzoek
	 * ook aankomt als de pagina meteen daarna weggaat, zoals bij "Uitloggen". Het stelsel antwoordt
	 * met 204, ook voor een sessie die al verlopen was.
	 */
	function beeindig(ontvanger) {
		const id = bewaard(ontvanger);
		if (!id) return Promise.resolve();
		vergeet(ontvanger);
		wisCookie();
		return meldAf(ontvanger, id);
	}

	/** Het verzoek zelf: beëindigt deze sessie bij het stelsel, ook een die hier nooit bewaard is. */
	function meldAf(ontvanger, id) {
		return fetch("/api/v1/sessies/huidige", {
			method: "DELETE",
			headers: { "X-Ontvanger": ontvanger, "X-Sessie": id },
			keepalive: true,
		}).then(
			(respons) => {
				if (!respons.ok) console.warn("[Berichtenbox] Afmelden bij het stelsel mislukte (" + respons.status + "); de sessie verloopt vanzelf.");
			},
			(fout) => {
				console.warn("[Berichtenbox] Afmelden bij het stelsel mislukte; de sessie verloopt vanzelf.", fout);
			}
		);
	}

	/** De ontvangers waarvoor dit tabblad een sessie bewaart. */
	function bewaardeOntvangers() {
		const ontvangers = Object.keys(geheugen);
		try {
			for (let i = 0; i < sessionStorage.length; i++) {
				const naam = sessionStorage.key(i);
				if (naam && naam.indexOf(VOORVOEGSEL) === 0) {
					const ontvanger = naam.slice(VOORVOEGSEL.length);
					if (ontvangers.indexOf(ontvanger) === -1) ontvangers.push(ontvanger);
				}
			}
		} catch (fout) {
			/* geen sessionStorage: dan alleen het geheugen */
		}
		return ontvangers;
	}

	/**
	 * Beëindigt elke sessie in dit tabblad behalve die van deze ontvanger. Met null: allemaal.
	 *
	 * Niet alleen bij een wissel in dit tabblad. Kiest een ander tabblad een andere persona, dan
	 * wordt die hier actief bij de volgende paginalading, en dan staat de sessie van de vorige
	 * persona nog in dit tabblad.
	 */
	function beeindigBehalve(ontvanger) {
		return Promise.all(
			bewaardeOntvangers()
				.filter((anders) => anders !== ontvanger)
				.map(beeindig)
		);
	}

	/**
	 * Voor welke ontvanger deze persona een sessie heeft: alleen een persona die het stelsel
	 * gebruikt (`stelsel: true` in `_data/personas.json`), en dan altijd `KVK:<nummer>`. Dat is
	 * ook de vorm waarop berichtenbox-keten.js de ontvanger bij de demo-omgeving opzoekt.
	 */
	function ontvangerVan(persona) {
		const nummer = persona && persona.stelsel && persona.bedrijf && persona.bedrijf.kvkNummer;
		return nummer ? "KVK:" + String(nummer) : null;
	}

	// Uitgelogd in dit document. Tot de volgende pagina er staat, draait deze nog: een stroom die
	// `sessie-verlopen` meldt of een tik die een 401 krijgt, zou dan een nieuwe sessie starten die
	// niemand meer afsluit — of de bezoeker meteen weer inloggen. Ook na de terugknop, uit de bfcache.
	let afgemeld = false;

	// "Uitloggen" is een gewone link, en blijft dat. Het verzoek gaat mee vóór de navigatie, met
	// `keepalive`, dus de link hoeft niet te wachten. Zonder JavaScript is er ook geen sessie.
	document.addEventListener("click", function (gebeurtenis) {
		const doel = gebeurtenis.target;
		const link = doel && typeof doel.closest === "function" ? doel.closest("[data-uitloggen]") : null;
		if (!link) return;
		// Opent de klik de link ergens anders — een nieuw tabblad, een nieuw venster — dan blijft de
		// bezoeker hier, en hoort dit tabblad niet stil uitgelogd te worden.
		const elders = gebeurtenis.ctrlKey || gebeurtenis.metaKey || gebeurtenis.shiftKey || gebeurtenis.altKey || gebeurtenis.button !== 0 || (link.target && link.target !== "_self");
		if (gebeurtenis.defaultPrevented || elders) return;
		afgemeld = true;
		// Eerst het volgen stil, dan afmelden: anders ziet de stroom het afmelden nog voorbijkomen.
		if (window.BerichtenboxKeten) window.BerichtenboxKeten.stopPollen();
		beeindigBehalve(null);
	});

	// --- Het portaal is de klok -----------------------------------------------------------------

	// Een paginalading is een navigatie, en die telt als activiteit.
	let laatsteActiviteit = Date.now();
	const activiteitKijkers = [];

	/** Deed de bezoeker in de afgelopen minuut iets op deze pagina? */
	function bezoekerActief() {
		return Date.now() - laatsteActiviteit < ACTIEF_VENSTER_MS;
	}

	function verlengdOp(ontvanger) {
		try {
			const bewaard = parseInt(sessionStorage.getItem(VERLENGD_VOORVOEGSEL + ontvanger), 10);
			if (Number.isFinite(bewaard)) return bewaard;
		} catch (fout) {
			/* geen sessionStorage: dan alleen het geheugen */
		}
		return verlengdInGeheugen[ontvanger] || 0;
	}

	function zetVerlengdOp(ontvanger, tijdstip) {
		verlengdInGeheugen[ontvanger] = tijdstip;
		try {
			if (tijdstip) sessionStorage.setItem(VERLENGD_VOORVOEGSEL + ontvanger, String(tijdstip));
			else sessionStorage.removeItem(VERLENGD_VOORVOEGSEL + ontvanger);
		} catch (fout) {
			/* geen sessionStorage: dan alleen het geheugen */
		}
	}

	/**
	 * Verlengt de sessie van deze ontvanger bij het stelsel, als dat de afgelopen minuut niet al
	 * gebeurde. Een gewoon verzoek onder `/api/v1/berichten` verlengt haar ook; dat telt hier niet
	 * mee, dus soms gaat er binnen een minuut één verzoek te veel. Dat is goedkoper dan elke aanroep
	 * in de berichtenbox hier laten aantekenen.
	 *
	 * Een 401 betekent dat de sessie al niet meer liep; verlengen maakt haar niet opnieuw geldig. Dan
	 * vergeten we haar, zodat het volgende verzoek een nieuwe start. Wat de bezoeker daarvan ziet,
	 * regelt de berichtenbox bij dat volgende verzoek.
	 */
	function verleng(ontvanger) {
		const id = bewaard(ontvanger);
		if (!id) return;
		const nu = Date.now();
		if (nu - verlengdOp(ontvanger) < VERLENG_RITME_MS) return;
		zetVerlengdOp(ontvanger, nu);

		const opnieuwBijVolgende = () => {
			// Mislukt, maar de sessie loopt misschien nog: de volgende activiteit probeert het weer.
			if (verlengdOp(ontvanger) === nu) zetVerlengdOp(ontvanger, 0);
		};
		fetch("/api/v1/sessies/huidige/_verlengen", {
			method: "POST",
			headers: { "X-Ontvanger": ontvanger, "X-Sessie": id },
		}).then(
			(respons) => {
				if (respons.status === 401) {
					console.info("[Berichtenbox] De sessie liep al niet meer; het volgende verzoek start een nieuwe.");
					vergeet(ontvanger, id);
				} else if (!respons.ok) {
					console.warn("[Berichtenbox] Verlengen van de sessie mislukte (" + respons.status + ").");
					opnieuwBijVolgende();
				}
			},
			(fout) => {
				console.warn("[Berichtenbox] Verlengen van de sessie mislukte.", fout);
				opnieuwBijVolgende();
			}
		);
	}

	function verlengAlles() {
		if (afgemeld) return;
		bewaardeOntvangers().forEach(verleng);
	}

	function bijActiviteit() {
		laatsteActiviteit = Date.now();
		verlengAlles();
		activiteitKijkers.forEach((kijker) => {
			try {
				kijker();
			} catch (fout) {
				console.error("[Berichtenbox] Een luisteraar op activiteit van de bezoeker struikelde.", fout);
			}
		});
	}

	// Wat als activiteit telt: een klik of aanraking, een toets, scrollen met het wiel, en terugkomen
	// op de pagina (een ander tabblad, de terugknop). Bewegen met de muis niet: dat gebeurt ook
	// zonder dat iemand de pagina gebruikt. Spraakbediening en schakelaars komen als klik of toets
	// binnen. In de vangfase, zodat een onderdeel dat de gebeurtenis tegenhoudt dit niet ongedaan maakt.
	["pointerdown", "keydown", "wheel"].forEach((soort) => {
		document.addEventListener(soort, bijActiviteit, { capture: true, passive: true });
	});
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") bijActiviteit();
	});
	window.addEventListener("pageshow", (gebeurtenis) => {
		if (gebeurtenis.persisted) bijActiviteit();
	});
	// De navigatie zelf. Na DOMContentLoaded, en niet al hier: dan heeft personas.js de sessie van
	// een vorige persona al beëindigd, en verlengen we alleen die van de actieve.
	document.addEventListener("DOMContentLoaded", verlengAlles);

	window.KetenSessie = {
		/** Heeft de bezoeker in dit document op "Uitloggen" geklikt? Dan start er geen sessie meer. */
		get afgemeld() {
			return afgemeld;
		},
		bewaard: bewaard,
		bewaar: bewaar,
		vergeet: vergeet,
		zetCookie: zetCookie,
		beeindig: beeindig,
		beeindigBehalve: beeindigBehalve,
		meldAf: meldAf,
		ontvangerVan: ontvangerVan,
		bezoekerActief: bezoekerActief,
		/** Meldt elke klik, toets of terugkeer van de bezoeker, nadat die als activiteit geteld is. */
		opActiviteit: function (kijker) {
			activiteitKijkers.push(kijker);
		},
	};
})();
