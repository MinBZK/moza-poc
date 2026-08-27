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

function lees(opslag, bekendeMagazijnIds) {
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
		const bekend = new Set(bekendeMagazijnIds);
		samen.nieuweBerichten = samen.nieuweBerichten
			.filter((bericht) => bericht && bekend.has(bericht.magazijnId))
			.slice(-NIEUWE_BERICHTEN_LIMIET);

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
 * @param bekendeMagazijnIds  De magazijnen die de actieve bron kent. Berichten van een magazijn
 *        dat er niet meer is, horen niet uit de opslag terug te komen.
 */
export function maakState(opslag, bekendeMagazijnIds = []) {
	const ruw = lees(opslag, bekendeMagazijnIds);

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

		bewaar() {
			if (ruw.nieuweBerichten.length > NIEUWE_BERICHTEN_LIMIET) {
				ruw.nieuweBerichten = ruw.nieuweBerichten.slice(-NIEUWE_BERICHTEN_LIMIET);
			}
			try {
				opslag.setItem(LS_KEY, JSON.stringify(ruw));
			} catch (fout) {
				// QuotaExceededError of SecurityError (Safari private mode): de demo mag doordraaien,
				// alleen onthoudt hij deze sessie niets.
				console.error("[Berichtenbox] Kon state niet opslaan.", fout);
			}
		},
	};
}
