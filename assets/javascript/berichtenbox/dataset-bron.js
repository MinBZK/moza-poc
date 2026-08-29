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
 * En de gesimuleerde bronuitval, om dezelfde reden: een bron die niet antwoordt levert geen
 * berichten. Die laat `laad()` dus weg, in plaats van dat de render-laag ze wegfiltert — zo is een
 * nagebootste storing hetzelfde als een echte, wat het hele punt van de unhappy flow is.
 */

/** Minimale tussenpoos, ook als ?poll= een lagere waarde meegeeft. */
const POLL_MIN_SEC = 5;
const POLL_STANDAARD_SEC = 60;

const ONDERWERPEN = ["Nieuw bericht ontvangen", "Bevestiging ontvangst", "Bericht beschikbaar", "Actie mogelijk vereist"];

// --- Gesimuleerde bronuitval -----------------------------------------------------------------

// De unhappy flow hoort bij deze bron: het is een nabootsing van bronnen die niet antwoorden, en
// een bron die niet antwoordt levert geen berichten. Voorheen filterde de render-laag ze weg — dan
// is een gesimuleerde storing iets anders dan een echte, terwijl ze voor de bezoeker hetzelfde
// horen te zijn.
//
// Drie scenario's, één per weergave gekozen:
//  - "een":   één magazijn is bij het laden onbereikbaar.
//  - "geen":  geen enkel magazijn antwoordt.
//  - "later": alles laadt, waarna er onderweg één uitvalt.
const UNHAPPY_SCENARIOS = ["een", "geen", "later"];
const ONBEREIKBARE_BRON = "rdw";

// Welke bron ná een geslaagde lading is uitgevallen. In sessionStorage, want de detailpagina moet
// hetzelfde weten: die toont geen inhoud van een bericht waarvan de bron zojuist wegviel. Blijft
// binnen het tabblad en verdwijnt als dat sluit.
const UITVAL_KEY = "berichtenbox-bron-uitval";

// Het gekozen scenario hoort bij de zitting: anders weten de inbox en de detailpagina iets anders.
const SCENARIO_KEY = "berichtenbox-uitval-scenario";

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
export function datasetBron(data, { state, limiet = 5, magOphalen = () => true, meldStoring = (tekst) => console.error("[Berichtenbox] Geen meldStoring meegegeven; onzichtbaar gebleven: " + tekst), verbergMelding = () => {}, zichtbaarheid = {}, magAnimeren = () => false, duurMs = null, vlagAan = () => false, sessie = () => sessionStorage, magUitvallen = () => true } = {}) {
	let teller = 0;
	let voortgangKijker = null;

	// Eén keer vastgelegd, en daarna van ons. `data.berichten` is hetzelfde object dat de render-laag
	// in handen heeft, en die schrijft er de gefilterde lijst in terug — dus wat wij bij het laden
	// weglaten, bestaat daarna nergens meer. Zonder deze kopie kan "Opnieuw proberen" de berichten
	// niet teruggeven en verdwijnt alleen de melding die het gemis verklaarde.
	const uitDeDataset = (data.berichten || []).slice();

	// --- De nagebootste uitval, van deze bron ---------------------------------------------------

	let scenarioGekozen = false;
	let scenario = "een";
	let handmatigHersteld = false;
	let uitvalGepland = false;
	// De lopende wekker apart houden: het vlaggetje uitzetten stopt hem niet, en dan bracht een net
	// hersteld magazijn zichzelf seconden later weer om zeep.
	let uitvalWekker = null;
	let meldWijziging = null;
	let levertOpnieuw = null;

	/**
	 * Levert de lijst opnieuw, met de stand van dat moment. Voor na een herstel: de berichten die
	 * werden weggelaten horen dan weer op het scherm.
	 */
	async function leverOpnieuw() {
		if (!meldWijziging) {
			// start() is overgeslagen — bijvoorbeeld na een getoonde laadfout — dus er is niemand om
			// aan te melden. Stil teruggaan zou de knop dood laten lijken terwijl de melding die het
			// gemis verklaarde net is weggehaald.
			console.error("[Berichtenbox] Geen luisteraar om de herstelde lijst aan te melden.");
			meldStoring("Wij konden de berichten niet opnieuw ophalen. Ververs de pagina.");
			return;
		}

		// Twee ronden tegelijk draaien de opruimactie op de bewaarde berichten dubbel.
		if (levertOpnieuw) return levertOpnieuw;

		levertOpnieuw = (async () => {
			try {
				const inhoud = await bron.laad();
				const mislukt = meldWijziging(inhoud);
				if (mislukt && mislukt.length) {
					console.error("[Berichtenbox] De herstelde lijst kon niet getoond worden.");
					meldStoring("Wij konden de berichten niet opnieuw tonen. Ververs de pagina.");
				}
			} catch (fout) {
				console.error("[Berichtenbox] Opnieuw leveren na een herstel mislukte.", fout);
				meldStoring("Wij konden de berichten niet opnieuw ophalen. Ververs de pagina.");
			} finally {
				levertOpnieuw = null;
			}
		})();

		return levertOpnieuw;
	}

	function unhappyAan() {
		if (handmatigHersteld) return false;
		return vlagAan();
	}

	/**
	 * Eén scenario per zitting, niet per paginalading.
	 *
	 * Rolde elke pagina opnieuw, dan zei de inbox "deze bron is onbereikbaar" en toonde de
	 * detailpagina het bericht gewoon — twee van de drie keer. Dat is precies de tegenstrijdigheid
	 * die het blok op de detailpagina hoort te voorkomen.
	 */
	function huidigScenario() {
		if (!scenarioGekozen) {
			const bewaard = leesZitting(SCENARIO_KEY);
			scenario = UNHAPPY_SCENARIOS.includes(bewaard) ? bewaard : UNHAPPY_SCENARIOS[Math.floor(Math.random() * UNHAPPY_SCENARIOS.length)];
			scenarioGekozen = true;
			if (bewaard !== scenario) schrijfZitting(SCENARIO_KEY, scenario);
		}
		return scenario;
	}

	function leesZitting(sleutel) {
		try {
			return sessie().getItem(sleutel);
		} catch (fout) {
			console.warn("[Berichtenbox] De zitting is niet te lezen; inbox en detailpagina kunnen uiteenlopen.", fout);
			return null;
		}
	}

	function schrijfZitting(sleutel, waarde) {
		try {
			if (waarde === null) sessie().removeItem(sleutel);
			else sessie().setItem(sleutel, waarde);
		} catch (fout) {
			console.warn("[Berichtenbox] De zitting is niet te bewaren; de detailpagina weet er straks niets van.", fout);
		}
	}

	function leesUitval() {
		const rauw = leesZitting(UITVAL_KEY);
		if (!rauw) return null;
		try {
			return JSON.parse(rauw);
		} catch (fout) {
			console.warn("[Berichtenbox] De bewaarde bronuitval is niet te lezen.", fout);
			return null;
		}
	}

	function schrijfUitval(bron) {
		schrijfZitting(UITVAL_KEY, bron ? JSON.stringify(bron) : null);
	}

	/**
	 * De uitvalstand van dit moment, in één keer bepaald.
	 *
	 * Eerder lazen drie plekken elk hun eigen deelverzameling van dezelfde vijf invoeren — de vlag,
	 * het handmatig herstel, het scenario, de bewaarde uitval en of deze pagina er een lijst voor
	 * heeft. Dan is het onvermijdelijk dat twee van de drie het oneens zijn, en zegt de melding iets
	 * anders dan de lijst. Vier reviewrondes vonden telkens een andere combinatie.
	 *
	 * Hier worden ze één keer gelezen, en `blokkeert` is de enige die erover beslist.
	 */
	function uitvalStandNu() {
		const actief = unhappyAan() && magUitvallen();
		const scenario = actief ? huidigScenario() : null;
		const gevallen = actief && scenario === "later" ? leesUitval() : null;
		const statusVan = zichtbaarheid.statusVan || (() => "inbox");

		function blokkeert(bericht) {
			if (!actief || !bericht) return false;
			// Alleen wat er binnenkomt: wat de bezoeker zelf archiveerde of weggooide blijft van hem.
			if (statusVan(bericht.id) !== "inbox") return false;
			if (scenario === "geen") return true;
			if (scenario === "een") return bericht.magazijnId === ONBEREIKBARE_BRON;
			return !!gevallen && bericht.magazijnId === gevallen.id;
		}

		return { actief, scenario, uitgevallen: gevallen, blokkeert };
	}

	let haaltOp = false;
	const wachtendeVervolgen = [];
	let hernieuwGevraagd = false;

	/** Iedereen die op deze ronde wachtte, precies één keer. Eén struikelaar sleept de rest niet mee. */
	function rondVervolgenAf(fout) {
		haaltOp = false;

		// Er is onderweg om een nieuwe ronde gevraagd, en die vraag ging over andere zichtbaarheid dan
		// deze ronde geteld heeft. De wachtenden krijgen dus die verse ronde, niet deze uitkomst.
		if (hernieuwGevraagd && !fout) {
			hernieuwGevraagd = false;
			haaltOp = true;
			try {
				ophaalAnimatie(rondVervolgenAf);
				return;
			} catch (opnieuwFout) {
				console.error("[Berichtenbox] De hernieuwde ophaalronde kwam niet op gang.", opnieuwFout);
				haaltOp = false;
				// De wachtenden vroegen om díe ronde. Hen "geslaagd" melden zou het contract van
				// klaar(fout) laten liegen.
				fout = fout || opnieuwFout;
			}
		}
		hernieuwGevraagd = false;

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
			clearTimeout(geduld);

			try {
				if (fout) {
					console.error("[Berichtenbox] De ophaalronde is afgebroken.", fout);
					meldStoring("Het ophalen bij de bronnen is afgebroken. Ververs de pagina om het opnieuw te proberen.");
				} else {
					// Een geslaagde ronde weerlegt de melding van een eerdere die het niet haalde. Zonder
					// dit blijft "het ophalen is afgebroken" boven een lijst staan die compleet is.
					verbergMelding();
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

		// Ontsnapping. requestAnimationFrame staat stil in een achtergrondtabblad, dus een ronde die
		// niet afrondt is geen randgeval. Zonder deze klok blijft `haaltOp` staan, verdwijnt elk
		// volgend verzoek in de wachtrij, en zijn de knoppen stille no-ops voor de rest van de zitting.
		const geduld = setTimeout(() => rondAf(new Error("de ophaalronde rondde niet af")), Math.max(duur * 4, 30000));

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

	// Met een naam, zodat leverOpnieuw hierboven zijn eigen laad() kan aanroepen.
	const bron = {
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

			return bouwLevering();
		},

		/**
		 * De bezoeker drukt op "opnieuw proberen": de nagebootste storing is voorbij.
		 *
		 * De bron liet die berichten weg, dus alleen de bron kan ze teruggeven — het scherm opnieuw
		 * tekenen helpt niet, want ze staan nergens meer. Zonder deze levering blijft de bezoeker met
		 * een kortere lijst zitten én is de melding die dat verklaarde net verdwenen.
		 */
		herstelBronnen() {
			handmatigHersteld = true;
			stopUitvalWekker();
			return leverOpnieuw();
		},

		/** De vlag ging uit of aan; bij de volgende weergave hoort een nieuwe keuze. */
		vergeetUitval() {
			handmatigHersteld = false;
			scenarioGekozen = false;
			stopUitvalWekker();
			schrijfZitting(SCENARIO_KEY, null);
			// Opnieuw wapenen: plannUitval draait alleen vanuit start(), en die komt maar één keer
			// langs. Zonder dit is de unhappy flow na één keer uitzetten dood bij scenario "later".
			if (meldWijziging) plannUitval(meldWijziging);
			return leverOpnieuw();
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
				// Wie hierom vraagt, verandert meestal juist wat er te zien is: een hersteld magazijn, een
				// verruimd organisatiefilter. De lopende ronde telt nog naar de oude aantallen toe, dus
				// meeliften zou eindigen op "11 van 12 bronnen" boven een lijst uit dertien. Vandaar een
				// verse ronde zodra deze klaar is.
				wachtendeVervolgen.push(vervolg);
				hernieuwGevraagd = true;

				// De aanroeper hoort te weten dat er niets zichtbaars gebeurt: zonder dat lijkt de knop
				// dood, terwijl het verzoek gewoon in de rij staat.
				return "wacht";
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
			meldWijziging = meld;
			if (magAnimeren()) {
				// Dezelfde afscherming als herhaalOphalen. Klikt de bezoeker op "Opnieuw proberen" in het
				// gat tussen de bronkeuze en deze aanroep, dan loopt er al een ronde; er een tweede naast
				// zetten laat ze langs elkaar heen tellen en het scherm heen en weer gaan.
				const alBezig = haaltOp;
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
					plannUitval(meld);
					begintDruppelen(meld);
				});
				if (alBezig) return;

				try {
					ophaalAnimatie(rondVervolgenAf);
				} catch (fout) {
					rondVervolgenAf(fout);
					throw fout;
				}
				return;
			}

			plannUitval(meld);
			begintDruppelen(meld);
		},
	};

	return bron;

	/**
	 * Het binnendruppelen zelf. Los van start(), zodat de ophaalanimatie het kan aanroepen zodra zij
	 * klaar is: verzonnen berichten tijdens het ophalen zou de nabootsing tegenspreken.
	 */
	/**
	 * Het "later"-scenario: alles laadt, en dan valt er onderweg één magazijn uit. Dat is brongedrag
	 * — een bron die halverwege wegvalt — dus hoort het bij `start`, net als het binnendruppelen.
	 *
	 * De bron meldt de nieuwe lijst zonder die berichten, plus wat er wegviel. De render-laag ziet
	 * een gewone bronwijziging en hoeft niet te weten dat die nagebootst is.
	 */
	/**
	 * Wat de bron op dit moment levert. Eén plek, want twee plekken lopen uiteen: `plannUitval`
	 * bouwde de lijst uit de momentopname en gooide daarmee de binnengedruppelde berichten weg — ook
	 * die van een heel andere organisatie dan de bron die net uitviel. De melding ernaast noemde dan
	 * de verkeerde helft.
	 */
	/**
	 * Wat de bron op dit moment levert, plus wat hij níet kon leveren.
	 *
	 * De melding is een functie van het verschil tussen alles en wat er geleverd wordt — geen
	 * parallelle beschrijving van het scenario. Daardoor is "de melding klopt niet met de lijst" niet
	 * meer op te schrijven: staat er niets in het verschil, dan valt er niets te melden.
	 */
	function bouwLevering() {
		const magazijnen = (data.magazijnen || []).slice();
		const bekendeIds = new Set(uitDeDataset.map((bericht) => bericht && bericht.id));
		const bekendeMagazijnen = new Set(magazijnen.map((magazijn) => magazijn.id));

		// Eén plek die beslist of de binnengedruppelde berichten meedoen; twee aanroepers met een
		// eigen antwoord lieten ze bij een uitval alsnog verschijnen met de vlag uit.
		const bewaard = state && dynamischeBerichtenAan() ? state.ruw.nieuweBerichten.slice().reverse() : [];

		const terug = bewaard.filter((bericht) => {
			if (!bericht) return false;
			if (bekendeIds.has(bericht.id)) return false;
			if (!bekendeMagazijnen.has(bericht.magazijnId)) {
				console.warn("[Berichtenbox] Bewaard bericht van een onbekend magazijn overgeslagen: " + bericht.magazijnId);
				return false;
			}
			return true;
		});

		const alles = [...terug, ...uitDeDataset];
		const stand = uitvalStandNu();

		// Een magazijn dat niet antwoordt, levert geen berichten. Ze hier weglaten in plaats van ze in
		// de render-laag weg te filteren: dan is een nagebootste storing hetzelfde als een echte.
		const geleverd = [];
		const weggelaten = [];
		alles.forEach((bericht) => (stand.blokkeert(bericht) ? weggelaten : geleverd).push(bericht));

		let uitval = null;
		if (weggelaten.length) {
			const namen = [...new Set(weggelaten.map((bericht) => bericht.afzender || bericht.magazijnId))];
			console.warn("[Berichtenbox] Gesimuleerde uitval (" + stand.scenario + "): " + weggelaten.length + " bericht(en) niet geleverd door " + namen.join(", ") + ".");
			uitval = { scenario: stand.scenario, uitgevallen: stand.uitgevallen, bronnen: namen };
		}

		return {
			berichten: geleverd,
			magazijnen,
			mappen: (data.mappen || []).slice(),
			// Wat deze bron niet kon leveren. De render-laag beslist hoe dat eruitziet.
			uitval,
		};
	}

	/** Magazijnen waarvan nu iets in de inbox staat — de enige die zinnig kunnen uitvallen. */
	function zichtbareBronnen() {
		const statusVan = zichtbaarheid.statusVan || (() => "inbox");
		return [
			...new Set(
				bouwLevering()
					.berichten.filter((bericht) => bericht && bericht.magazijnId && statusVan(bericht.id) === "inbox")
					.map((bericht) => bericht.magazijnId)
			),
		];
	}

	/** Zet een geplande uitval af. Alleen het vlaggetje wissen laat de wekker gewoon aflopen. */
	function stopUitvalWekker() {
		if (uitvalWekker !== null) clearTimeout(uitvalWekker);
		uitvalWekker = null;
		uitvalGepland = false;
		schrijfUitval(null);
	}

	function plannUitval(meld) {
		if (!unhappyAan() || huidigScenario() !== "later") return;
		// Een uitval begínt op de inbox. Een detailpagina mag er wel één uitleggen die al liep,
		// maar er zelf een starten laat de tellers stilletjes zakken op een pagina die de lijst
		// niet eens toont.
		if (!magOphalen()) return;
		if (uitvalGepland) return;
		if (leesUitval()) return;
		uitvalGepland = true;

		// Alleen bronnen waarvan nu daadwerkelijk iets in de inbox staat. Koos hij uit de rauwe
		// dataset, dan kon "X is zojuist onbereikbaar geworden" verschijnen terwijl er niets
		// verdween — de bezoeker leest een melding over een lijst die niet veranderd is.
		const kandidaten = [...new Set(zichtbareBronnen())];
		if (!kandidaten.length) return;

		// Ergens tussen vier en twaalf seconden: lang genoeg om de lijst eerst compleet te zien.
		const vertraging = 4000 + Math.floor(Math.random() * 8000);
		uitvalWekker = setTimeout(() => {
			uitvalWekker = null;
			if (!unhappyAan() || huidigScenario() !== "later" || leesUitval()) return;

			// Opnieuw kijken: tussen het plannen en nu kan de bezoeker de laatste berichten van een
			// bron gearchiveerd hebben.
			const nu = zichtbareBronnen();
			const id = kandidaten.find((kandidaat) => nu.includes(kandidaat)) || nu[0];
			if (!id) return;

			const voorbeeld = uitDeDataset.find((bericht) => bericht && bericht.magazijnId === id);
			schrijfUitval({ id, naam: voorbeeld ? voorbeeld.afzender : id });

			// Dezelfde bouwer als laad(): die weet ook van de binnengedruppelde berichten, en dat het
			// archief van de bezoeker niet mee hoort te krimpen.
			const mislukt = meld(bouwLevering());

			if (mislukt && mislukt.length) {
				console.error("[Berichtenbox] De uitgevallen bron kon niet verwerkt worden; de lijst klopt mogelijk niet meer.");
				meldStoring("Er ging iets mis bij het bijwerken van de lijst. Ververs de pagina.");
			}
		}, vertraging);
	}

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
