/**
 * Datumnotatie volgens de schrijfwijzer: dag maandnaam jaar, maand voluit.
 *
 * "YYYY-MM-DD" wordt met de hand ontleed en niet via `new Date()`. Die laatste leest een kale
 * datum als UTC, waardoor een bericht van 1 maart in een westelijke tijdzone als 28 februari in
 * de lijst staat.
 */

const MAANDEN = [
	"januari", "februari", "maart", "april", "mei", "juni",
	"juli", "augustus", "september", "oktober", "november", "december",
];

function dagenIn(jaar, maand) {
	// Maand 2 is februari; new Date(jaar, maand, 0) geeft de laatste dag van die maand.
	return new Date(jaar, maand, 0).getDate();
}

export function datumNL(datumStr) {
	if (!datumStr) return "";

	const m = String(datumStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) {
		// Een bron die tijdstempels levert in plaats van datums zou anders elke rij "Onbekende
		// datum" geven zonder één spoor in de console.
		console.warn("[Berichtenbox] Datum '" + datumStr + "' heeft niet de vorm JJJJ-MM-DD.");
		return "Onbekende datum";
	}

	const jaar = parseInt(m[1], 10);
	const maand = parseInt(m[2], 10);
	const dag = parseInt(m[3], 10);

	if (maand < 1 || maand > 12 || dag < 1 || dag > dagenIn(jaar, maand)) {
		// Ook hier melden: "31 februari 2026" doorlaten zou een verzonnen datum als feit tonen.
		console.warn("[Berichtenbox] Datum '" + datumStr + "' bestaat niet.");
		return "Onbekende datum";
	}

	return dag + " " + MAANDEN[maand - 1] + " " + jaar;
}
