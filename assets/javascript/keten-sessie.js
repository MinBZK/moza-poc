/**
 * keten-sessie.js
 *
 * De inlogsessie bij de berichtenuitvraag van het Federatief Berichtenstelsel
 * (MinBZK/MijnOverheidZakelijk#943). Het stelsel bewaart de opgehaalde berichten onder een sessie,
 * en elk verzoek onder `/api/v1/berichten` noemt die sessie in de header `X-Sessie`.
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
	 * een 401 komt er toch meteen een nieuwe sessie, en die overschrijft het. Alleen uitloggen
	 * (`beeindig`) wist het.
	 */
	function vergeet(ontvanger, id) {
		const huidige = bewaard(ontvanger);
		if (!huidige || (id && id !== huidige)) return;
		delete geheugen[ontvanger];
		try {
			sessionStorage.removeItem(sleutel(ontvanger));
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
		if (!doel || typeof doel.closest !== "function" || !doel.closest("[data-uitloggen]")) return;
		afgemeld = true;
		// Eerst het volgen stil, dan afmelden: anders ziet de stroom het afmelden nog voorbijkomen.
		if (window.BerichtenboxKeten) window.BerichtenboxKeten.stopPollen();
		beeindigBehalve(null);
	});

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
		ontvangerVan: ontvangerVan,
	};
})();
