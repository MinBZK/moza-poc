/**
 * De gegenereerde dataset als berichtenbron.
 *
 * Deze bron is altijd van toepassing en hoort daarom achteraan in het register: hij vangt op wat
 * geen andere bron opeist. `window.berichtenboxData` wordt door Eleventy in de pagina gezet; de
 * kopieën hieronder zorgen dat de render-laag de dataset niet muteert.
 *
 * Het federatieve gedrag is hier gesimuleerd: er druppelen na verloop van tijd berichten binnen,
 * alsof een magazijn later antwoordt. Dat gedrag hoort bij déze bron. Een echte bron doet het echt
 * of doet het niet, en dan hoeft de render-laag geen vlag te kennen om te weten of ze met
 * nagebootste of met echte federatie te maken heeft.
 *
 * Nog niet verhuisd: de voortgangsanimatie bij het eerste bezoek en de gesimuleerde bronuitval.
 * Die zitten diep in de render-laag verweven (org-filter, unhappy-flow-scenario's, sessionStorage
 * gedeeld met de detailpagina) en horen in een eigen stap hierheen te komen.
 */

/** Minimale tussenpoos, ook als ?poll= een lagere waarde meegeeft. */
const POLL_MIN_SEC = 5;
const POLL_STANDAARD_SEC = 60;

const ONDERWERPEN = [
	"Nieuw bericht ontvangen",
	"Bevestiging ontvangst",
	"Bericht beschikbaar",
	"Actie mogelijk vereist",
];

/** Staat de feature-flag "Dynamische berichten" aan? Standaard uit. */
function dynamischeBerichtenAan() {
	try {
		return localStorage.getItem("feature:Dynamische berichten") === "true";
	} catch (fout) {
		console.warn("[Berichtenbox] Vlag 'Dynamische berichten' niet leesbaar; behandeld als uit.", fout);
		return false;
	}
}

function tussenpoos() {
	const gevraagd = parseInt(new URLSearchParams(location.search).get("poll"), 10);
	const seconden = Number.isFinite(gevraagd) && gevraagd > 0 ? gevraagd : POLL_STANDAARD_SEC;
	return Math.max(seconden, POLL_MIN_SEC) * 1000;
}

/**
 * @param data   window.berichtenboxData
 * @param opties { state, limiet, magOphalen } — `state` om binnengekomen berichten te bewaren,
 *               `magOphalen` om te bepalen of polling op deze pagina zinnig is.
 */
export function datasetBron(data, { state, limiet = 5, magOphalen = () => true, meldStoring = () => {} } = {}) {
	let teller = 0;

	function nieuwBericht(magazijnen) {
		teller += 1;
		const magazijn = magazijnen[Math.floor(Math.random() * magazijnen.length)];

		return {
			id: "msg-live-" + Date.now() + "-" + teller,
			magazijnId: magazijn.id,
			afzender: magazijn.naam,
			onderwerp: ONDERWERPEN[Math.floor(Math.random() * ONDERWERPEN.length)],
			inhoud: "Dit is een demo-bericht van " + magazijn.naam + ".",
			datum: new Date().toISOString().slice(0, 10),
			isOngelezen: true,
			map: null,
			heeftBijlage: Math.random() < 0.3,
		};
	}

	return {
		naam: "dataset",

		// De dataset is er altijd; wie hier komt, komt nergens anders terecht.
		geldtVoor: async () => true,

		/**
		 * De dataset, met daarvoor de berichten die in een eerdere sessie zijn binnengedruppeld.
		 * Staat de flag uit — de standaard — dan worden die juist opgeruimd, zodat een eerder
		 * binnengekomen "Dit is een demo-bericht" niet blijft rondslingeren.
		 */
		laad: async () => {
			let eerderBinnengekomen = [];

			if (state) {
				if (!dynamischeBerichtenAan()) {
					if (state.ruw.nieuweBerichten.length > 0) {
						const bewaard = state.ruw.nieuweBerichten;
						state.ruw.nieuweBerichten = [];
						if (!state.bewaar()) {
							// Alleen uit het geheugen halen terwijl de opslag ze houdt, laat ze na het
							// verversen onaangekondigd terugkomen.
							state.ruw.nieuweBerichten = bewaard;
							meldStoring("Wij konden eerder ontvangen demo-berichten niet opruimen. Ze staan er na het verversen van de pagina weer.", "info");
						}
					}
				} else {
					eerderBinnengekomen = state.ruw.nieuweBerichten.slice().reverse();
				}
			}

			const uitDataset = (data.berichten || []);
			const magazijnen = (data.magazijnen || []).slice();
			const bekendeIds = new Set(uitDataset.map((bericht) => bericht.id));
			const bekendeMagazijnen = new Set(magazijnen.map((magazijn) => magazijn.id));

			const terug = eerderBinnengekomen.filter(
				(bericht) => !bekendeIds.has(bericht.id) && bekendeMagazijnen.has(bericht.magazijnId)
			);

			return {
				berichten: [...terug, ...uitDataset],
				magazijnen,
				mappen: (data.mappen || []).slice(),
			};
		},

		/**
		 * Laat na het laden af en toe een bericht binnenkomen, en meldt de nieuwe lijst. De
		 * render-laag ziet dat als een gewone bronwijziging en hoeft niets van polling te weten.
		 */
		start(meld) {
			// De vlag staat aan omdat iemand wil zien dat er berichten binnenkomen. Gebeurt dat niet
			// meer, dan hoort dat gezegd te worden en niet alleen in de console te staan.
			// De render-laag beslist waar dit terechtkomt; deze module kent de pagina niet. `soort`
			// scheidt een mededeling van een storing: de demo die uitgespeeld raakt is geen fout.
			const meldStilstand = meldStoring;

			if (!dynamischeBerichtenAan()) return;
			if (!magOphalen()) return;

			const magazijnen = (data.magazijnen || []);
			if (!magazijnen.length) {
				console.warn("[Berichtenbox] Geen magazijnen; er kunnen geen demo-berichten binnenkomen.");
				meldStilstand("Er zijn geen bronnen om berichten van te ontvangen.", "info");
				return;
			}

			const klok = setInterval(() => {
				try {
					if (!state) {
						console.warn("[Berichtenbox] Geen state; binnenkomende demo-berichten gestopt.");
						clearInterval(klok);
						return;
					}

					// De demo is uitgespeeld. Blijven tikken zonder iets te doen laat de bezoeker in
					// het ongewisse of er nog iets komt.
					if (state.ruw.nieuweBerichten.length >= limiet) {
						clearInterval(klok);
						meldStilstand("Alle demo-berichten zijn binnengekomen.", "info");
						return;
					}

					const bericht = nieuwBericht(magazijnen);
					state.ruw.nieuweBerichten.push(bericht);

					// Een bericht tonen dat nergens bewaard is, is erger dan er geen meer laten komen:
					// na het verversen is het spoorloos en niemand weet waarom.
					if (!state.bewaar()) {
						state.ruw.nieuweBerichten.pop();
						console.error("[Berichtenbox] Binnengekomen bericht kon niet bewaard worden; gestopt.");
						clearInterval(klok);
						meldStilstand("Uw browser kan nieuwe berichten niet bewaren; er komen er geen meer bij.");
						return;
					}

					// Alleen het nieuwe bericht melden, niet de hele lijst: de render-laag heeft de
					// zijne misschien gesorteerd, en die volgorde hoort niet verloren te gaan.
					const mislukt = meld({ nieuwBericht: bericht });

					// Komt het bericht niet op het scherm, dan heeft doorgaan geen zin: dan stapelt
					// zich in stilte een voorraad op die de bezoeker pas na herladen ineens ziet.
					if (mislukt && mislukt.length) {
						console.error("[Berichtenbox] Nieuw bericht kon niet getoond worden; er komen er geen meer bij.");
						clearInterval(klok);
						meldStilstand("Wij konden een nieuw bericht niet tonen. Ververs de pagina.");
					}
				} catch (fout) {
					// Bij corrupte state zou elke tick opnieuw gooien; stoppen scheelt console-spam.
					console.error("[Berichtenbox] Binnenkomende demo-berichten gestopt door een fout.", fout);
					clearInterval(klok);
					meldStilstand("Er komen geen nieuwe berichten meer binnen. Ververs de pagina.");
				}
			}, tussenpoos());
		},
	};
}
