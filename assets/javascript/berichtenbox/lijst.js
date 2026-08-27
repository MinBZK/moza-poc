/**
 * De lijst-query: welke berichten hoort de bezoeker nu te zien, in welke volgorde, op welke pagina.
 *
 * Puur rekenwerk over een array berichten. Geen DOM, geen opslag, geen kennis van persona's,
 * organisatiefilters of de unhappy flow — die komen als functie binnen (`magazijnToegestaan`,
 * `persoonRelevant`), zodat deze module niets hoeft te weten van waar die regels vandaan komen.
 *
 * Voorheen deed `pasFilterToe` dit door door de DOM-rijen te lopen en per rij het bericht terug te
 * zoeken. Daardoor waren de rijen een tweede waarheid naast de berichten, en moest elke bronwissel
 * die twee gelijk houden.
 */

/**
 * @param berichten  De berichten van de actieve bron.
 * @param criteria   { view, zoek, afzenders, map, magazijnToegestaan, persoonRelevant, state }
 * @returns De berichten die aan alle criteria voldoen, in de volgorde waarin ze binnenkwamen.
 */
export function filterBerichten(berichten, criteria) {
	const {
		view = "inbox",
		zoek = "",
		afzenders = new Set(),
		map = null,
		magazijnToegestaan = () => true,
		persoonRelevant = () => true,
		state,
	} = criteria || {};

	const zoekterm = String(zoek).trim().toLowerCase();

	return berichten.filter((bericht) => {
		if (!bericht) return false;

		// Zelfde volgorde als voorheen: eerst waar het bericht thuishoort, dan of het getoond mag
		// worden, dan pas wat de bezoeker heeft ingetypt of aangevinkt.
		if (state.statusVan(bericht.id) !== view) return false;
		if (!magazijnToegestaan(bericht.magazijnId)) return false;
		if (!persoonRelevant(bericht)) return false;

		if (zoekterm) {
			const tekst = ((bericht.afzender || "") + " " + (bericht.onderwerp || "")).toLowerCase();
			if (!tekst.includes(zoekterm)) return false;
		}

		if (afzenders.size > 0 && !afzenders.has(bericht.magazijnId)) return false;

		if (map && state.mapVan(bericht.id, bericht.map) !== map) return false;

		return true;
	});
}

/**
 * Sorteert op één veld. Geeft een nieuwe array terug; de invoer blijft ongemoeid, zodat de
 * bronvolgorde herstelbaar blijft.
 */
export function sorteerBerichten(berichten, sleutel, oplopend) {
	const richting = oplopend ? 1 : -1;

	return berichten.slice().sort((a, b) =>
		richting * String((a && a[sleutel]) || "").localeCompare(String((b && b[sleutel]) || ""), "nl", { numeric: true })
	);
}

/**
 * Het venster van één pagina. `grootte` mag Infinity zijn: dan staat alles op één pagina.
 *
 * Een pagina buiten bereik zakt naar de dichtstbijzijnde bestaande pagina in plaats van een lege
 * lijst op te leveren — een gefilterde lijst is vaak korter dan de pagina waar de bezoeker stond.
 */
export function paginaVan(berichten, pagina, grootte) {
	if (!Number.isFinite(grootte) || grootte <= 0) {
		return { items: berichten.slice(), totaalPaginas: 1, pagina: 1 };
	}

	const totaalPaginas = Math.max(1, Math.ceil(berichten.length / grootte));
	let huidige = Number.isFinite(pagina) ? Math.trunc(pagina) : 1;
	if (huidige > totaalPaginas) huidige = totaalPaginas;
	if (huidige < 1) huidige = 1;

	const start = (huidige - 1) * grootte;

	return {
		items: berichten.slice(start, start + grootte),
		totaalPaginas,
		pagina: huidige,
	};
}
