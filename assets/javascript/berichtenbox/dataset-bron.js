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
 * Ook de ophaalanimatie bij het eerste bezoek hoort hier: die verzint aankomsttijden per bron en is
 * dus brongedrag, geen opmaak. Zij meldt zich langs dezelfde weg als de echte voortgang van het
 * stelsel — `volgVoortgang` — zodat de render-laag niet hoeft te weten of de getallen nagebootst
 * zijn of gemeten.
 *
 * Nog niet verhuisd: de gesimuleerde bronuitval. Die zit dieper in de render-laag verweven
 * (org-filter, unhappy-flow-scenario's, sessionStorage gedeeld met de detailpagina) en hoort in een
 * eigen stap hierheen te komen.
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
/**
 * @param opties.zichtbaarheid  Wat de bezoeker straks écht ziet: `statusVan`, `magazijnDoorOrgFilter`,
 *                              `magazijnToegestaan`, `persoonRelevant`. De animatie moet op díe
 *                              aantallen eindigen, anders telt zij naar iets anders toe dan er komt.
 * @param opties.magAnimeren    Of de ophaalanimatie hier op zijn plaats is. Dat weet de render-laag:
 *                              de inbox, pagina 1, eerste bezoek, geen mislukte lading.
 */
export function datasetBron(data, {
	state,
	limiet = 5,
	magOphalen = () => true,
	meldStoring = () => {},
	zichtbaarheid = {},
	magAnimeren = () => false,
} = {}) {
	let teller = 0;
	let voortgangKijker = null;

	function meldVoortgang(voortgang) {
		if (voortgangKijker) voortgangKijker(voortgang);
	}

	/**
	 * Bootst een ophaalronde na: elke bereikbare bron arriveert op zijn eigen moment, getrokken uit
	 * een zware-staart-verdeling (x⁴). De meeste bronnen antwoorden dus snel, de trage magazijnen
	 * druppelen tot laat in de rit binnen.
	 *
	 * Het org-filter telt mee: bij alleen de Belastingdienst is er één bron en het juiste aantal
	 * berichten. Bevraagd worden álle bronnen die dat filter toelaat, ook een onbereikbare — die
	 * arriveert nooit, dus de teller blijft steken op 11 van de 12. Dat is het punt van de nabootsing.
	 */
	function ophaalAnimatie(klaar) {
		const statusVan = zichtbaarheid.statusVan || (() => "inbox");
		const doorOrgFilter = zichtbaarheid.magazijnDoorOrgFilter || (() => true);
		const toegestaan = zichtbaarheid.magazijnToegestaan || (() => true);
		const relevant = zichtbaarheid.persoonRelevant || (() => true);

		const inInbox = (data.berichten || []).filter((bericht) => bericht && statusVan(bericht.id) === "inbox");
		const gezochteBronnen = new Set(inInbox.filter((b) => doorOrgFilter(b.magazijnId)).map((b) => b.magazijnId));
		const bereikteBerichten = inInbox.filter((b) => toegestaan(b.magazijnId) && relevant(b));
		const bereikteBronnen = new Set(bereikteBerichten.map((b) => b.magazijnId));

		const totaalBronnen = gezochteBronnen.size || 1;

		const tijden = (aantal) => {
			const uit = [];
			for (let i = 0; i < aantal; i += 1) uit.push(Math.pow(Math.random(), 4));
			return uit.sort((a, b) => a - b);
		};
		const bronTijden = tijden(bereikteBronnen.size);
		const berichtTijden = tijden(bereikteBerichten.length);

		// Bij één bron valt er weinig op te halen: korte animatie. Meer bronnen, langer.
		const duur = totaalBronnen <= 1 ? 1200 : 4000;
		const begin = Date.now();

		function aantalVoor(reeks, t) {
			// Binary search: hoeveel tijden liggen op of vóór t?
			let lo = 0;
			let hi = reeks.length;
			while (lo < hi) {
				const mid = (lo + hi) >>> 1;
				if (reeks[mid] <= t) lo = mid + 1; else hi = mid;
			}
			return lo;
		}

		const volgendeStap = typeof requestAnimationFrame === "function"
			? (fn) => requestAnimationFrame(fn)
			: (fn) => setTimeout(fn, 16);

		function stap() {
			const t = Math.min(1, (Date.now() - begin) / duur);
			meldVoortgang({
				bevraagd: totaalBronnen,
				klaar: aantalVoor(bronTijden, t),
				gevonden: aantalVoor(berichtTijden, t),
			});

			if (t < 1) {
				volgendeStap(stap);
				return;
			}

			// Null betekent: er valt niets meer te melden. De render-laag zet de lijst dan terug.
			meldVoortgang(null);
			klaar();
		}

		meldVoortgang({ bevraagd: totaalBronnen, klaar: 0, gevonden: 0 });
		volgendeStap(stap);
	}

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
		/** Zie bron.js: de render-laag abonneert zich hierop, vóór de bronkeuze. */
		volgVoortgang(kijker) {
			voortgangKijker = kijker;
		},

		/**
		 * Haalt opnieuw op, op verzoek van de bezoeker: na een hersteld magazijn, of nadat hij het
		 * organisatiefilter verruimde. Er valt bij de dataset niets écht op te halen, dus dit is de
		 * animatie nog een keer — maar de render-laag hoeft dat niet te weten.
		 */
		herhaalOphalen(klaar) {
			ophaalAnimatie(typeof klaar === "function" ? klaar : () => {});
		},

		start(meld) {
			// Eerst laten zien dat er opgehaald wordt, dan pas berichten laten binnendruppelen.
			if (magAnimeren()) {
				ophaalAnimatie(() => {
					if (state) {
						state.ruw.eersteBezoekGehad = true;
						// Stil: administratie van de animatie, niets wat de bezoeker vroeg. Lukt het
						// bewaren niet, dan speelt zij bij het volgende bezoek nog een keer af —
						// hinderlijk, maar geen reden om de bezoeker lastig te vallen.
						if (!state.bewaar()) {
							console.warn("[Berichtenbox] Eerste bezoek niet bewaard; de ophaalanimatie speelt opnieuw af.");
						}
					}
					begintDruppelen(meld);
				});
				return;
			}

			begintDruppelen(meld);
		},
	};

	/**
	 * Het binnendruppelen zelf. Los van start(), zodat de ophaalanimatie het kan aanroepen zodra zij
	 * klaar is: verzonnen berichten tijdens het ophalen zou de nabootsing tegenspreken.
	 */
	function begintDruppelen(meld) {
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
	}
}
