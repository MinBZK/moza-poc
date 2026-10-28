/**
 * Maakt de verhuismelding (_includes/verhuismelding.html) modaal, en houdt haar weg als de
 * bezoeker “Toon deze melding niet meer” aanvinkt.
 *
 * Draait direct na de melding en niet `defer`: wie haar heeft weggezet, ziet haar dan niet eerst
 * even verschijnen. De HTML zet haar met `open` neer, zodat ze ook zonder JavaScript zichtbaar is.
 * Hier wordt ze modaal: de pagina erachter is dan niet bereikbaar met toetsenbord of
 * schermlezer, en Esc sluit haar.
 *
 * Gewoon sluiten geldt voor deze pagina; de volgende toont haar opnieuw. Alleen het vinkje houdt
 * haar weg, in localStorage, zodat “Hard reset” in het Flags-paneel haar terugbrengt. Een
 * persona-wissel laat de sleutel staan: die wist alleen de gegevens van een bedrijf.
 */
(function () {
	var SLEUTEL = "verhuismelding-niet-meer";
	var melding = document.getElementById("verhuismelding");
	if (!melding || typeof melding.showModal !== "function") return;

	try {
		if (localStorage.getItem(SLEUTEL) === "ja") {
			melding.remove();
			return;
		}
	} catch (e) {
		// Geen localStorage (geblokkeerde opslag): dan staat de melding er elke pagina.
	}

	// Het vinkje staat in de HTML op `hidden`: zonder JavaScript zou het niets doen.
	var vinkje = melding.querySelector("[data-verhuismelding-niet-meer]");
	if (vinkje) {
		vinkje.closest("[hidden]").hidden = false;
		vinkje.addEventListener("change", function () {
			try {
				if (vinkje.checked) localStorage.setItem(SLEUTEL, "ja");
				else localStorage.removeItem(SLEUTEL);
			} catch (e) {
				// Niet te bewaren: dan komt de melding op de volgende pagina terug.
			}
		});
	}

	melding.removeAttribute("open");
	melding.showModal();
})();
