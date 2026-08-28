/**
 * berichtenbox-keten.js
 *
 * Haalt de berichten voor een aangesloten persona op uit het Federatief Berichtenstelsel, in
 * plaats van uit de gegenereerde dataset. Welke persona aangesloten is zegt de demo-omgeving
 * (/api/demo/personas); staat de actieve persona daar niet bij, dan blijft de dataset staan.
 *
 * Alleen lezen: markeren, verplaatsen en verwijderen blijven op de bestaande localStorage-state.
 *
 * Dit is de transportlaag, en verder niets: hij haalt op, en meldt wat hij ziet. Wat daarvan op het
 * scherm komt en waar, bepaalt `berichtenbox/keten-bron.js` — die maakt hier een bron van, zoals de
 * dataset er een is. Vandaar dat hier geen DOM in staat, op één plek na: `paginaStartRonde` kijkt
 * of dit de inbox is, want dat bepaalt óf er opgehaald wordt.
 *
 * Het draait vóór berichtenbox.js, zodat de ophaalronde zo vroeg mogelijk begint; de bron wacht die
 * af voordat hij zegt dat hij van toepassing is.
 *
 * Berichten uit de keten komen niet in localStorage. Wat eerder opgehaald is staat op de server, in
 * een sessiecache per ontvanger. Elke berichtenbox-pagina draait daarom zijn eigen ronde — ook het
 * archief, de prullenbak en een detailpagina. Dat kan niet anders: de berichtenlijst geeft per
 * bericht het OIN van de organisatie, en de naam komt alleen uit de ophaalronde zelf.
 *
 * Er is geen stille terugval. Lukt het ophalen niet voor een persona die aantoonbaar aangesloten
 * is, dan blijft deze bron de bron en zegt de melding wat er misging; terugvallen op de dataset zou
 * een bezoeker verzonnen berichten voor echte laten aanzien. "Niet aangesloten" mag wél stil blijven —
 * dat is voor de meeste persona's de normale, juiste uitkomst.
 *
 * Let op: de ontvanger gaat als header `X-Ontvanger` mee en is in de browser aan te passen. Dit is
 * geen authenticatie, net zomin als `X-Test-User` bij de Digitale Assistent; de keten-backend moet
 * zijn eigen allowlist hanteren. Aanvaardbaar voor een gesloten testgroep met fictieve gegevens.
 */
(function () {
	"use strict";

	// De demo-console is een kleine lijst en hoort meteen te antwoorden. De berichtenlijst mag wat
	// langer duren. De ophaalronde zelf krijgt geen harde limiet maar een stiltebewaking: een ronde
	// langs tientallen organisaties mag lang duren, stilte niet.
	// De berichtenlijst komt in één antwoord. Zit hij aan dit maximum, dan is er waarschijnlijk meer
	// dan we tonen; dat hoort de bezoeker te weten in plaats van het stil af te kappen.
	const LIJST_GROOTTE = 200;

	// De demo-console beantwoordt één vraag: welke persona's kent de keten. Dat hoort in
	// milliseconden te gaan. Vijf seconden was een tijdslimiet die als wachttijd voelde: staat er
	// geen backend, dan wacht élke bezoeker die tijd uit voordat de dataset in beeld komt.
	const DEMO_LIMIET_MS = 1500;
	const LIJST_LIMIET_MS = 30000;
	const STILTE_LIMIET_MS = 30000;

	// Constructief en handelingsgericht: benoem wat er misging en wat de bezoeker kan doen.
	const FOUT_TEKSTEN = {
		onbereikbaar: "Er gaat iets mis met het ophalen van uw berichten bij de bronnen. Probeer het later opnieuw.",
		bezig: "Uw berichten worden op dit moment al opgehaald. Wacht een minuut en probeer het opnieuw.",
		afgebroken: "Het ophalen bij de bronnen is halverwege afgebroken. Uw berichten zijn daardoor niet volledig opgehaald. Probeer het opnieuw.",
		stil: "De bronnen reageren niet meer. Probeer het opnieuw.",
		verwerking: "Uw berichten zijn wel opgehaald, maar we konden ze niet tonen. Meld dit als het blijft gebeuren.",
	};

	// Gevuld zodra de demo-omgeving bevestigt dat deze persona in de keten zit. Vanaf dat moment is
	// de gegenereerde dataset aantoonbaar niet zijn post en mag die niet meer getoond worden.
	let aangeslotenBevestigd = false;
	let meldingActief = false;
	let ontvangerVanRonde = null;
	let ronde = null;

	// --- Wat de buitenwereld te horen krijgt ---------------------------------------------------

	// Geen DOM in dit bestand. Dit is de transportlaag: hij haalt op en meldt wat hij ziet. Wat
	// daarvan op het scherm komt en waar, bepaalt de render-laag via berichtenbox/keten-bron.js.
	// Zonder die scheiding schrijft dit script in dezelfde meldingsblokken als de gesimuleerde
	// bronuitval, en is voor de bezoeker niet meer te zien wat echt is en wat nagebootst.

	let melding = null; // { soort: "storing" | "mededeling", tekst }
	let voortgang = null; // { bevraagd, klaar, gevonden }
	let laatsteUitkomst = null;
	const kijkers = [];

	function laatWeten() {
		kijkers.forEach((kijker) => {
			try {
				kijker(toestand());
			} catch (fout) {
				console.error("[Berichtenbox] een luisteraar op de keten struikelde", fout);
			}
		});
	}

	function toestand() {
		return { melding: melding, voortgang: voortgang, uitkomst: laatsteUitkomst, aangesloten: aangeslotenBevestigd };
	}

	function meld(soort, tekst) {
		melding = tekst ? { soort: soort, tekst: tekst } : null;
		laatWeten();
	}

	function toonFout(reden) {
		meld("storing", FOUT_TEKSTEN[reden] || FOUT_TEKSTEN.onbereikbaar);
	}

	// Organisaties die tijdens de ronde niet antwoordden. Een mededeling en geen storing: er staat
	// wél een lijst, hij is alleen niet volledig.
	function toonUitval(namen) {
		meld("mededeling", namen.length > 1 ? "Deze organisaties waren tijdens het ophalen niet bereikbaar: " + namen.join(", ") + ". Berichten van deze organisaties ontbreken mogelijk." : namen[0] + " was tijdens het ophalen niet bereikbaar. Berichten van deze organisatie ontbreken mogelijk.");
	}

	// De ronde telde meer berichten dan de lijst teruggaf: meer dan één pagina, of onderweg iets
	// kwijtgeraakt. Stil inslikken zou een halve postbus als een volledige presenteren.
	function toonOnvolledig(getoond, gevonden) {
		meld("mededeling", "De bronnen vonden " + gevonden + " berichten, maar er zijn er " + getoond + " opgehaald. Probeer het opnieuw om de rest op te halen.");
	}

	function verbergMeldingen() {
		meld(null, null);
	}

	// Hoeveel organisaties bevraagd zijn, hoeveel er antwoordden en hoeveel berichten dat opleverde.
	// Dit is échte voortgang: het komt uit de stroom van het stelsel zelf, niet uit een nabootsing.
	function toonVoortgang(bevraagd, klaar, gevonden) {
		voortgang = { bevraagd: bevraagd, klaar: klaar, gevonden: gevonden };
		laatWeten();
	}

	function verbergVoortgang() {
		voortgang = null;
		laatWeten();
	}

	// --- Netwerk ------------------------------------------------------------------------------

	function ketenFout(reden, bericht) {
		const fout = new Error(bericht);
		fout.reden = reden;
		return fout;
	}

	// Eén onderscheidbare reden per soort storing, zodat de melding kan zeggen wat er misging in
	// plaats van overal "probeer het later opnieuw". Een fout zonder reden komt uit onze eigen
	// code (JSON.parse, een onverwachte vorm) en is geen storing bij de bron.
	function redenVan(fout) {
		if (fout && fout.reden) return fout.reden;
		if (fout && (fout.name === "AbortError" || fout.name === "TimeoutError")) return "stil";
		return "onbereikbaar";
	}

	function metTijdslimiet(pad, opties, limiet) {
		return fetch(pad, Object.assign({ signal: AbortSignal.timeout(limiet) }, opties));
	}

	// De demo-omgeving is de enige die weet welke nummers de keten kent. Een leeg antwoord betekent
	// "niet aangesloten" en mag stil blijven; een onbereikbare of onbegrijpelijke demo-omgeving is
	// een storing en moet dat zeggen — anders is het verschil met "niet aangesloten" onzichtbaar.
	async function aangeslotenPersona(kvkNummer) {
		let respons;
		try {
			respons = await metTijdslimiet("/api/demo/personas", null, DEMO_LIMIET_MS);
		} catch (fout) {
			// Niet doorlaten naar redenVan: een tijdslimiet hier zou "de bronnen reageren niet meer"
			// opleveren, terwijl er nog geen bron bevraagd is.
			throw ketenFout("onbereikbaar", "testaccounts opvragen mislukt (" + (fout && fout.name) + ")");
		}
		if (!respons.ok) throw ketenFout("onbereikbaar", "testaccounts opvragen mislukt (" + respons.status + ")");

		const lijst = await respons.json();
		if (!Array.isArray(lijst)) throw ketenFout("onbereikbaar", "testaccounts: onverwacht antwoord");

		return lijst.find((p) => p && p.bron === "keten" && p.ontvanger === "KVK:" + kvkNummer) || null;
	}

	// De ophaalronde is een Server-Sent-Events-stroom met voortgang per organisatie. EventSource kan
	// geen eigen header meesturen, dus lezen we de stroom zelf uit.
	async function haalOp(ontvanger) {
		const organisaties = {};
		const stil = [];
		let klaar = 0;
		let gevonden = 0;
		let gereed = false;

		// Stiltebewaking in plaats van een harde limiet: de klok gaat na elk voortgangsbericht
		// opnieuw lopen, zodat een trage ronde niet wordt afgekapt maar een doodgelopen ronde wél.
		const afbreker = new AbortController();
		let stilteKlok = null;
		const herstartStilteKlok = () => {
			clearTimeout(stilteKlok);
			stilteKlok = setTimeout(() => afbreker.abort(), STILTE_LIMIET_MS);
		};

		herstartStilteKlok();

		let respons;
		try {
			respons = await fetch("/api/v1/berichten/_ophalen", {
				headers: { "X-Ontvanger": ontvanger },
				signal: afbreker.signal,
			});
		} catch (fout) {
			clearTimeout(stilteKlok);
			throw fout;
		}

		if (respons.status === 409) {
			clearTimeout(stilteKlok);
			throw ketenFout("bezig", "er loopt al een ophaalronde voor deze ontvanger");
		}
		if (!respons.ok) {
			clearTimeout(stilteKlok);
			throw ketenFout("onbereikbaar", "ophalen mislukt (" + respons.status + ")");
		}
		if (!respons.body) {
			clearTimeout(stilteKlok);
			throw ketenFout("onbereikbaar", "ophalen leverde geen stroom op");
		}

		const lezer = respons.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		function verwerk(gebeurtenis) {
			if (gebeurtenis.magazijnId) {
				organisaties[gebeurtenis.magazijnId] = gebeurtenis.naam || gebeurtenis.magazijnId;
			}
			if (gebeurtenis.event === "magazijn-bevraging-voltooid") {
				klaar++;
				gevonden += gebeurtenis.aantalBerichten || 0;
				if (gebeurtenis.status !== "OK") stil.push(gebeurtenis.naam || gebeurtenis.magazijnId);
			}
			if (gebeurtenis.event === "ophalen-fout") {
				const fout = ketenFout("onbereikbaar", "het stelsel meldde een fout tijdens het ophalen");
				fout.referentie = gebeurtenis.referentie;
				throw fout;
			}

			toonVoortgang(Object.keys(organisaties).length, klaar, gevonden);
			if (gebeurtenis.event === "ophalen-gereed") gereed = true;
		}

		try {
			for (;;) {
				const blok = await lezer.read();
				if (blok.done) break;

				// Elk teken uit de stroom telt als teken van leven, ook een SSE-keep-alive (":ping").
				// Alleen op geparste gebeurtenissen resetten zou een trage organisatie afkappen.
				herstartStilteKlok();

				// Frames zijn gescheiden door een lege regel. Een server mag CRLF gebruiken; een
				// chunkgrens mag midden in zo'n paar vallen, dus normaliseren we de hele buffer.
				buffer = (buffer + decoder.decode(blok.value, { stream: true })).replace(/\r\n/g, "\n");

				let scheiding;
				while ((scheiding = buffer.indexOf("\n\n")) >= 0) {
					const frame = buffer.slice(0, scheiding);
					buffer = buffer.slice(scheiding + 2);
					// Meerdere data-regels in één frame horen aaneengeplakt te worden met \n.
					const payload = frame
						.split("\n")
						.filter((regel) => regel.indexOf("data:") === 0)
						.map((regel) => regel.slice(5).replace(/^ /, ""))
						.join("\n");
					if (payload.trim() !== "") verwerk(JSON.parse(payload));
				}

				if (gereed) break;
			}
		} finally {
			clearTimeout(stilteKlok);
			// De stroom afsluiten, anders loopt de backend elke resterende organisatie nog af.
			lezer.cancel().catch(() => {
				/* stroom al dicht */
			});
		}

		// Een stroom die eindigt zonder "ophalen-gereed" is afgebroken. Die zou een halve lijst als
		// volledig presenteren, dus accepteren we hem niet.
		if (!gereed) {
			throw ketenFout("afgebroken", "de ophaalronde brak af na " + klaar + " van " + Object.keys(organisaties).length + " organisaties");
		}

		return { organisaties: organisaties, stil: stil, gevonden: gevonden };
	}

	async function haalLijst(ontvanger) {
		const respons = await metTijdslimiet("/api/v1/berichten?paginaGrootte=" + LIJST_GROOTTE, { headers: { "X-Ontvanger": ontvanger } }, LIJST_LIMIET_MS);
		if (!respons.ok) throw ketenFout("onbereikbaar", "berichten laden mislukt (" + respons.status + ")");
		return respons.json();
	}

	// --- Vertaling ----------------------------------------------------------------------------

	// Zonder berichtId is er geen sleutel voor de state en geen detailpagina; zo'n bericht laten we
	// vallen in plaats van het hele scherm te laten struikelen over een ontbrekende id.
	function bruikbaar(bericht) {
		return !!bericht && typeof bericht.berichtId === "string" && bericht.berichtId !== "";
	}

	// `organisaties` komt uit de ophaalronde: die draagt per magazijn de weergavenaam. Het
	// afzender-veld van een bericht is het nummer van de organisatie, niet haar naam.
	function naarBerichtenboxVorm(bericht, organisaties) {
		return {
			id: bericht.berichtId,
			magazijnId: bericht.magazijnId,
			afzender: organisaties[bericht.magazijnId] || bericht.afzender || bericht.magazijnId || "Onbekende afzender",
			onderwerp: bericht.onderwerp || "Bericht zonder onderwerp",
			inhoud: bericht.inhoud || "",
			datum: (bericht.publicatietijdstip || "").slice(0, 10),
			isOngelezen: bericht.status !== "gelezen",
			map: bericht.map || null,
			heeftBijlage: (bericht.aantalBijlagen || 0) > 0,
			// Merkteken voor berichtenbox.js: dit bericht heeft geen server-gerenderde
			// detailpagina, want die worden bij de build uit de dataset gegenereerd.
			uitKeten: true,
		};
	}

	// --- Cache --------------------------------------------------------------------------------

	// --- Paginabereik -------------------------------------------------------------------------

	// Het Belastingdienst-portaal filtert op de eigen organisatie; keten-magazijnen vallen daar
	// allemaal buiten, dus die berichtenbox zou leeg raken. Daar laten we de dataset staan.
	function inBelastingdienstPortaal() {
		return location.pathname.indexOf("/mijn-belastingdienst/") !== -1;
	}

	function paginaGebruiktKeten() {
		return !inBelastingdienstPortaal();
	}

	// Alleen de inbox bevraagt de bronnen. Archief, prullenbak en de detailpagina's hebben genoeg
	// aan de cache van de vorige ronde; die herkennen we aan data-berichtenbox-view.

	// --- Persona ------------------------------------------------------------------------------

	// personas.js draait vóór dit bestand en bepaalt de actieve persona (?persona= > localStorage >
	// actief). Die volgorde hier herhalen zou stil uit de pas kunnen lopen.
	function actiefKvkNummer() {
		if (!window.Personas || typeof window.Personas.actief !== "function") {
			console.error("[Berichtenbox] keten overgeslagen: window.Personas ontbreekt.");
			return null;
		}

		const persona = window.Personas.actief();
		const nummer = persona && persona.bedrijf && persona.bedrijf.kvkNummer;
		if (!nummer) {
			console.error("[Berichtenbox] keten overgeslagen: actieve persona zonder kvkNummer.", persona && persona.id);
			return null;
		}
		// Als string, zodat een eventuele voorloopnul niet wegvalt.
		return String(nummer);
	}

	// --- Ophaalronde --------------------------------------------------------------------------

	// Of een eerder opgehaalde lijst op het scherm blijft staan, beslist de render-laag: die weet
	// wat er nú staat. Wij melden alleen dát het misging.
	function meldStoring(reden) {
		verbergVoortgang();
		toonFout(reden);
	}

	function mislukt(fout) {
		const reden = redenVan(fout);
		console.error("[Berichtenbox] keten niet bereikbaar (" + reden + ")", fout);
		meldStoring(reden);
	}

	async function draaiRonde(kvkNummer) {
		let uitvraag;
		let lijst;

		let aangesloten;
		try {
			aangesloten = await aangeslotenPersona(kvkNummer);
		} catch (fout) {
			// Zonder demo-console valt niet vast te stellen of deze persona in de keten zit. Draait
			// er helemaal geen keten-backend — de standaardsituatie buiten de proeftuin — dan is dat
			// de normale toestand en valt er niets te melden; de dataset is dan de juiste inhoud.
			// Alleen wie aantoonbaar aangesloten wás krijgt een storingsmelding.
			if (aangeslotenBevestigd) {
				mislukt(fout);
				return null;
			}
			console.warn("[Berichtenbox] demo-console niet bereikbaar; de gegenereerde dataset blijft staan.", fout);
			verbergVoortgang();
			return null;
		}

		try {
			if (!aangesloten || !aangesloten.ontvanger) {
				// Wisten we al dat deze persona aangesloten wás, dan is "hij staat er niet meer bij"
				// een storing en geen normale uitkomst — anders zouden we hem zonder een woord op de
				// gegenereerde dataset zetten. Bij een eerste ronde is de dataset juist wél correct.
				if (aangeslotenBevestigd) {
					throw ketenFout("onbereikbaar", "de demo-omgeving kent deze ontvanger niet meer");
				}
				verbergVoortgang();
				return null;
			}

			aangeslotenBevestigd = true;
			ontvangerVanRonde = aangesloten.ontvanger;

			uitvraag = await haalOp(aangesloten.ontvanger);
			lijst = await haalLijst(aangesloten.ontvanger);
		} catch (fout) {
			mislukt(fout);
			return null;
		}

		// Vanaf hier is het ophalen gelukt en kan het alleen nog misgaan in onze eigen verwerking.
		// "Probeer het later opnieuw" helpt daar niet tegen, dus dat krijgt een eigen tekst.
		try {
			const ruw = Array.isArray(lijst.berichten) ? lijst.berichten : [];
			if (!Array.isArray(lijst.berichten)) {
				console.error("[Berichtenbox] berichtenlijst zonder `berichten`-array", lijst);
			}

			const berichten = ruw.filter(bruikbaar).map((bericht) => naarBerichtenboxVorm(bericht, uitvraag.organisaties));
			const overgeslagen = ruw.length - berichten.length;
			if (overgeslagen > 0) {
				console.error("[Berichtenbox] " + overgeslagen + " bericht(en) zonder berichtId overgeslagen.");
			}

			const magazijnen = Object.keys(uitvraag.organisaties).map((id) => ({
				id: id,
				naam: uitvraag.organisaties[id],
				type: "instantie",
			}));

			// De tellers boven de lijst tonen zelf hoeveel bronnen antwoordden; alleen een
			// onvolledige lijst of een organisatie die niet reageerde heeft een eigen melding nodig.
			verbergVoortgang();
			verbergMeldingen();

			if (ruw.length >= LIJST_GROOTTE) {
				meld("mededeling", "Er worden maximaal " + LIJST_GROOTTE + " berichten getoond. Mogelijk heeft u meer berichten dan hier staan.");
			} else if (berichten.length < uitvraag.gevonden) {
				toonOnvolledig(berichten.length, uitvraag.gevonden);
			} else if (uitvraag.stil.length > 0) {
				toonUitval(uitvraag.stil);
			}

			return { berichten: berichten, magazijnen: magazijnen };
		} catch (fout) {
			console.error("[Berichtenbox] opgehaalde berichten niet te verwerken", fout);
			meldStoring("verwerking");
			return null;
		}
	}

	// --- Start --------------------------------------------------------------------------------

	// Alleen op pagina's die een berichtenbox tonen: elders is er niets te vervangen, en zou een
	// persona zonder kvkNummer alleen console-ruis opleveren.
	const kvkNummer = window.berichtenboxData && paginaGebruiktKeten() ? actiefKvkNummer() : null;

	// Geen lokale cache: berichten uit de keten horen niet in localStorage. Wat de bezoeker eerder
	// ophaalde staat op de server (sessiecache per ontvanger, schuivende TTL), maar de
	// organisatienamen zitten alleen in de ophaalronde — de berichtenlijst geeft per bericht het
	// OIN, niet de naam. Dus draait elke berichtenbox-pagina zijn eigen ronde, ook het archief, de
	// prullenbak en een detailpagina. Trager dan een cache uit de vorige pagina, en het enige wat
	// klopt.
	if (kvkNummer) {
		ronde = draaiRonde(kvkNummer);
	}

	window.BerichtenboxKeten = {
		/** Loopt er een ophaalronde? Synchroon bekend, dus de bron kan er meteen op beslissen. */
		get bezig() {
			return ronde !== null;
		},

		/** Is deze persona aantoonbaar aangesloten op de keten? */
		get aangesloten() {
			return aangeslotenBevestigd;
		},

		/** De huidige melding, of null. `{ soort: "storing" | "mededeling", tekst }`. */
		get melding() {
			return melding;
		},

		/** De voortgang van de lopende ronde, of null. `{ bevraagd, klaar, gevonden }`. */
		get voortgang() {
			return voortgang;
		},

		/**
		 * De berichten van de lopende of laatst gedraaide ronde, of null als er niets te leveren
		 * valt. Werpt nooit: een mislukte ronde meldt zichzelf en levert wat er eerder al was.
		 */
		berichten: function () {
			if (!ronde) return Promise.resolve(laatsteUitkomst);
			return ronde.then(
				function (uitkomst) {
					if (uitkomst) laatsteUitkomst = uitkomst;
					return laatsteUitkomst;
				},
				function (fout) {
					console.error("[Berichtenbox] onverwachte fout in de ophaalronde", fout);
					meldStoring("verwerking");
					return laatsteUitkomst;
				}
			);
		},

		/** Meldt zich bij elke wijziging: een nieuwe melding, nieuwe voortgang, nieuwe berichten. */
		opWijziging: function (kijker) {
			kijkers.push(kijker);
		},

		/**
		 * Meldt dat opgehaalde berichten niet getoond konden worden. Voor de render-laag, die de
		 * rijen bouwt en daarbij kan struikelen over een bericht met een onverwachte vorm.
		 */
		meldVerwerkingsfout: function () {
			meldStoring("verwerking");
		},

		/**
		 * Draait de ophaalronde opnieuw. Hangt onder de "Opnieuw proberen"-knop van de melding.
		 * Alleen het kvk-nummer is nodig: draaiRonde vraagt de ontvanger zelf opnieuw op, zodat de
		 * knop ook werkt wanneer de vorige poging al bij de demo-omgeving strandde. Geeft false als
		 * er niets te herhalen valt.
		 */
		opnieuw: function () {
			if (!kvkNummer) return false;

			verbergMeldingen();
			// Geen "0 van 0 bronnen": dat is geen voortgang maar een bewering over bronnen die nog
			// niemand bevraagd heeft. De eerste gebeurtenis uit de stroom meldt zich vanzelf.
			ronde = draaiRonde(kvkNummer);
			ronde.then(
				function (uitkomst) {
					if (uitkomst) {
						laatsteUitkomst = uitkomst;
						laatWeten();
					}
				},
				function (fout) {
					console.error("[Berichtenbox] onverwachte fout in de ophaalronde", fout);
					meldStoring("verwerking");
				}
			);
			return true;
		},
	};
})();
