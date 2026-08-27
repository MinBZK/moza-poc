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

export function datumNL(datumStr) {
	if (!datumStr) return "";

	const m = String(datumStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return "Onbekende datum";

	const maand = parseInt(m[2], 10);
	if (maand < 1 || maand > 12) return "Onbekende datum";

	return parseInt(m[3], 10) + " " + MAANDEN[maand - 1] + " " + parseInt(m[1], 10);
}
