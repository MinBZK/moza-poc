/**
 * De berichtenbox-state: wat de bezoeker met zijn berichten heeft gedaan.
 *
 * Gelezen, gearchiveerd, verwijderd, gemarkeerd, verplaatst naar een map, plus de eigen mappen en
 * de berichten die via polling binnenkwamen. De bron levert de berichten; deze module levert wat
 * de bezoeker eraan veranderd heeft. De twee worden pas in de render-laag samengevoegd — vandaar
 * dat elke vraag hier het oorspronkelijke veld uit het bericht meekrijgt als tweede argument.
 *
 * Kent de dataset niet en raakt de DOM niet aan. `opslag` en `bekendeMagazijnIds` komen van buiten,
 * zodat dit zonder browser te testen is.
 *
 * Let op: dit is client-state. Het Federatief Berichtenstelsel is zelf eigenaar van leesstatus,
 * map en verwijdering (`PATCH`/`DELETE /berichten/{berichtId}`). Zolang die niet gebruikt worden,
 * blijft een markering op één browser staan. Zie het plan onder "Het contract van het stelsel".
 */

export const LS_KEY = "berichtenbox";

/** Meer dan dit aantal binnengedruppelde berichten bewaren heeft geen demo-waarde. */
export const NIEUWE_BERICHTEN_LIMIET = 5;

const SLEUTELS_MET_OBJECT = [
	"gelezen",
	"ongelezenToegevoegd",
	"gearchiveerd",
	"verwijderd",
	"gemarkeerd",
	"mapOverride",
];

function defaults() {
	return {
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
		console.warn(
			"[Berichtenbox] " + (bruikbaar.length - over.length) +
			" bewaard(e) bericht(en) boven de limiet van " + NIEUWE_BERICHTEN_LIMIET + " weggelaten."
		);
	}

	return over;
}

function lees(opslag) {
	try {
		const rauw = opslag.getItem(LS_KEY);
		if (!rauw) return defaults();

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

		return samen;
	} catch (fout) {
		console.warn("[Berichtenbox] State corrupt of niet toegankelijk; terugvallen op default.", fout);
		return defaults();
	}
}

/**
 * @param opslag  Iets met getItem/setItem — in de browser `localStorage`.
 *
 * Filtert bewust nog niet op magazijn: bij het inlezen is nog niet bekend welke bron gekozen wordt,
 * en wegfilteren tegen de verkeerde lijst is onomkeerbaar. Dat gebeurt in `beperkTot`, zodra de
 * bron vaststaat.
 */
export function maakState(opslag) {
	const ruw = lees(opslag);

	return {
		ruw,

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
				console.warn(
					"[Berichtenbox] " + (voor - ruw.nieuweBerichten.length) +
					" bewaard(e) bericht(en) horen bij een magazijn dat de actieve bron niet kent; niet teruggezet."
				);
			}
		},

		/** Geeft terug of het bewaren lukte. */
		bewaar() {
			if (ruw.nieuweBerichten.length > NIEUWE_BERICHTEN_LIMIET) {
				ruw.nieuweBerichten = ruw.nieuweBerichten.slice(-NIEUWE_BERICHTEN_LIMIET);
			}
			try {
				opslag.setItem(LS_KEY, JSON.stringify(ruw));
				return true;
			} catch (fout) {
				// QuotaExceededError of SecurityError (Safari private mode). De demo draait door, maar
				// de aanroeper moet weten dat er niets bewaard is: anders ziet de bezoeker een rij
				// verdwijnen die na het verversen gewoon weer terugstaat.
				console.error("[Berichtenbox] Kon state niet opslaan.", fout);
				return false;
			}
		},
	};
}
