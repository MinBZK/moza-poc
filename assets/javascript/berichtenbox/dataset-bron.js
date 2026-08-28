/**
 * De gegenereerde dataset als berichtenbron.
 *
 * Deze bron is altijd van toepassing en hoort daarom achteraan in het register: hij vangt op wat
 * geen andere bron opeist. `window.berichtenboxData` wordt door Eleventy in de pagina gezet.
 *
 * Let op: `laad()` geeft kopieën terug, maar `data` blijft hetzelfde object dat de render-laag in
 * handen heeft — en die schrijft er wél in (`data.berichten = volgende` bij een bronwijziging). De
 * ophaalanimatie telt over `data.berichten` en leunt daarmee op die gedeelde staat. Zolang dat zo
 * is, hoort het hier te staan en niet als vanzelfsprekendheid weggeschreven.
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

const ONDERWERPEN = ["Nieuw bericht ontvangen", "Bevestiging ontvangst", "Bericht beschikbaar", "Actie mogelijk vereist"];

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
 * @param data                  window.berichtenboxData
 * @param opties.state          Om binnengekomen berichten en het eerste bezoek te bewaren.
 * @param opties.limiet         Hoeveel binnengedruppelde berichten er hoogstens bewaard blijven.
 * @param opties.magOphalen     Of polling op deze pagina zinnig is.
 * @param opties.meldStoring    Waar een melding aan de bezoeker terechtkomt.
 * @param opties.zichtbaarheid  Wat de bezoeker straks écht ziet: `statusVan`, `magazijnDoorOrgFilter`,
 *                              `magazijnToegestaan`, `persoonRelevant`. De animatie moet op díe
 *                              aantallen eindigen, anders telt zij naar iets anders toe dan er komt.
 * @param opties.magAnimeren    Of de ophaalanimatie hier op zijn plaats is. Dat weet de render-laag:
 *                              de inbox, pagina 1, eerste bezoek, geen mislukte lading.
 * @param opties.duurMs         Hoe lang de nabootsing doet over één ronde. Standaard hangt dat af van
 *                              het aantal bronnen; tests zetten hem kort, want de duur is niet wat zij
 *                              toetsen.
 */
export function datasetBron(data, { state, limiet = 5, magOphalen = () => true, meldStoring = (tekst) => console.error("[Berichtenbox] Geen meldStoring meegegeven; onzichtbaar gebleven: " + tekst), zichtbaarheid = {}, magAnimeren = () => false, duurMs = null } = {}) {
	let teller = 0;
	let voortgangKijker = null;
	let haaltOp = false;
	const wachtendeVervolgen = [];

	/** Iedereen die op deze ronde wachtte, precies één keer. Eén struikelaar sleept de rest niet mee. */
	function rondVervolgenAf(fout) {
		haaltOp = false;
		const vervolgen = wachtendeVervolgen.splice(0);
		vervolgen.forEach((vervolg) => {
			try {
				vervolg(fout || null);
			} catch (fout) {
				console.error("[Berichtenbox] Het vervolg na een ophaalronde mislukte.", fout);
			}
		});
	}

	/**
	 * Een kijker die struikelt mag de ronde niet stilzetten. Deed hij dat wel, dan kwam er nooit een
	 * `null` en bleef de lijst verborgen bij een render-laag die op die `null` wacht.
	 */
	function meldVoortgang(voortgang) {
		if (!voortgangKijker) return;
		try {
			voortgangKijker(voortgang);
		} catch (fout) {
			console.error("[Berichtenbox] Een kijker op de voortgang struikelde.", fout);
		}
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
		const duur = Math.max(1, duurMs === null ? (totaalBronnen <= 1 ? 1200 : 4000) : duurMs);
		// Monotone klok: een NTP-correctie midden in de animatie laat de balk anders springen.
		const klok = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
		const begin = klok();

		function aantalVoor(reeks, t) {
			// Binary search: hoeveel tijden liggen op of vóór t?
			let lo = 0;
			let hi = reeks.length;
			while (lo < hi) {
				const mid = (lo + hi) >>> 1;
				if (reeks[mid] <= t) lo = mid + 1;
				else hi = mid;
			}
			return lo;
		}

		const volgendeStap = typeof requestAnimationFrame === "function" ? (fn) => requestAnimationFrame(fn) : (fn) => setTimeout(fn, 16);

		let afgerond = false;

		/**
		 * Eén uitgang, en die wordt gegarandeerd genomen. De render-laag verbergt de lijst zolang er
		 * voortgang gemeld wordt en zet hem pas terug bij `null`; blijft die uit, dan kijkt de
		 * bezoeker naar kolomkoppen en een bevroren balk, zonder een woord erbij.
		 */
		function rondAf(fout) {
			if (afgerond) return;
			afgerond = true;

			try {
				if (fout) {
					console.error("[Berichtenbox] De ophaalronde is afgebroken.", fout);
					meldStoring("Het ophalen bij de bronnen is afgebroken. Ververs de pagina om het opnieuw te proberen.");
				}
			} catch (meldFout) {
				console.error("[Berichtenbox] En die afbreking was niet te melden.", meldFout);
			} finally {
				// In een finally, want dit is de enige weg terug. Struikelt het melden — het schrijft in
				// de DOM — dan blijft de bezoeker anders achter met een verborgen lijst en een bron die
				// nooit meer iets zegt, en pas de wachthond haalt hem daar 45 seconden later uit.
				meldVoortgang(null);
				try {
					klaar(fout || null);
				} catch (klaarFout) {
					console.error("[Berichtenbox] Het vervolg na de ophaalronde mislukte.", klaarFout);
				}
			}
		}

		function stap() {
			try {
				const t = Math.min(1, (klok() - begin) / duur);
				meldVoortgang({
					bevraagd: totaalBronnen,
					klaar: aantalVoor(bronTijden, t),
					gevonden: aantalVoor(berichtTijden, t),
				});

				if (t < 1) {
					volgendeStap(stap);
					return;
				}
			} catch (fout) {
				rondAf(fout);
				return;
			}

			rondAf(null);
		}

		try {
			meldVoortgang({ bevraagd: totaalBronnen, klaar: 0, gevonden: 0 });
			volgendeStap(stap);
		} catch (fout) {
			rondAf(fout);
		}
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

			const uitDataset = data.berichten || [];
			const magazijnen = (data.magazijnen || []).slice();
			const bekendeIds = new Set(uitDataset.map((bericht) => bericht.id));
			const bekendeMagazijnen = new Set(magazijnen.map((magazijn) => magazijn.id));

			const terug = eerderBinnengekomen.filter((bericht) => !bekendeIds.has(bericht.id) && bekendeMagazijnen.has(bericht.magazijnId));

			return {
				berichten: [...terug, ...uitDataset],
				magazijnen,
				mappen: (data.mappen || []).slice(),
			};
		},

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
			const vervolg = typeof klaar === "function" ? klaar : () => {};

			// Twee ronden tegelijk schrijven in hetzelfde voortgangsblok, en de eerste die klaar is
			// meldt `null` terwijl de tweede nog telt. Twee keer klikken hoort dus geen tweede ronde
			// te starten — maar het vervolg van de aanroeper hangt eraan: opnieuw renderen, de mappen
			// bijwerken. Dat stil laten vallen levert een scherm op dat niet meer klopt met de
			// toestand. Vandaar dat het vervolg meelift op de ronde die al loopt.
			if (haaltOp) {
				wachtendeVervolgen.push(vervolg);
				return;
			}

			haaltOp = true;
			wachtendeVervolgen.push(vervolg);
			// De eerste regels van ophaalAnimatie staan buiten haar eigen vangnet. Gooit daar iets, dan
			// bleef haaltOp voorgoed staan en was de knop de rest van de zitting dood.
			try {
				ophaalAnimatie(rondVervolgenAf);
			} catch (fout) {
				rondVervolgenAf(fout);
				throw fout;
			}
		},

		/**
		 * Het gedrag ná het laden: eerst laten zien dat er opgehaald wordt, dan pas berichten laten
		 * binnendruppelen. De render-laag ziet dat laatste als een gewone bronwijziging en hoeft
		 * niets van polling te weten.
		 */
		start(meld) {
			if (magAnimeren()) {
				haaltOp = true;
				wachtendeVervolgen.push((fout) => {
					// Een afgebroken ronde is geen gehad eerste bezoek: boeken we hem toch, dan speelt de
					// animatie na de aangeraden verversing niet opnieuw af en is de storing niet meer te
					// reproduceren. En binnendruppelende demo-berichten onder een melding dat het ophalen
					// is afgebroken, spreken die melding tegen — de schermlezer kondigt post aan waarvan
					// de pagina zegt dat zij er niet is.
					if (fout) return;

					// Administratie van de animatie, niets wat de bezoeker vroeg — en niets wat het
					// binnendruppelen hieronder mag tegenhouden. Lukt het bewaren niet, dan speelt zij bij
					// het volgende bezoek nog een keer af: hinderlijk, niet misleidend. Wel met de reden
					// erbij, anders is dit signaal niet van ruis te scheiden.
					try {
						if (state) {
							state.ruw.eersteBezoekGehad = true;
							if (!state.bewaar()) {
								const reden = typeof state.waaromNietBewaard === "function" ? state.waaromNietBewaard() : "onbekend";
								console.error("[Berichtenbox] Eerste bezoek niet bewaard (" + reden + "); de ophaalanimatie speelt opnieuw af.");
							}
						}
					} catch (stateFout) {
						console.error("[Berichtenbox] Het eerste bezoek kon niet geboekt worden.", stateFout);
					}
					begintDruppelen(meld);
				});
				try {
					ophaalAnimatie(rondVervolgenAf);
				} catch (fout) {
					rondVervolgenAf(fout);
					throw fout;
				}
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

		const magazijnen = data.magazijnen || [];
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
