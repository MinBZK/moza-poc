import { vi } from "vitest";

/**
 * Minimale berichtenbox-pagina voor de render-tests.
 *
 * Bevat alleen wat berichtenbox.js daadwerkelijk opzoekt: de lijst, de tellers, de meldingsblokken,
 * het voortgangsblok, het zoekveld en de paginanavigatie. De echte pagina staat in
 * `moza/berichtenbox.html`; wijkt die af, dan valt dat hier om als de selectors veranderen.
 */

export const BERICHTENBOX_HTML = `
<article class="berichtenbox">
<div class="berichtenbox-content">
	<p class="metadata">
		<b data-berichtenbox-counter-total>0</b> berichten uit
		<b data-berichtenbox-sources>0</b>
		<span data-meervoud="data-berichtenbox-sources" data-ev="bron" data-mv="bronnen">bronnen</span>,
		<b data-berichtenbox-counter-unread>0</b> ongelezen
	</p>

	<div class="feedback feedback-error" hidden data-geen-bronnen role="status">
		<div>
			<p data-geen-bronnen-tekst>Er gaat iets mis met het ophalen van berichten bij de verschillende bronnen. Probeer het later opnieuw.</p>
			<p><button class="link-button" type="button" data-bron-retry>Opnieuw proberen</button></p>
		</div>
	</div>

	<div class="feedback feedback-warning" hidden data-bron-uitval role="status">
		<div>
			<p data-bron-uitval-tekst><b data-bron-uitval-naam></b> is zojuist onbereikbaar geworden.</p>
			<p><button class="link-button" type="button" data-bron-retry>Opnieuw proberen</button></p>
		</div>
	</div>

	<div class="berichtenbox-search">
		<label for="search-berichtenbox">Filter berichten</label>
		<input id="search-berichtenbox" type="search" data-berichtenbox-search-input />
	</div>

	<div class="feedback-progress" data-berichtenbox-progress hidden role="status" aria-live="polite">
		<p class="metadata">
			<b data-berichtenbox-progress-source>0</b> van
			<b data-berichtenbox-progress-total>3</b>
			<span data-meervoud="data-berichtenbox-progress-total" data-ev="bron" data-mv="bronnen">bronnen</span>,
			<b data-berichtenbox-progress-found>0</b>
			<span data-meervoud="data-berichtenbox-progress-found" data-ev="bericht" data-mv="berichten">berichten</span> gevonden
		</p>
		<div class="progress-bar"><div class="progress-bar-fill" data-berichtenbox-progress-bar></div></div>
	</div>

	<div class="visually-hidden" data-berichtenbox-live aria-live="polite"></div>

	<div class="feedback" hidden data-berichtenbox-empty>Er zijn geen berichten om te tonen.</div>

	<table data-berichtenbox-list data-page-size="10">
		<thead>
			<tr>
				<th class="berichtenbox-row-mark" scope="col"><span class="visually-hidden">Gemarkeerd</span></th>
				<th scope="col" aria-sort="none"><button class="berichtenbox-sort" type="button" data-sort="afzender">Afzender</button></th>
				<th scope="col" aria-sort="none"><button class="berichtenbox-sort" type="button" data-sort="onderwerp">Onderwerp</button></th>
				<th scope="col" aria-sort="none"><button class="berichtenbox-sort" type="button" data-sort="datum">Datum</button></th>
				<th scope="col"><span class="visually-hidden">Bijlage</span></th>
				<th class="berichtenbox-actions-th" scope="col"><span class="visually-hidden">Acties</span></th>
			</tr>
		</thead>
		<tbody></tbody>
	</table>

	<nav class="pagination" data-berichtenbox-pagination hidden aria-label="Paginering"></nav>
</div>
</article>
`;

let teller = 0;

/** Eén bericht in de vorm die window.berichtenboxData levert. */
export function bericht(over = {}) {
	teller += 1;
	return {
		id: "msg-" + String(teller).padStart(4, "0"),
		magazijnId: "gemeente-utrecht",
		afzender: "Gemeente Utrecht",
		onderwerp: "Aanslag gemeentelijke belastingen",
		inhoud: "Eerste alinea.\n\nTweede alinea.",
		datum: "2026-02-12",
		isOngelezen: true,
		map: null,
		heeftBijlage: false,
		...over,
	};
}

export function dataset(berichten) {
	const magazijnIds = [...new Set(berichten.map((b) => b.magazijnId))];
	return {
		berichten,
		magazijnen: magazijnIds.map((id) => ({
			id,
			naam: berichten.find((b) => b.magazijnId === id).afzender,
			type: "instantie",
		})),
		mappen: [{ naam: "Belastingen 2025", slug: "belastingen-2025" }],
		aantalMagazijnen: magazijnIds.length,
	};
}

/**
 * Zet een schone pagina neer met deze dataset.
 *
 * `state` gaat vóór het laden in localStorage. Standaard staat `eersteBezoekGehad` aan, zodat de
 * voortgangsanimatie van het eerste bezoek de lijst niet vier seconden verborgen houdt; een test
 * die juist dát gedrag wil, zet hem expliciet op false.
 */
export function bouwPagina(berichten, { pad = "/moza/berichtenbox/", state = {} } = {}) {
	document.body.innerHTML = BERICHTENBOX_HTML;
	window.history.replaceState(null, "", pad);
	window.berichtenboxData = dataset(berichten);
	window.localStorage.clear();
	window.localStorage.setItem("berichtenbox", JSON.stringify({ eersteBezoekGehad: true, ...state }));
	return document;
}

/** Laadt berichtenbox.js opnieuw, zodat de IIFE tegen de zojuist gebouwde pagina draait. */
export async function laadBerichtenbox() {
	vi.resetModules();
	// Cache-buster in de specifier: de IIFE draait alleen bij een verse import.
	await import("../../assets/javascript/berichtenbox.js?n=" + (laadTeller += 1));
}

let laadTeller = 0;

export function rijen() {
	return [...document.querySelectorAll(".berichtenbox-row")];
}

export function zichtbareRijen() {
	return rijen().filter((rij) => !rij.hidden);
}

export function tekstVan(kiezer) {
	const el = document.querySelector(kiezer);
	return el ? el.textContent.trim() : null;
}

/** Laat de microtask-wachtrij leeglopen, zodat het laden van de bron afgerond is. */
export async function laatLaden() {
	for (let i = 0; i < 10; i += 1) await Promise.resolve();
	await new Promise((klaar) => setTimeout(klaar, 0));
}
