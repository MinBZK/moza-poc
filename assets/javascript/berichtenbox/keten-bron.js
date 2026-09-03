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
 *
 * En de berichten die binnenkomen terwijl de bezoeker kijkt: het transport haalt de lijst
 * periodiek opnieuw op, deze module ziet wat erbij gekomen is en meldt dat als losse binnenkomers —
 * dezelfde weg die de dataset-bron voor zijn nagebootste federatie gebruikt. Zo hoeft de
 * render-laag niet te weten of een bericht verzonnen is of echt.
 */

/** Twee lijsten magazijnen zijn hetzelfde als ze dezelfde ids bevatten. */
function gelijkeMagazijnen(vorige, nieuwe) {
	const oud = (vorige || []).map((magazijn) => magazijn.id).sort();
	const nu = (nieuwe || []).map((magazijn) => magazijn.id).sort();
	return oud.length === nu.length && oud.every((id, plek) => id === nu[plek]);
}

/**
 * Wat er bij gekomen is ten opzichte van wat er op het scherm staat.
 *
 * Het ijkpunt is niet de vorige lijst van het transport maar wat de render-laag daarvan werkelijk
 * aangenomen heeft: `getoond`. Die twee lopen uiteen zodra het tonen van een bericht mislukt, en dan
 * hoort dat bericht opnieuw aangeboden te worden — niet als bekend te gelden.
 *
 * Geeft `null` als dit geen aanwas is: er is een bericht verdwenen, of er zijn andere organisaties
 * in beeld. Dan is het een andere lijst en die hoort in één keer op het scherm, niet als een reeks
 * binnenkomers. Een organisatie die erbij komt telt mee: haar naam bereikt de render-laag alleen via
 * een hele lijst, want bij een binnenkomer gaan er geen magazijnen mee.
 *
 * Een lege uitkomst betekent: precies wat er staat, er valt niets te melden.
 */
function aanwasVan(getoond, nieuwe) {
	if (!gelijkeMagazijnen(getoond.magazijnen, nieuwe.magazijnen)) return null;

	const nu = new Set((nieuwe.berichten || []).map((bericht) => bericht.id));
	for (const id of getoond.ids) {
		if (!nu.has(id)) return null;
	}

	return (nieuwe.berichten || []).filter((bericht) => !getoond.ids.has(bericht.id));
}

export function ketenBron(keten, { meldStoring = () => {}, verbergMelding = () => {}, magDruppelen = () => true } = {}) {
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
		 * De inhoud van één bericht, pas opgehaald als de bezoeker het opent.
		 *
		 * De berichtenuitvraag levert kopgegevens; de inhoud blijft bij de organisatie tot iemand
		 * erom vraagt. Dat is geen besparing maar het gedrag van het stelsel, en de detailpagina
		 * hoort het dus ook zo te doen.
		 */
		async inhoudVan(berichtId) {
			if (!keten || typeof keten.inhoudVan !== "function") {
				// Een bedradingsfout, net als bij volgVoortgang en start hieronder. Stil null geven
				// liet de render-laag zeggen dat de organisatie de inhoud niet heeft — terwijl er
				// niets gevraagd is.
				console.error("[Berichtenbox] Het keten-script kent geen inhoudVan; de berichtinhoud is niet op te halen.");
				return { fout: "Wij konden de inhoud van dit bericht niet opvragen. Ververs de pagina om het opnieuw te proberen." };
			}
			return keten.inhoudVan(berichtId);
		},

		/**
		 * Wat er na het eerste laden nog verandert: een herstelronde na een verlopen sessie, en de
		 * berichten die het transport onderweg ophaalt. Beide gaan langs dezelfde weg als elke andere
		 * bronwijziging. Een knop "Opnieuw proberen" is er voor deze bron niet — zie `opnieuw()` in
		 * berichtenbox-keten.js, dat nog op die knop wacht.
		 */
		start(meld) {
			if (!keten) return;
			if (typeof keten.opWijziging !== "function") {
				console.error("[Berichtenbox] Het keten-script kent geen opWijziging; een volgende ronde blijft onopgemerkt.");
				return;
			}

			// Wat er op het scherm staat, en niet wat het transport laatst leverde. Bij het begin is
			// dat de lijst waarmee de render-laag zojuist geladen heeft.
			const getoond = {
				ids: new Set(((uitkomst && uitkomst.berichten) || []).map((bericht) => bericht.id)),
				magazijnen: (uitkomst && uitkomst.magazijnen) || [],
			};

			keten.opWijziging((toestand) => {
				geefDoor(toestand.melding);

				// De vergelijking op identiteit is ook de rem op een lus: de keten meldt een
				// verwerkingsfout langs dezelfde weg terug — `meldVerwerkingsfout` zet een melding, en
				// elke melding gaat naar alle kijkers, deze dus ook. Omdat `uitkomst` hieronder meteen
				// vastgelegd wordt, ziet die her-intreding dezelfde uitkomst en keert hij hier om.
				if (!toestand.uitkomst || toestand.uitkomst === uitkomst) return;

				{
					const nieuwe = toestand.uitkomst;
					uitkomst = nieuwe;

					// Een herhaalde ophaalronde levert een nieuw object met — meestal — dezelfde berichten;
					// het pollen filtert dat zelf al weg. Alleen wat er bij komt is nieuws; de rest zou de
					// lijst laten knipperen om niets.
					const aanwas = aanwasVan(getoond, nieuwe);
					if (aanwas && !aanwas.length) return;

					const mislukt = aanwas && magDruppelen() ? meldBinnenkomers(aanwas) : meldLijst(nieuwe);

					// Komen de opgehaalde berichten niet op het scherm, dan hoort de keten dat te weten:
					// die heeft zojuist gemeld dat het ophalen gelukt is. Wat wél gelukt is, staat
					// intussen in `getoond`, dus die berichten worden niet nog een keer aangeboden en de
					// rest komt terug zodra de lijst weer verandert.
					if (mislukt && mislukt.length) {
						console.error("[Berichtenbox] " + mislukt.length + " bericht(en) uit het stelsel niet getoond.");
						if (typeof keten.meldVerwerkingsfout === "function") keten.meldVerwerkingsfout();
					}
				}
			});

			function meldLijst(nieuwe) {
				const mislukt = meld({
					berichten: nieuwe.berichten,
					magazijnen: nieuwe.magazijnen,
					mappen: [],
				});

				// Alleen bijhouden wat er ook echt staat: bij een mislukte lijst heeft de render-laag
				// teruggedraaid naar de vorige weergave.
				if (!mislukt || !mislukt.length) {
					getoond.ids = new Set((nieuwe.berichten || []).map((bericht) => bericht.id));
					getoond.magazijnen = nieuwe.magazijnen || [];
				}
				return mislukt;
			}

			/**
			 * Eén melding per binnengekomen bericht, oudste eerst.
			 *
			 * De render-laag zet elke binnenkomer bovenaan. Volgden we de lijstvolgorde — het stelsel
			 * levert de nieuwste eerst; wij sorteren die lijst hier niet — dan eindigde de oudste
			 * bovenaan.
			 */
			function meldBinnenkomers(berichten) {
				const oudsteEerst = berichten.slice().reverse();
				for (const bericht of oudsteEerst) {
					const fouten = meld({ nieuwBericht: bericht });
					// Doorgaan zou een lijst opleveren waar er middenin één ontbreekt, en dat is van een
					// volledige lijst niet te onderscheiden. De rest wacht op de volgende wijziging.
					if (fouten && fouten.length) return fouten;
					getoond.ids.add(bericht.id);
				}
				return [];
			}
		},
	};
}
