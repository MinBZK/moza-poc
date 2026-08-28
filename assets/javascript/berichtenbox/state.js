/**
 * De berichtenbox-state: wat de bezoeker met zijn berichten heeft gedaan.
 *
 * Gelezen, gearchiveerd, verwijderd, gemarkeerd, verplaatst naar een map, plus de eigen mappen en
 * de berichten die via polling binnenkwamen. De bron levert de berichten; deze module levert wat
 * de bezoeker eraan veranderd heeft. De twee worden pas in de render-laag samengevoegd — vandaar
 * dat elke vraag hier het oorspronkelijke veld uit het bericht meekrijgt als tweede argument.
 *
 * Kent de dataset niet en raakt de DOM niet aan. `opslag`, `persona` en `bekendeMagazijnIds` komen
 * van buiten, zodat dit zonder browser te testen is.
 *
 * De staat hoort bij één persona. Tussen persona's bestaat geen enkel verband: het zijn andere
 * bedrijven met andere post. Staat er een staat van iemand anders, dan wordt die niet gelezen maar
 * weggegooid — anders draagt een bezoeker het archief van een vorige persona met zich mee.
 *
 * Let op: dit is client-state. Het Federatief Berichtenstelsel is zelf eigenaar van leesstatus,
 * map en verwijdering (`PATCH`/`DELETE /berichten/{berichtId}`). Zolang die niet gebruikt worden,
 * blijft een markering op één browser staan. Zie het plan onder "Het contract van het stelsel".
 */

export const LS_KEY = "berichtenbox";

/** Meer dan dit aantal binnengedruppelde berichten bewaren heeft geen demo-waarde. */
export const NIEUWE_BERICHTEN_LIMIET = 5;

const SLEUTELS_MET_OBJECT = ["gelezen", "ongelezenToegevoegd", "gearchiveerd", "verwijderd", "gemarkeerd", "mapOverride"];

function defaults() {
	return {
		// Van wie deze staat is. Wisselt de persona, dan begint alles opnieuw.
		persona: null,
		eersteBezoekGehad: false,
		gelezen: {},
		ongelezenToegevoegd: {},
		gearchiveerd: {},
		verwijderd: {},
		gemarkeerd: {},
		mapOverride: {},
		eigenMappen: [],
		// Via polling binnengekomen berichten; bewaard zodat ze na herladen zichtbaar blijven.
		nieuweBerichten: [],
		// A/B-test Belastingdienst-berichtenbox: ook berichten van andere organisaties tonen.
		toonAndereOrganisaties: false,
	};
}

/** Vorm en aantal: wat er sowieso niet in hoort, ongeacht welke bron er straks gekozen wordt. */
function opschonen(berichten) {
	const bruikbaar = berichten.filter((bericht) => !!bericht);
	if (bruikbaar.length < berichten.length) {
		console.warn("[Berichtenbox] " + (berichten.length - bruikbaar.length) + " lege plek(ken) in de bewaarde berichten overgeslagen.");
	}

	const over = bruikbaar.slice(-NIEUWE_BERICHTEN_LIMIET);
	if (over.length < bruikbaar.length) {
		console.warn("[Berichtenbox] " + (bruikbaar.length - over.length) + " bewaard(e) bericht(en) boven de limiet van " + NIEUWE_BERICHTEN_LIMIET + " weggelaten.");
	}

	return over;
}

function lees(opslag) {
	try {
		const rauw = opslag.getItem(LS_KEY);
		if (!rauw) return { waarden: defaults(), onleesbaar: false };

		const ontleed = JSON.parse(rauw);
		if (!ontleed || typeof ontleed !== "object" || Array.isArray(ontleed)) {
			throw new Error("state is geen object");
		}

		const samen = { ...defaults(), ...ontleed };

		// Normaliseer types, zodat opslaan en renderen niet kunnen struikelen over een sleutel die
		// door een oudere versie of met de hand een andere vorm heeft gekregen.
		if (!Array.isArray(samen.nieuweBerichten)) samen.nieuweBerichten = [];
		samen.nieuweBerichten = opschonen(samen.nieuweBerichten);

		if (!Array.isArray(samen.eigenMappen)) samen.eigenMappen = [];
		SLEUTELS_MET_OBJECT.forEach((sleutel) => {
			const waarde = samen[sleutel];
			if (!waarde || typeof waarde !== "object" || Array.isArray(waarde)) samen[sleutel] = {};
		});

		return { waarden: samen, onleesbaar: false };
	} catch (fout) {
		// Onleesbaar is iets anders dan leeg. Doorgaan met een lege state mag, maar hem wegschrijven
		// niet: dan is wat de bezoeker had gearchiveerd, weggegooid of in mappen gezet onherstelbaar
		// verdwenen in plaats van tijdelijk onbereikbaar.
		console.error("[Berichtenbox] Bewaarde state onleesbaar; er wordt niets overheen geschreven.", fout);
		return { waarden: defaults(), onleesbaar: true };
	}
}

/**
 * @param opslag  Iets met getItem/setItem — in de browser `localStorage`.
 *
 * Filtert bewust nog niet op magazijn: bij het inlezen is nog niet bekend welke bron gekozen wordt,
 * en wegfilteren tegen de verkeerde lijst is onomkeerbaar. Dat gebeurt in `beperkTot`, zodra de
 * bron vaststaat.
 */
/**
 * @param opslag   localStorage of iets met dezelfde vorm.
 * @param persona  De actieve persona. Hoort de bewaarde staat bij iemand anders, dan begint die
 *                 leeg — met één uitzondering: onleesbare opslag blijft onleesbaar, want daar
 *                 overheen schrijven maakt van "niet te lezen" onherstelbaar "weg".
 */
export function maakState(opslag, persona = null) {
	// Waarom het bewaren de laatste keer misging: "vol" of "geweigerd" (privénavigatie, opslag uit).
	let laatsteFout = null;

	let { waarden: ruw, onleesbaar } = lees(opslag);

	// Een staat zonder persona komt uit een oudere versie: van wie die was, is niet meer te zeggen.
	// Bij een bekende persona gaat hij daarom weg. Draait er geen personas.js — dan is de actieve
	// persona null — dan valt er niets te verwarren en blijft hij staan.
	const vanWie = ruw.persona ?? null;
	const nu = persona ?? null;

	if (!onleesbaar && vanWie !== nu) {
		if (vanWie !== null) {
			console.info("[Berichtenbox] Bewaarde staat hoort bij '" + vanWie + "'; die van '" + nu + "' begint leeg.");
		}
		ruw = defaults();
	}
	ruw.persona = nu;

	return {
		ruw,

		/** Er stond iets, maar het was niet te lezen. De aanroeper hoort dat te melden. */
		onleesbaar,

		/** "vol" of "geweigerd", of null als bewaren nog niet misging. */
		waaromNietBewaard() {
			return onleesbaar ? "onleesbaar" : laatsteFout;
		},

		statusVan(berichtId) {
			if (ruw.verwijderd[berichtId]) return "prullenbak";
			if (ruw.gearchiveerd[berichtId]) return "archief";
			return "inbox";
		},

		isOngelezen(berichtId, origineelOngelezen) {
			if (ruw.ongelezenToegevoegd[berichtId]) return true;
			if (ruw.gelezen[berichtId]) return false;
			return origineelOngelezen;
		},

		mapVan(berichtId, origineleMap) {
			if (berichtId in ruw.mapOverride) return ruw.mapOverride[berichtId];
			return origineleMap;
		},

		isGemarkeerd(berichtId, origineelGemarkeerd) {
			if (berichtId in ruw.gemarkeerd) return !!ruw.gemarkeerd[berichtId];
			return !!origineelGemarkeerd;
		},

		/**
		 * De magazijnen van de actieve bron. Berichten van een magazijn dat die bron niet kent,
		 * horen niet op het scherm en dus ook niet in de bewaarde lijst.
		 */
		beperkTot(bekendeMagazijnIds) {
			const bekend = new Set(bekendeMagazijnIds);
			const voor = ruw.nieuweBerichten.length;
			ruw.nieuweBerichten = ruw.nieuweBerichten.filter((bericht) => bekend.has(bericht.magazijnId));

			if (ruw.nieuweBerichten.length < voor) {
				console.warn("[Berichtenbox] " + (voor - ruw.nieuweBerichten.length) + " bewaard(e) bericht(en) horen bij een magazijn dat de actieve bron niet kent; niet teruggezet.");
			}
		},

		/** Geeft terug of het bewaren lukte. */
		bewaar() {
			// Overschrijven maakt van "niet te lezen" onherstelbaar "weg".
			if (onleesbaar) return false;

			if (ruw.nieuweBerichten.length > NIEUWE_BERICHTEN_LIMIET) {
				ruw.nieuweBerichten = ruw.nieuweBerichten.slice(-NIEUWE_BERICHTEN_LIMIET);
			}
			try {
				opslag.setItem(LS_KEY, JSON.stringify(ruw));
				return true;
			} catch (fout) {
				// De aanroeper moet weten dat er niets bewaard is: anders ziet de bezoeker een rij
				// verdwijnen die na het verversen gewoon weer terugstaat. En wát er misging scheelt
				// voor wat hij eraan kan doen — ruimte vrijmaken kan, privénavigatie uitzetten ook,
				// maar het advies moet wel bij de oorzaak passen.
				console.error("[Berichtenbox] Kon state niet opslaan.", fout);
				laatsteFout = fout && fout.name === "QuotaExceededError" ? "vol" : "geweigerd";
				return false;
			}
		},
	};
}
