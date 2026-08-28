/**
 * Het Federatief Berichtenstelsel als berichtenbron.
 *
 * `berichtenbox-keten.js` doet het transport: het vraagt de demo-omgeving of deze persona
 * aangesloten is, draait de ophaalronde en houdt bij wat er misging. Deze module maakt daar een
 * bron van in de vorm die `bron.js` beschrijft, zodat de render-laag niet hoeft te weten waar de
 * berichten vandaan komen.
 *
 * Deze bron staat vóór de dataset-bron in het register. Is de persona aangesloten, dan wint hij, en
 * er is geen terugval: verzonnen berichten tussen echte zijn voor de bezoeker niet te onderscheiden,
 * dus liever een melding dan een postbus die er echt uitziet maar het niet is.
 *
 * De voortgang komt hier ook vandaan: het stelsel meldt per organisatie hoeveel er bevraagd, klaar
 * en gevonden zijn. Dat zijn echte getallen, waar de dataset-bron een nabootsing tegenover zet.
 */

export function ketenBron(keten, { meldStoring = () => {}, verbergMelding = () => {} } = {}) {
	let uitkomst = null;

	/**
	 * Meldingen van de keten gaan langs dezelfde weg als die van elke andere bron — ook het intrekken
	 * ervan. De keten haalt zijn melding weg na een geslaagde herhaalronde; bleef die staan, dan
	 * vertelt de pagina over ontbrekende berichten die er intussen wél zijn.
	 */
	function geefDoor(melding) {
		if (!melding) {
			verbergMelding();
			return;
		}
		const staat = meldStoring(melding.tekst, melding.soort === "mededeling" ? "info" : "storing");
		if (staat === false) {
			// Het blok is bezet door iets zwaarders. De claim blijft staan en verschijnt zodra dat
			// zwaardere weg is, maar op dit moment weet de bezoeker dit niet — en dat hoort ergens
			// vastgelegd, anders is achteraf niet na te gaan wat hij wél gezien heeft.
			console.warn("[Berichtenbox] Melding van het stelsel wacht achter een zwaardere: " + melding.tekst);
		}
	}

	return {
		naam: "keten",

		/**
		 * Wacht de ronde af. Dat moet: pas daarna is bekend of deze persona aangesloten is, en tot
		 * die tijd zou de dataset-bron erachter hem opeisen.
		 *
		 * Mislukt de ronde voor een persona die aantoonbaar aangesloten is, dan blijft deze bron
		 * toch van toepassing. `laad` werpt dan, en de bezoeker krijgt de melding — geen dataset.
		 */
		async geldtVoor() {
			if (!keten) return false;
			if (!keten.bezig && !keten.aangesloten) return false;

			try {
				uitkomst = await keten.berichten();
				geefDoor(keten.melding);
			} catch (fout) {
				// Het register gaat bij een uitworp door naar de volgende bron, en achteraan staat de
				// dataset die altijd van toepassing is. Voor iemand die aantoonbaar aangesloten is, zou
				// dat verzonnen berichten als zijn post opdienen. Dan liever deze bron opeisen en `laad`
				// laten werpen: dat geeft een melding in plaats van een geloofwaardige leugen.
				console.error("[Berichtenbox] Het bepalen of het stelsel van toepassing is, ging mis.", fout);
				uitkomst = null;
				return !!keten.aangesloten;
			}

			return !!uitkomst || !!keten.aangesloten;
		},

		/**
		 * Meldt hoe ver de ophaalronde is. De render-laag hangt hieraan vóórdat een bron gekozen is:
		 * die keuze valt pas als de ronde klaar is, en dan valt er niets meer te tonen.
		 */
		volgVoortgang(kijker) {
			if (!keten) return;
			if (typeof keten.opWijziging !== "function") {
				// Het script bestaat maar mist zijn vorm: een bedradingsfout. Stil overslaan levert een
				// kijker op die nooit wordt aangeroepen, en dat is later niet terug te vinden.
				console.error("[Berichtenbox] Het keten-script kent geen opWijziging; voortgang blijft onzichtbaar.");
				return;
			}

			// Een kijker die struikelt mag de keten niet meesleuren: aan dezelfde melding hangen ook
			// de andere abonnees. Zelfde afscherming als in dataset-bron.js.
			function meld(voortgang) {
				try {
					kijker(voortgang);
				} catch (fout) {
					console.error("[Berichtenbox] Een kijker op de voortgang van het stelsel struikelde.", fout);
				}
			}

			// De eerste melding kan al geweest zijn voordat deze module bestond; het script draait
			// vóór de module en begint dan meteen op te halen.
			if (keten.voortgang) meld(keten.voortgang);
			keten.opWijziging((toestand) => meld(toestand.voortgang));
		},

		async laad() {
			if (!uitkomst) {
				throw new Error("het ophalen bij het Federatief Berichtenstelsel is mislukt");
			}
			// De keten kent geen mappen; die zijn van de bezoeker en staan in de bewaarde staat.
			return {
				berichten: uitkomst.berichten,
				magazijnen: uitkomst.magazijnen,
				mappen: [],
			};
		},

		/**
		 * Een volgende ronde — de knop "Opnieuw proberen" — levert een nieuwe lijst. Die gaat langs
		 * dezelfde weg als elke andere bronwijziging.
		 */
		start(meld) {
			if (!keten) return;
			if (typeof keten.opWijziging !== "function") {
				console.error("[Berichtenbox] Het keten-script kent geen opWijziging; een volgende ronde blijft onopgemerkt.");
				return;
			}

			keten.opWijziging((toestand) => {
				geefDoor(toestand.melding);

				if (!toestand.uitkomst || toestand.uitkomst === uitkomst) return;
				uitkomst = toestand.uitkomst;

				const mislukt = meld({
					berichten: uitkomst.berichten,
					magazijnen: uitkomst.magazijnen,
					mappen: [],
				});

				// Komen de opgehaalde berichten niet op het scherm, dan hoort de keten dat te weten:
				// die heeft zojuist gemeld dat het ophalen gelukt is.
				if (mislukt && mislukt.length && typeof keten.meldVerwerkingsfout === "function") {
					keten.meldVerwerkingsfout();
				}
			});
		},
	};
}
