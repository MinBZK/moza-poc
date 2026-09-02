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

export function ketenBron(keten, { meldStoring = () => {} } = {}) {
	let uitkomst = null;

	/** Meldingen van de keten gaan langs dezelfde weg als die van elke andere bron. */
	function geefDoor(melding) {
		if (!melding) return;
		meldStoring(melding.tekst, melding.soort === "mededeling" ? "info" : "storing");
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

			uitkomst = await keten.berichten();
			geefDoor(keten.melding);

			return !!uitkomst || !!keten.aangesloten;
		},

		/**
		 * Meldt hoe ver de ophaalronde is. De render-laag hangt hieraan vóórdat een bron gekozen is:
		 * die keuze valt pas als de ronde klaar is, en dan valt er niets meer te tonen.
		 */
		volgVoortgang(kijker) {
			if (!keten || typeof keten.opWijziging !== "function") return;

			// De eerste melding kan al geweest zijn voordat deze module bestond; het script draait
			// vóór de module en begint dan meteen op te halen.
			if (keten.voortgang) kijker(keten.voortgang);
			keten.opWijziging((toestand) => kijker(toestand.voortgang));
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
			if (!keten || typeof keten.opWijziging !== "function") return;

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
