function zichtbareRijen() {
	return [...document.querySelectorAll(".berichtenbox-row")]
		.filter((rij) => !rij.hidden && !rij.closest("[hidden]"))
		.map((rij) => ({
			id: rij.dataset.berichtId || null,
			afzender: tekst(rij, ".berichtenbox-row-sender"),
			onderwerp: tekst(rij, ".berichtenbox-row-subject"),
			datum: tekst(rij, ".berichtenbox-row-date"),
			ongelezen: rij.classList.contains("is-unread"),
			cellen: rij.querySelectorAll("td").length,
		}));
}

function tekst(wortel, selector) {
	const el = wortel.querySelector(selector);
	return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
}

function zichtbaar(selector) {
	const el = document.querySelector(selector);
	if (!el) return null;
	return el.hidden || el.closest("[hidden]") ? null : el.textContent.replace(/\s+/g, " ").trim();
}

export function beeld() {
	const koppen = document.querySelectorAll(".berichtenbox thead th").length;
	return {
		rijen: zichtbareRijen(),
		aantalRijen: zichtbareRijen().length,
		kolomkoppen: koppen,
		totaal: tekst(document, "[data-berichtenbox-counter-total]"),
		bronnen: tekst(document, "[data-berichtenbox-sources]"),
		ongelezen: tekst(document, "[data-berichtenbox-counter-unread]"),
		legeStaat: zichtbaar("[data-berichtenbox-empty]"),
		storing: zichtbaar("[data-berichtenbox-storing]"),
		paginanav: [...document.querySelectorAll("[data-berichtenbox-pagination] a, [data-berichtenbox-pagination] button")]
			.filter((el) => !el.closest("[hidden]"))
			.map((el) => el.textContent.trim()),
	};
}

