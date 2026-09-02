import { vi } from "vitest";

/**
 * Minimale berichtenbox-pagina voor de render-tests.
 *
 * Volgt de echte templates zo precies als de tests nodig hebben. Waar die van elkaar verschillen —
 * de inbox pagineert en heeft een acties-kolom, archief en prullenbak niet — verschilt deze
 * fixture mee: een test die op de inbox slaagt maar op archief zou breken, hoort hier ook te breken.
 *
 * De tbody is leeg, net als in `moza/berichtenbox.html`. De rijen komen uit de datalaag; ook de
 * inbox rendert er geen meer vooraf. Wie geen JavaScript heeft krijgt het `<noscript>`-blok, want
 * een berichtenbox die zijn berichten bij verschillende organisaties ophaalt heeft niets om
 * synchroon te tonen.
 */

const KOPPEN_INBOX = `
			<tr>
				<th class="berichtenbox-row-mark" scope="col"><span class="visually-hidden">Gemarkeerd</span></th>
				<th scope="col" aria-sort="none"><button class="berichtenbox-sort" type="button" data-sort="afzender">Afzender</button></th>
				<th scope="col" aria-sort="none"><button class="berichtenbox-sort" type="button" data-sort="onderwerp">Onderwerp</button></th>
				<th scope="col" aria-sort="none"><button class="berichtenbox-sort" type="button" data-sort="datum">Datum</button></th>
				<th scope="col"><span class="visually-hidden">Bijlage</span></th>
				<th class="berichtenbox-actions-th" scope="col"><span class="visually-hidden">Acties</span></th>
			</tr>`;

const KOPPEN_OVERIG = `
			<tr>
				<th scope="col"><span class="visually-hidden">Gemarkeerd</span></th>
				<th scope="col" aria-sort="none"><button class="berichtenbox-sort" type="button" data-sort="afzender">Afzender</button></th>
				<th scope="col" aria-sort="none"><button class="berichtenbox-sort" type="button" data-sort="onderwerp">Onderwerp</button></th>
				<th scope="col" aria-sort="none"><button class="berichtenbox-sort" type="button" data-sort="datum">Datum</button></th>
				<th scope="col"><span class="visually-hidden">Bijlage</span></th>
			</tr>`;

// Alleen de inbox heeft de blokken van de gesimuleerde bronuitval; archief en prullenbak niet.
const MELDINGEN_INBOX = `
	<div class="feedback feedback-warning" hidden data-bron-onbereikbaar role="status">
		<div>
			<p>De <b>RDW</b> is momenteel niet bereikbaar. Berichten van overige overheidsorganisaties staan hieronder.</p>
			<p><button class="link-button" type="button" data-bron-retry>RDW opnieuw proberen</button></p>
		</div>
	</div>

	<div class="feedback feedback-warning" hidden data-bron-uitval role="status">
		<div>
			<p data-bron-uitval-tekst><b data-bron-uitval-naam></b> is zojuist onbereikbaar geworden.</p>
			<p><button class="link-button" type="button" data-bron-retry>Opnieuw proberen</button></p>
		</div>
	</div>

	<div class="feedback feedback-error" hidden data-geen-bronnen role="status">
		<div>
			<p>Er gaat iets mis met het ophalen van berichten bij de verschillende bronnen. Probeer het later opnieuw.</p>
			<p><button class="link-button" type="button" data-bron-retry>Opnieuw proberen</button></p>
		</div>
	</div>`;

// Het blok voor een echte storing staat op elke berichtenbox-pagina.
// Twee pictogrammen, in dezelfde volgorde als de templates: berichtenbox.js wisselt ze om.
const STORING = `
	<div class="feedback feedback-error" hidden data-berichtenbox-storing role="status">
		<svg data-icoon="storing"><circle cx="12" cy="12" r="10.5" /></svg>
		<svg data-icoon="info"><path d="M0 0h1v1H0z" /></svg>
		<div><p data-berichtenbox-storing-tekst></p></div>
	</div>`;

function paginaHtml(berichten, view, { orgSchakelaar = false } = {}) {
	const inbox = view === "inbox";
	// Leeg en verborgen, net als in de templates: bij het bouwen is niet te weten welke persona er
	// kijkt, dus staat er geen getal in de HTML. De render-laag vult ze en maakt de regel zichtbaar.
	// Ze hier wél invullen verborg dat verschil — en daarmee ook of de render-laag ze echt schrijft.
	// Geen enkele weergave server-rendert nog rijen.
	const rijen = "";
	const lijstAttr = inbox ? ' data-page-size="10"' : ` data-berichtenbox-view="${view}"`;
	const pagnav = inbox ? '\n\t<nav class="pagination" data-berichtenbox-pagination hidden aria-label="Paginering"></nav>' : "";

	return `
<article class="berichtenbox">
<div class="berichtenbox-content">
	<p class="metadata" hidden data-berichtenbox-tellers>
		<b data-berichtenbox-counter-total></b> berichten uit
		<b data-berichtenbox-sources></b>
		<span data-meervoud="data-berichtenbox-sources" data-ev="bron" data-mv="bronnen">bronnen</span>,
		<b data-berichtenbox-counter-unread></b> ongelezen
	</p>
	<nav><a href="#"><span class="badge" data-berichtenbox-count="inbox"></span></a></nav>
	{/* Het bolletje uit het menu, dat op élke pagina staat. Zonder dit hier bleef ongetoetst of
	   het een onthouden getal toont op een pagina die het echte zo berekent. */}
	<nav class="side-nav"><a href="#">Berichtenbox<span class="badge" data-berichtenbox-count="ongelezen"></span></a></nav>
${inbox ? MELDINGEN_INBOX : ""}
${STORING}

	<div class="berichtenbox-search">
		<label for="search-berichtenbox">Filter berichten</label>
		<input id="search-berichtenbox" type="search" data-berichtenbox-search-input />
	</div>
	${orgSchakelaar ? '<label><input type="checkbox" data-berichtenbox-org-toggle /> Ook andere organisaties</label>' : ""}

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

	${inbox ? '<div class="visually-hidden" data-berichtenbox-live aria-live="polite"></div>' : ""}

	<!-- Zoals de echte templates: op de inbox verborgen, op archief en prullenbak zichtbaar,
	     want zonder JavaScript zijn die pagina's werkelijk leeg. -->
	<div class="feedback"${inbox ? " hidden" : ""} data-berichtenbox-empty>Er zijn geen berichten om te tonen.</div>

	<table data-berichtenbox-list${lijstAttr}>
		<thead>${inbox ? KOPPEN_INBOX : KOPPEN_OVERIG}
		</thead>
		<tbody>${rijen}
		</tbody>
	</table>
${pagnav}
</div>
</article>
`;
}

// berichtenbox.js bindt gedelegeerde handlers op `document`. Die overleven het vervangen van
// document.body, dus zonder opruimen stapelen ze zich op over herladingen heen: één klik werd dan
// twee keer afgehandeld en een markering sloeg meteen weer om. Alleen zichtbaar in de tests —
// een echte pagina laadt het script één keer — maar het maakt elke test na de eerste onbetrouwbaar.
const documentListeners = [];
const echteAddEventListener = document.addEventListener.bind(document);

document.addEventListener = (type, handler, opties) => {
	documentListeners.push([type, handler, opties]);
	echteAddEventListener(type, handler, opties);
};

function ruimDocumentListenersOp() {
	while (documentListeners.length) {
		const [type, handler, opties] = documentListeners.pop();
		document.removeEventListener(type, handler, opties);
	}
}

/**
 * Een berichtdetailpagina, zoals `moza/berichtenbox/bericht.njk` die rendert.
 *
 * Zonder deze fixture bleven twee kritieke fouten drie reviewrondes lang onzichtbaar: de
 * detailpagina had helemaal geen meldingsblok, en archiveren navigeerde over zijn eigen
 * mislukking heen weg.
 */
function detailHtml(bericht, { metStoringsblok = true } = {}) {
	const storing = metStoringsblok ? STORING + '\n\t<div class="visually-hidden" data-berichtenbox-live aria-live="polite"></div>' : "";

	return `
<article class="berichtenbox">
	<nav class="breadcrumb">
		<ol>
			<li><a href="/moza/">Home</a></li>
			<li><a href="/moza/berichtenbox/">Berichtenbox</a></li>
			<li data-berichtenbox-map-kruimel><a href="/moza/berichtenbox/">Inbox</a></li>
			<li aria-current="page">${bericht.onderwerp}</li>
		</ol>
	</nav>
	<section class="berichtenbox-content" data-bericht-id="${bericht.id}" data-afzender-id="${bericht.magazijnId}" data-afzender-naam="${bericht.afzender}">
		<h1 class="h3">${bericht.onderwerp}</h1>
${storing}
		<p class="berichtenbox-detail-meta">${bericht.afzender}</p>

		<!-- Staat in de echte template en ontbrak hier. Daardoor keerde werkBerichtBeschikbaarheidBij
		     meteen af en bleef een crash op die weg ongezien. -->
		<div class="feedback feedback-warning" hidden data-bericht-onbeschikbaar role="status">
			<div>
				<p><b data-bron-uitval-naam></b> is momenteel niet bereikbaar.</p>
				<p><button class="link-button" type="button" data-bericht-retry>Opnieuw proberen</button></p>
			</div>
		</div>

		<div class="berichtenbox-detail-body"><p>${bericht.inhoud}</p></div>
		<div class="action-options">
			<button class="icon-button" data-actie="markeren" aria-pressed="false">Markeren</button>
			<button class="icon-button" data-actie="markeer-ongelezen"><svg></svg>Markeer als ongelezen</button>
			<button class="icon-button" data-actie="archiveren">Archiveren</button>
			<button class="icon-button" data-actie="verwijderen">Verwijderen</button>
		</div>
	</section>
</article>
`;
}

/** Zet een detailpagina neer voor dit bericht. */
export function bouwDetailPagina(bericht, opties = {}) {
	ruimDocumentListenersOp();
	document.body.innerHTML = detailHtml(bericht, opties);
	window.history.replaceState(null, "", "/moza/berichtenbox/bericht/" + bericht.id + "/");
	window.berichtenboxData = dataset([bericht]);
	window.localStorage.clear();
	window.localStorage.setItem("berichtenbox", JSON.stringify({ eersteBezoekGehad: true, ...(opties.state || {}) }));
	return document;
}

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
	const bruikbaar = berichten.filter((b) => b && b.magazijnId);
	const magazijnIds = [...new Set(bruikbaar.map((b) => b.magazijnId))];

	return {
		berichten,
		magazijnen: magazijnIds.map((id) => ({
			id,
			naam: bruikbaar.find((b) => b.magazijnId === id).afzender,
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
export function bouwPagina(berichten, { pad = "/moza/berichtenbox/", view = "inbox", state = {}, orgSchakelaar = false } = {}) {
	ruimDocumentListenersOp();
	document.body.innerHTML = paginaHtml(berichten, view, { orgSchakelaar });
	window.history.replaceState(null, "", pad);
	window.berichtenboxData = dataset(berichten);
	window.localStorage.clear();
	window.localStorage.setItem("berichtenbox", JSON.stringify({ eersteBezoekGehad: true, ...state }));
	return document;
}

let laadTeller = 0;

/** Laadt berichtenbox.js opnieuw, zodat de IIFE tegen de zojuist gebouwde pagina draait. */
export async function laadBerichtenbox() {
	vi.resetModules();
	// Cache-buster in de specifier: de IIFE draait alleen bij een verse import.
	await import("../../assets/javascript/berichtenbox.js?n=" + (laadTeller += 1));
}

/** Laat de microtask-wachtrij leeglopen, zodat het laden van de bron afgerond is. */
export async function laatLaden() {
	for (let i = 0; i < 10; i += 1) await Promise.resolve();
	await new Promise((klaar) => setTimeout(klaar, 0));
}

export function rijen() {
	return [...document.querySelectorAll(".berichtenbox-row")];
}

export function tekstVan(kiezer) {
	const el = document.querySelector(kiezer);
	return el ? el.textContent.trim() : null;
}

/** Koppen tegenover cellen, om te controleren dat een rij niet scheef staat. */
export function kolommen() {
	const lijst = document.querySelector("[data-berichtenbox-list]");
	const eersteRij = document.querySelector(".berichtenbox-row");
	return {
		koppen: lijst.tHead.querySelectorAll("th").length,
		cellen: eersteRij ? eersteRij.querySelectorAll("td").length : 0,
	};
}

/**
 * De generieke demo-detailpagina (`bericht-demo.html`), waar een bericht uit het stelsel op belandt.
 *
 * Die berichten hebben geen server-gerenderde detailpagina: die worden bij de build uit de dataset
 * gegenereerd, en een bericht uit de keten zit daar niet in. Alleen de elementen die de render-laag
 * aanraakt staan hier; de rest van de pagina doet er voor deze tests niet toe.
 */
export function bouwDemoDetailPagina(bericht, { berichten = [bericht] } = {}) {
	ruimDocumentListenersOp();
	// De `.berichtenbox`-wrapper is geen opmaak maar een schakelaar: zonder die klasse stopt de
	// hele IIFE na het markeer-gedeelte, en dan gebeurt er op deze pagina niets.
	document.body.innerHTML = `
		<article id="hoofd-inhoud" class="berichtenbox">
		<div class="feedback feedback-error" hidden data-berichtenbox-storing role="status">
			<p data-berichtenbox-storing-tekst></p>
		</div>
		<section class="berichtenbox-content" data-demo-detail>
			<h1 data-demo-onderwerp class="h3"></h1>
			<p class="metadata" data-demo-meta></p>
			<div class="berichtenbox-detail-body" data-demo-body></div>
			<p class="visually-hidden" data-demo-inhoud-status role="status"></p>
			<p class="variant-c-only" data-nagebootst><a href="/assets/documents/voorbeeld-bijlage.pdf">Open origineel bericht</a></p>
			{/* De PDF-viewer met zijn download-links, zoals bericht-demo.html die heeft. Zonder dit
			    bleef ongetoetst of een keten-bijlage dezelfde weergave krijgt als een uit de dataset. */}
			<div class="berichtenbox-detail-pdf">
				<div class="feedback-progress" data-pdf-laden hidden></div>
				<div class="pdf-reveal"><object data-berichtenbox-attachments-preview type="application/pdf" hidden></object></div>
				<ul class="list-indent">
					<li><a href="#" data-berichtenbox-pdf-download download hidden>Download PDF</a></li>
					<li><a href="#" data-berichtenbox-tekst-download download hidden>Lees tekst-versie</a></li>
				</ul>
			</div>
			<section class="berichtenbox-attachments" data-berichtenbox-attachments hidden>
				<p class="berichtenbox-attachments-loading" data-berichtenbox-attachments-loading></p>
				<ul class="list-indent" data-berichtenbox-attachments-list hidden></ul>
			</section>
		</section>
		<div class="berichtenbox-empty" data-demo-niet-gevonden hidden>
			<p>Dit bericht kon niet worden gevonden. Mogelijk is het verwijderd.</p>
			<p><a href="/moza/berichtenbox/" class="btn-cta">Terug naar Berichtenbox</a></p>
		</div>
		</article>
	`;
	window.history.replaceState(null, "", "/moza/berichtenbox/bericht-demo/?id=" + encodeURIComponent(bericht.id));
	window.berichtenboxData = dataset(berichten);
	window.localStorage.clear();
	window.localStorage.setItem("berichtenbox", JSON.stringify({ eersteBezoekGehad: true }));
	return document;
}
