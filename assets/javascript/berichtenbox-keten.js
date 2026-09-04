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
 * dataset er een is. Vandaar dat hier geen DOM in staat, op één plek na: `paginaGebruiktKeten()`
 * leest het pad van de pagina, want binnen het Belastingdienst-portaal wordt er niet opgehaald.
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

	// De demo-console beantwoordt één vraag: welke persona's kent de keten. Dat hoort in
	// milliseconden te gaan. Vijf seconden was een tijdslimiet die als wachttijd voelde: staat er
	// geen backend, dan wacht élke bezoeker die tijd uit voordat de dataset in beeld komt.
	const DEMO_LIMIET_MS = 1500;
	// Per pagina van de berichtenlijst, want die lijst kost meer dan één verzoek. Daarnaast een
	// budget over de hele reeks: honderd trage pagina's van elk een halve minuut zouden de
	// berichtenbox drie kwartier leeg laten, en zolang wachten doet niemand.
	const LIJST_LIMIET_MS = 30000;
	const LIJST_TOTAAL_LIMIET_MS = 60000;
	// Eén bericht ophalen gaat langs één magazijn, niet langs allemaal. Duurt dat langer dan dit,
	// dan is de bezoeker beter af met de mededeling dan met een blijvend "wordt opgehaald".
	const INHOUD_LIMIET_MS = 10000;
	const STILTE_LIMIET_MS = 30000;

	// De berichtenlijst komt per pagina, en het stelsel kapt een grotere `paginaGrootte` af op
	// honderd: om meer vragen levert er niet meer op (gemeten tegen de test-omgeving van het
	// stelsel; de oudere spec-notitie in `docs/superpowers/plans/2026-08-27-berichtenbox-datalaag.md`
	// noemt nog tweehonderd). Alles ophalen is dus doorbladeren zolang het antwoord een volgende
	// pagina noemt.
	const PAGINA_GROOTTE = 100;
	// Een bovengrens tegen een lijst die niet ophoudt: een stelsel dat op élke pagina een `next`
	// blijft zetten. Ruim genomen: de proeftuinpersona met de meeste post zit rond de achthonderd
	// berichten, dus dit ligt ver boven wat een demonstratie nodig heeft. Wordt hij toch geraakt,
	// dan hoort de bezoeker te weten dat er meer is dan er staat in plaats van het stil af te kappen.
	const MAX_PAGINAS = 100;

	// Hoe lang we wachten op een ronde die een andere pagina al draait, en hoe vaak we tussendoor
	// kijken of de lijst er is. Ruim genomen: een ronde langs vijftien magazijnen duurt seconden,
	// maar een trage organisatie mag hem langer maken zonder dat de bezoeker een melding krijgt.
	const WACHT_OP_RONDE_MS = 45000;
	const WACHT_STAP_MS = 1500;

	// Constructief en handelingsgericht: benoem wat er misging en wat de bezoeker kan doen.
	// Handelingsgericht, en de handeling moet ook kúnnen. "Probeer het opnieuw" stond hier terwijl er
	// geen knop is die dat doet: `opnieuw()` hieronder heeft geen enkele aanroeper. Zolang die knop er
	// niet is, is verversen wat de bezoeker rest — en dat is ook wat de render-laag overal zegt.
	const FOUT_TEKSTEN = {
		onbereikbaar: "Er gaat iets mis met het ophalen van uw berichten bij de bronnen. Ververs de pagina om het opnieuw te proberen.",
		// Twee soorten 409 uit de uitvraag, met verschillende oorzaken en verschillende handelingen.
		// "Worden momenteel al opgehaald": er loopt een ronde voor deze ontvanger — één ontvanger,
		// één ronde tegelijk, bewaakt met een slot in de sessiecache. Twee minuten, want dat is de
		// vangnet-TTL van dat slot (aggregation-lock-ttl=PT2M); blijft een slot staan doordat een pod
		// midden in een ronde herstart, dan is het daarna vanzelf weer vrij.
		bezig: "Uw berichten worden op dit moment al opgehaald. Wacht twee minuten en ververs dan de pagina.",
		// "Zijn nog niet opgehaald": er is geen sessie meer. Anders dan bij de andere meldingen helpt
		// verversen hier echt, want dan draait de ophaalronde opnieuw en zet die de sessie terug.
		geenSessie: "Uw berichten zijn niet meer klaargezet bij het stelsel. Ververs de pagina; dan halen wij ze opnieuw op.",
		afgebroken: "Het ophalen bij de bronnen is halverwege afgebroken. Uw berichten zijn daardoor niet volledig opgehaald. Ververs de pagina om het opnieuw te proberen.",
		// De berichtenlijst komt per pagina. Breekt dat halverwege af, dan is er niets mis bij de
		// bronnen: die hebben hun berichten al klaargezet, en de pagina's ervoor kwamen gewoon binnen.
		// "De bronnen reageren niet meer" zou hier dus een onwaar verhaal vertellen.
		lijstAfgebroken: "Wij konden uw berichtenlijst niet helemaal ophalen. Ververs de pagina om het opnieuw te proberen.",
		// Een pagina zonder leesbare berichtenlijst. Stil overslaan zou een halve postbus als een
		// volledige tonen, en dat is precies wat de bezoeker niet kan zien.
		lijstOnleesbaar: "Wij konden uw berichtenlijst niet goed lezen. Ververs de pagina om het opnieuw te proberen.",
		stil: "De bronnen reageren niet meer. Ververs de pagina om het opnieuw te proberen.",
		verwerking: "Uw berichten zijn wel opgehaald, maar we konden ze niet tonen. Meld dit als het blijft gebeuren.",
		// Geen storing bij een bron maar een onvolledig ingerichte omgeving. Verversen verandert daar
		// per definitie niets aan, dus dat mag hier niet staan.
		configuratie: "Deze proeftuin is niet volledig ingericht, waardoor uw berichten hier niet op te halen zijn. Verversen helpt niet; meld dit bij de beheerder van deze proeftuin.",
		weg: "Wij konden dit bericht niet ophalen bij de organisatie die het stuurde. Ververs de pagina om het opnieuw te proberen, of ga terug naar uw Berichtenbox.",
		// Eén bericht, één organisatie. "De bronnen reageren niet meer" gaat over het hele stelsel en
		// is hier onwaar: de lijst van de bezoeker staat er gewoon.
		traag: "Het ophalen van dit bericht duurde te lang. Ververs de pagina om het opnieuw te proberen.",
	};

	// Geen storing bij een bron, maar een toestand van deze omgeving: er is niets kapot, er valt
	// hier alleen niets op te halen. Toch een melding en geen stilte, want dit raakt alleen wie een
	// testaccount van het stelsel koos, en die krijgt anders de gegenereerde dataset voorgeschoteld
	// als zijn eigen post. Beide teksten zeggen wat er aan de hand is en wat de bezoeker kan doen.
	const STELSEL_TEKSTEN = {
		geenStelsel: "Dit testaccount haalt zijn berichten uit het Federatief Berichtenstelsel. Dat stelsel is in deze omgeving niet beschikbaar, dus wij kunnen uw berichten niet ophalen. Kies een ander testaccount om de berichtenbox met voorbeeldgegevens te bekijken.",
		nietBekend: "Dit testaccount is bij het Federatief Berichtenstelsel niet bekend, dus daar zijn geen berichten voor op te halen. Kies een ander testaccount om de berichtenbox met voorbeeldgegevens te bekijken.",
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
		return { melding: melding, voortgang: voortgang, uitkomst: laatsteUitkomst, aangesloten: aangeslotenBevestigd || hoortBijStelsel() };
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

	// De ronde telde meer berichten dan de lijst teruggaf: onderweg iets kwijtgeraakt. Stil
	// inslikken zou een halve postbus als een volledige presenteren. Sinds de client alle pagina's
	// ophaalt is "meer dan één pagina" geen verklaring meer; blijft dit staan, dan mist er echt iets.
	function toonOnvolledig(getoond, gevonden) {
		// "Probeer het opnieuw" niet: die knop bestaat niet, zoals bij FOUT_TEKSTEN hierboven staat.
		meld("mededeling", "De bronnen vonden " + gevonden + " berichten, maar er zijn er " + getoond + " opgehaald. Ververs de pagina om de rest op te halen.");
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

	/**
	 * Waarom een antwoord mislukte: een ontbrekende omgevingsvariabele, of een bron die zwijgt.
	 *
	 * Allebei een 502, dus aan de status alleen is het niet te zien. De proxy zet daarom op zijn
	 * eigen foutantwoorden `X-Proxy-Configuratie` met de naam van de variabele die ontbreekt. Zonder
	 * dat onderscheid leest een half ingerichte omgeving als een storing bij het stelsel, en krijgt
	 * de bezoeker "ververs de pagina" te zien voor iets wat verversen nooit oplost.
	 */
	function redenVanRespons(respons, wat) {
		const variabele = respons && respons.headers && typeof respons.headers.get === "function" ? respons.headers.get("X-Proxy-Configuratie") : null;
		if (!variabele) return "onbereikbaar";
		console.error("[Berichtenbox] " + wat + " kan niet: " + variabele + " is niet gezet op deze container. Zet die runtime-variabele in de omgeving; verversen helpt niet.");
		return "configuratie";
	}

	// De namen van de aangesloten organisaties, bewaard per ontvanger.
	//
	// `_ophalen` bouwt bij het stelsel de sessie op; daarna levert `GET /api/v1/berichten` die lijst
	// zonder dat er iets opnieuw bevraagd hoeft te worden. Elke berichtenbox-pagina is hier een eigen
	// document — inbox, archief, prullenbak — en die draaiden allemaal hun eigen ronde. Bij een
	// ontvanger met vijftien magazijnen loopt de eerste dan nog wanneer de tweede begint, en dat
	// antwoordt het stelsel terecht met 409: één ontvanger, één ronde tegelijk.
	//
	// Alleen de lijst gebruiken kan niet zomaar: die draagt als `afzender` hetzelfde nummer als
	// `magazijnId`, en de leesbare naam staat uitsluitend in de gebeurtenissen van de ronde. Daarom
	// bewaren we die namen; dan kan een volgende pagina de lijst nemen en toch "Belastingdienst"
	// tonen in plaats van twintig cijfers. sessionStorage en niet localStorage: dit hoort bij deze
	// zitting, net als de sessie bij het stelsel zelf.
	const ORGANISATIES_SLEUTEL = "berichtenbox-keten-organisaties";

	function bewaarOrganisaties(ontvanger, organisaties) {
		if (!ontvanger || !organisaties || !Object.keys(organisaties).length) return;
		try {
			sessionStorage.setItem(ORGANISATIES_SLEUTEL, JSON.stringify({ ontvanger: ontvanger, organisaties: organisaties }));
		} catch (fout) {
			// Geen ramp: zonder deze namen draait de volgende pagina gewoon zijn eigen ronde.
			console.warn("[Berichtenbox] de namen van de organisaties konden niet bewaard worden.", fout);
		}
	}

	function bewaardeOrganisaties(ontvanger) {
		try {
			const rauw = sessionStorage.getItem(ORGANISATIES_SLEUTEL);
			if (!rauw) return null;
			const bewaard = JSON.parse(rauw);
			// Op naam van deze ontvanger, anders zijn het de organisaties van een vorige persona.
			return bewaard && bewaard.ontvanger === ontvanger && bewaard.organisaties ? bewaard.organisaties : null;
		} catch (fout) {
			return null;
		}
	}

	// Waar het ontvanger-cookie voor geldt. Moet het adres dekken dat `bijlageAdres()` in
	// berichtenbox.js bouwt; een test houdt die afspraak vast.
	const ONTVANGER_PAD = "/api/v1/berichten";

	/**
	 * De ontvanger in een cookie, zodat de proxy er een X-Ontvanger-header van kan maken.
	 *
	 * Nodig omdat een `<a href>` en een `<object data>` geen eigen header meesturen: een bijlage is
	 * een gewone URL die de browser zelf ophaalt. Alleen daarvoor; alle aanroepen die dit script
	 * zelf doet, zetten de header gewoon zelf.
	 *
	 * Geen beveiliging — de bezoeker kan dit cookie net zo goed zelf zetten als de header. Het
	 * stelsel houdt zijn eigen controle. Maar de waarde is een identiteit, en die hoort zo weinig
	 * mogelijk mee te reizen. Vandaar drie beperkingen:
	 *
	 * - `path=/api/v1/berichten`: alleen de aanroepen die hem nodig hebben. Met `path=/` ging hij
	 *   mee met élk verzoek naar deze origin, inclusief elk plaatje en elk stylesheet.
	 * - `SameSite=Strict`: nooit mee met een verzoek dat een andere site opwekt.
	 * - `Secure` zodra de pagina over https gaat. Niet onvoorwaardelijk: een browser weigert een
	 *   Secure-cookie op een gewone http-pagina, en dan werken bijlagen lokaal niet meer.
	 *
	 * Geen `Max-Age`, dus een sessiecookie: het leeft zolang de browserzitting duurt. Een vaste
	 * vervaltijd leek zuiniger, maar het cookie wordt alleen bij een paginalading gezet, en de inbox
	 * is een pagina die blijft openstaan — filteren, pagineren en een bericht in een nieuw tabblad
	 * openen laten het oorspronkelijke document en zijn cookie ongemoeid. Na afloop van die
	 * vervaltijd gaf elke bijlage een 400 uit het stelsel, zonder melding, terwijl de brief er nog
	 * gewoon stond: die haalt de ontvanger uit het geheugen van dit script en verloopt nooit.
	 */
	function zetOntvangerCookie(ontvanger) {
		try {
			// Eerst de voorganger op `path=/` opruimen, van een zitting van vóór de versmalling.
			// Niet omdat nginx anders de verkeerde zou pakken — RFC 6265 zet het langste pad eerst,
			// dus het smalle wint — maar omdat het brede cookie anders bij élk verzoek naar deze
			// origin blijft meereizen, en dat is precies wat we hier weghalen.
			document.cookie = "ontvanger=; path=/; SameSite=Strict; Max-Age=0";

			// Rauw, niet ge-encodeerd: nginx geeft de waarde door zoals hij is, en het stelsel
			// verwacht "KVK:12345678". De dubbele punt mag in een cookiewaarde.
			document.cookie = "ontvanger=" + ontvanger + "; path=" + ONTVANGER_PAD + "; SameSite=Strict" + (locatieIsVeilig() ? "; Secure" : "");
		} catch (fout) {
			console.error("[Berichtenbox] De ontvanger kon niet in een cookie; bijlagen zijn niet op te halen.", fout);
		}
	}

	function locatieIsVeilig() {
		return typeof location !== "undefined" && location.protocol === "https:";
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
		if (!respons.ok) throw ketenFout(redenVanRespons(respons, "de testaccounts opvragen"), "testaccounts opvragen mislukt (" + respons.status + ")");

		const lijst = await respons.json();
		if (!Array.isArray(lijst)) throw ketenFout("onbereikbaar", "testaccounts: onverwacht antwoord");

		meldOntbrekendeTestaccounts(lijst);

		return lijst.find((p) => p && p.bron === "keten" && p.ontvanger === "KVK:" + kvkNummer) || null;
	}

	/**
	 * Meldt welke testaccounts het stelsel aanbiedt waarvoor hier geen persona bestaat.
	 *
	 * De persona's staan statisch in `_data/personas.json`, want een persona is meer dan een
	 * ontvanger: er hangen bedrijfsgegevens aan die de pagina Bedrijfsgegevens, het dashboard en de
	 * assistent gebruiken, en die levert het stelsel niet. Die lijst met de hand bijhouden is prima,
	 * zolang je merkt dat er iets bij gekomen is — vandaar deze melding.
	 *
	 * Ontvangers op BSN blijven bewust buiten MOZa: dit is de zakelijke kant, en die schrijft
	 * ondernemingen aan op KVK-nummer. Ze worden apart gemeld, zodat het een keuze blijft en niet
	 * als omissie leest.
	 */
	function meldOntbrekendeTestaccounts(lijst) {
		if (!window.Personas || !Array.isArray(window.Personas.personas)) return;

		const onze = window.Personas.personas.map((p) => (p && p.bedrijf && p.bedrijf.kvkNummer ? "KVK:" + p.bedrijf.kvkNummer : null)).filter(Boolean);
		const ontbreekt = lijst.filter((p) => p && p.bron === "keten" && p.ontvanger && onze.indexOf(p.ontvanger) === -1);
		if (!ontbreekt.length) return;

		const beschrijf = (p) => (p.label || p.id || "naamloos") + " (" + p.ontvanger + ")";
		const opBsn = ontbreekt.filter((p) => p.ontvanger.indexOf("BSN:") === 0);
		const opKvk = ontbreekt.filter((p) => p.ontvanger.indexOf("BSN:") !== 0);

		if (opKvk.length) {
			console.warn("[Berichtenbox] Het stelsel biedt testaccounts waarvoor hier geen persona bestaat: " + opKvk.map(beschrijf).join(", ") + ". Voeg ze toe aan _data/personas.json, anders zijn ze niet te kiezen.");
		}
		if (opBsn.length) {
			console.info("[Berichtenbox] Testaccounts van het stelsel met een BSN-ontvanger, bewust niet als persona overgenomen: " + opBsn.map(beschrijf).join(", ") + ". MOZa is de zakelijke kant en schrijft aan op KVK-nummer.");
		}
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
			// Eén ontvanger, één ronde tegelijk. Dat is geen fout: een andere pagina van deze
			// berichtenbox is bezig, en het resultaat komt in dezelfde sessie terecht. De aanroeper
			// wacht die af in plaats van de bezoeker een storing te tonen.
			throw ketenFout("bezig", "er loopt al een ophaalronde voor deze ontvanger");
		}
		if (!respons.ok) {
			clearTimeout(stilteKlok);
			throw ketenFout(redenVanRespons(respons, "de ophaalronde starten"), "ophalen mislukt (" + respons.status + ")");
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

	/**
	 * Wacht tot de ronde van een andere pagina klaar is, door de lijst te blijven proberen.
	 *
	 * Zolang die ronde loopt heeft de ontvanger nog geen gevulde sessie en antwoordt de lijst met
	 * 409. Dat is hier geen fout maar "nog niet zover". Loopt de wachttijd af, dan gooien we alsnog
	 * `bezig`: dan zegt de melding dat er al opgehaald wordt en dat verversen zo helpt.
	 *
	 * Een 409 hoeft niet van die andere ronde te komen: verloopt de sessie tussen twee pagina's door,
	 * dan zegt de lijst hetzelfde. Het onderscheid is van buitenaf niet te maken, en de handeling is
	 * dezelfde. Elke poging begint weer bij pagina 0 — de vorige pagina's zijn dan van een sessie die
	 * er niet meer is, en die opnieuw ophalen is goedkoper dan ze half met nieuwe mengen.
	 */
	async function wachtOpLijst(ontvanger) {
		const einde = Date.now() + WACHT_OP_RONDE_MS;
		for (;;) {
			await new Promise((klaar) => setTimeout(klaar, WACHT_STAP_MS));
			try {
				return await haalLijst(ontvanger);
			} catch (fout) {
				if (redenVan(fout) !== "geenSessie") throw fout;
				if (Date.now() >= einde) throw ketenFout("bezig", "de ophaalronde van een andere pagina is niet op tijd klaar");
			}
		}
	}

	/**
	 * De hele berichtenlijst, pagina voor pagina.
	 *
	 * Eén antwoord bevat hoogstens honderd berichten; wie meer post heeft, heeft meer pagina's. Een
	 * demonstratie hoort de hele berichtenbox te tonen en niet de eerste honderd, dus blijven we
	 * bladeren zolang het stelsel een volgende pagina noemt.
	 *
	 * Geeft `{ berichten, afgekapt }`. `afgekapt` staat aan als we bij de bovengrens stopten terwijl
	 * er nog een volgende pagina was — dan zegt de berichtenbox erbij dat er meer kan zijn. Elke
	 * andere reden om te stoppen is een fout en werpt: een halve lijst die zich voordoet als een hele
	 * is het ergste wat hier kan gebeuren, want daar is aan het scherm niets van te zien.
	 */
	async function haalLijst(ontvanger) {
		const berichten = [];
		const gezien = new Set();
		const einde = Date.now() + LIJST_TOTAAL_LIMIET_MS;

		for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
			const resterend = einde - Date.now();
			if (pagina > 0 && resterend <= 0) {
				throw ketenFout("lijstAfgebroken", "de berichtenlijst duurde langer dan " + LIJST_TOTAAL_LIMIET_MS + " ms; gestopt na pagina " + pagina);
			}

			const deel = await haalLijstPagina(ontvanger, pagina, resterend);

			// Een pagina zonder leesbare `berichten` is geen einde maar een fout. Als lege pagina
			// behandelen zou de lijst hier afkappen en `afgekapt: false` teruggeven — een halve
			// postbus, gepresenteerd als een volledige, met alleen een regel in de console.
			if (!deel || !Array.isArray(deel.berichten)) {
				throw ketenFout("lijstOnleesbaar", "pagina " + pagina + " van de berichtenlijst had geen `berichten`-array");
			}

			// De pagina's komen uit een sessie die een andere pagina van deze berichtenbox nog kan
			// vullen. Groeit die lijst tussen twee verzoeken, dan schuiven berichten over de
			// paginagrens en zien we er een twee keer. Ontdubbelen op berichtId houdt de lus
			// herhaalbaar; dat berichten dan ook overgeslagen kunnen zijn valt hier niet te zien, dus
			// dat gaat naar de console en niet naar de bezoeker.
			let dubbel = 0;
			for (const bericht of deel.berichten) {
				const id = bericht && bericht.berichtId;
				if (id && gezien.has(id)) {
					dubbel++;
					continue;
				}
				if (id) gezien.add(id);
				berichten.push(bericht);
			}
			if (dubbel > 0) {
				console.warn("[Berichtenbox] " + dubbel + " bericht(en) kwamen op twee pagina's voor; de lijst groeide tijdens het ophalen.");
			}

			// Een lege pagina is het einde, ook als er nog een `next` naast staat: nog een ronde langs
			// hetzelfde antwoord levert niets nieuws op.
			if (deel.berichten.length === 0 || !heeftVolgende(deel)) return { berichten: berichten, afgekapt: false };
		}
		return { berichten: berichten, afgekapt: true };
	}

	/**
	 * Wijst dit antwoord naar een volgende pagina?
	 *
	 * Het adres in `next` volgen we niet — we bouwen het zelf uit het paginanummer, zodat een
	 * antwoord ons niet ergens anders heen kan sturen. Dat veronderstelt wel dat `pagina=N` blijft
	 * betekenen wat `next` bedoelt; wordt dat ooit een cursor, dan moet dit mee.
	 *
	 * Alleen de vorm die het stelsel nu levert telt als "er is meer". Staat er een `next` in een
	 * andere vorm — een kale string bijvoorbeeld — dan stopt de lus hier, en dat mag de bezoeker niet
	 * stil overkomen: die krijgt de lijst die er dan staat te zien alsof het alles is.
	 */
	function heeftVolgende(deel) {
		if (!deel || !deel._links || !deel._links.next) return false;
		if (typeof deel._links.next.href === "string") return true;
		console.warn("[Berichtenbox] `_links.next` in een onbekende vorm; het bladeren stopt hier.", deel._links.next);
		return false;
	}

	/**
	 * Eén pagina van de berichtenlijst.
	 *
	 * `resterend` is wat er van het budget voor de hele reeks over is; de tijdslimiet van deze pagina
	 * is de kleinste van de twee. Zo kan één trage pagina het geheel niet alsnog laten uitlopen.
	 *
	 * Een fout ná de eerste pagina krijgt een eigen reden. De teksten van `stil` en `onbereikbaar`
	 * gaan over de bronnen, en die hebben hier niets misdaan: de ophaalronde was klaar en de vorige
	 * pagina's kwamen gewoon binnen. `geenSessie` blijft wél zichzelf — daar hangt het herstel aan
	 * vast, in de `bekend`-tak en in `wachtOpLijst`.
	 */
	async function haalLijstPagina(ontvanger, pagina, resterend) {
		try {
			return await lijstPaginaOp(ontvanger, pagina, resterend);
		} catch (fout) {
			if (pagina === 0 || redenVan(fout) === "geenSessie") throw fout;
			console.error("[Berichtenbox] de berichtenlijst brak af op pagina " + pagina, fout);
			throw ketenFout("lijstAfgebroken", "pagina " + pagina + " van de berichtenlijst kwam niet binnen");
		}
	}

	async function lijstPaginaOp(ontvanger, pagina, resterend) {
		const adres = "/api/v1/berichten?pagina=" + pagina + "&paginaGrootte=" + PAGINA_GROOTTE;
		const limiet = Math.min(LIJST_LIMIET_MS, Math.max(resterend, 1));
		const respons = await metTijdslimiet(adres, { headers: { "X-Ontvanger": ontvanger } }, limiet);
		// De uitvraag levert de lijst uit een sessie die de ophaalronde vult. Is die er niet meer —
		// het slot verlopen, de sessie opgeruimd — dan antwoordt hij met 409, en dat is geen storing
		// bij een bron maar een toestand die met verversen over gaat.
		if (respons.status === 409) throw ketenFout("geenSessie", "de sessie met opgehaalde berichten bestaat niet meer");
		if (!respons.ok) throw ketenFout(redenVanRespons(respons, "de berichtenlijst ophalen"), "berichten laden mislukt (" + respons.status + ")");
		return respons.json();
	}

	/**
	 * De inhoud van één bericht.
	 *
	 * De berichtenuitvraag levert alleen de kopgegevens — afzender, onderwerp, datum. De inhoud en
	 * de bijlagen staan achter een eigen adres per bericht, en worden dus pas opgehaald wanneer de
	 * bezoeker het bericht opent. Dat is niet alleen zuinig: het is ook wat er in een federatief
	 * stelsel gebeurt, waar de inhoud bij de organisatie zelf blijft tot iemand erom vraagt.
	 */
	async function haalInhoud(ontvanger, berichtId) {
		const respons = await metTijdslimiet("/api/v1/berichten/" + encodeURIComponent(berichtId), { headers: { "X-Ontvanger": ontvanger } }, INHOUD_LIMIET_MS);

		// Een 404 zegt niet wat wij zouden willen dat hij zegt. Hij kan betekenen dat het bericht er
		// niet meer is, maar net zo goed dat deze backend de route niet kent, dat een ingress iets
		// anders routeert, of dat het bericht niet aan déze ontvanger toekomt — en die header is in
		// de browser aan te passen.
		//
		// Er is geen afgesproken kenmerk om die gevallen uit elkaar te houden. Op het woord
		// "bericht" in `type` of `title` afgaan leek een verfijning, maar elke `type`-URI van deze
		// resource bevat dat woord, en de RFC-standaard `{"type":"about:blank","title":"Not Found"}`
		// bevat het juist niet. Dat is schijnzekerheid in twee richtingen tegelijk.
		//
		// Dus zeggen we wat we wél weten. Zodra het stelsel een kenmerk aanbiedt dat "ingetrokken"
		// van "onbereikbaar" scheidt, kan het onderscheid terug — zie de open vraag in CLAUDE.md.
		if (respons.status === 404) throw ketenFout("weg", "bericht niet geleverd (404: " + berichtId + ")");
		if (!respons.ok) throw ketenFout(redenVanRespons(respons, "de inhoud van dit bericht ophalen"), "berichtinhoud laden mislukt (" + respons.status + ")");

		const bericht = await respons.json();
		return {
			inhoud: typeof bericht.inhoud === "string" ? bericht.inhoud : "",
			bijlagen: Array.isArray(bericht.bijlagen) ? bericht.bijlagen : [],
		};
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

	// Elke berichtenbox-pagina draait zijn eigen ronde — zie de toelichting bij de start hieronder.
	// Dat geldt ook voor een detailpagina: zonder ronde is er geen ontvanger, en dan valt de inhoud
	// van een bericht niet op te vragen.

	// --- Persona ------------------------------------------------------------------------------

	// personas.js draait vóór dit bestand en bepaalt de actieve persona (?persona= > localStorage >
	// actief). Die volgorde hier herhalen zou stil uit de pas kunnen lopen.
	/**
	 * Bestaat deze persona alleen om het stelsel mee te bekijken?
	 *
	 * Staat in `_data/personas.json` als `stelsel: true`. Nodig omdat de demo-console het antwoord
	 * schuldig blijft zodra ze onbereikbaar is, en er dan niets is om op te staan: de dataset-bron
	 * achteraan neemt het over en dient gegenereerde post op als de post van dit account. Voor een
	 * gewone persona is dat juist wél de bedoeling, dus het verschil moet ergens vastliggen — en het
	 * `proeftuin-`-voorvoegsel in de id is geen afspraak die code hoort te lezen.
	 */
	function hoortBijStelsel() {
		if (!window.Personas || typeof window.Personas.actief !== "function") return false;
		const persona = window.Personas.actief();
		return !!(persona && persona.stelsel);
	}

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

	// Zelfde weg als meldStoring, andere aanleiding: hier ging niets mis, hier is niets te halen.
	function meldStelsel(sleutel) {
		verbergVoortgang();
		meld("storing", STELSEL_TEKSTEN[sleutel]);
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
			// Een ontbrekende variabele is geen storing en geen ontbrekend stelsel: de omgeving is
			// half ingericht. "Kies een ander testaccount" zou hier een rondje sturen, want geen
			// enkel testaccount gaat het doen.
			if (redenVan(fout) === "configuratie") {
				mislukt(fout);
				return null;
			}
			// Een testaccount van het stelsel heeft geen dataset achter zich die klopt. Zwijgen zou
			// hier de post van een ander opdienen zonder dat iemand het kan zien.
			if (hoortBijStelsel()) {
				console.warn("[Berichtenbox] demo-console niet bereikbaar voor een testaccount van het stelsel.", fout);
				meldStelsel("geenStelsel");
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
				// Hier is de console er wél, en zegt ze nee. Voor een testaccount van het stelsel is dat
				// geen storing maar een antwoord, en het verklaart een lege berichtenbox.
				if (hoortBijStelsel()) {
					console.warn("[Berichtenbox] de demo-omgeving kent dit testaccount van het stelsel niet.", kvkNummer);
					meldStelsel("nietBekend");
					return null;
				}
				verbergVoortgang();
				return null;
			}

			aangeslotenBevestigd = true;
			ontvangerVanRonde = aangesloten.ontvanger;
			zetOntvangerCookie(aangesloten.ontvanger);

			// De sessie bij het stelsel is van de ontvanger en niet van deze pagina. Kennen we de
			// organisaties van een eerdere ronde in deze zitting, dan is die sessie er waarschijnlijk
			// nog en volstaat de lijst — geen tweede ronde, geen 409, en geen voortgangsbalk voor
			// werk dat al gedaan is. Is de sessie tóch weg, dan zegt de lijst dat met een 409 en
			// draaien we alsnog een ronde.
			const bekend = bewaardeOrganisaties(aangesloten.ontvanger);
			if (bekend) {
				try {
					lijst = await haalLijst(aangesloten.ontvanger);
					uitvraag = { organisaties: bekend, stil: [], gevonden: null };
				} catch (fout) {
					if (redenVan(fout) !== "geenSessie") throw fout;
					lijst = null;
				}
			}

			if (!lijst) {
				try {
					uitvraag = await haalOp(aangesloten.ontvanger);
					bewaarOrganisaties(aangesloten.ontvanger, uitvraag.organisaties);
					lijst = await haalLijst(aangesloten.ontvanger);
				} catch (fout) {
					if (redenVan(fout) !== "bezig") throw fout;
					// Een andere pagina van deze berichtenbox draait de ronde al — twee tabbladen die
					// tegelijk opengaan, bijvoorbeeld. Het resultaat komt in dezelfde sessie terecht,
					// dus wachten levert de bezoeker precies wat hij zocht. Een storingsmelding zou
					// hier zeggen dat er iets kapot is terwijl het werk gewoon loopt.
					lijst = await wachtOpLijst(aangesloten.ontvanger);
					uitvraag = { organisaties: bewaardeOrganisaties(aangesloten.ontvanger) || {}, stil: [], gevonden: null };
				}
			}
		} catch (fout) {
			mislukt(fout);
			return null;
		}

		// Vanaf hier is het ophalen gelukt en kan het alleen nog misgaan in onze eigen verwerking.
		// "Probeer het later opnieuw" helpt daar niet tegen, dus dat krijgt een eigen tekst.
		try {
			// `haalLijst` voegde de pagina's al samen, ontdubbelde ze en wierp op alles wat geen
			// leesbare lijst was. Wat hier binnenkomt is dus altijd een array.
			const ruw = lijst.berichten;

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

			if (lijst.afgekapt) {
				// Het aantal dat er écht staat, niet de bovengrens van de client: de lus stopt op een
				// paginatelling, dus `MAX_PAGINAS * PAGINA_GROOTTE` zou een getal noemen dat de bezoeker
				// nergens terugziet.
				meld("mededeling", "Er worden " + berichten.length.toLocaleString("nl-NL") + " berichten getoond. Mogelijk heeft u er meer dan hier staan.");
				// `gevonden` is alleen bekend na een eigen ophaalronde. Kwam de lijst uit een sessie die
				// een andere pagina vulde, dan staat er `null`, en `berichten.length < null` is altijd
				// onwaar: die vergelijking mag niet stilzwijgend voor "alles is er" doorgaan.
			} else if (typeof uitvraag.gevonden === "number" && berichten.length < uitvraag.gevonden) {
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
	//
	// En alleen voor een persona die het stelsel gebruikt. Dat is geen besparing maar iets dat de
	// bezoeker merkt: de ronde begint met één vraag aan de demo-console, en staat die niet klaar dan
	// hángt dat verzoek tot de tijdslimiet in plaats van te weigeren. Anderhalve seconde waarin de
	// bron nog niet gekozen kan worden en er dus geen lijst staat — en omdat elke tab een eigen
	// pagina is, kwam die wachttijd bij elke tabwissel terug, voor persona's die het stelsel niet
	// eens gebruiken.
	//
	// De prijs staat er tegenover: hiermee is `_data/personas.json` de autoriteit over wie het
	// stelsel gebruikt, en niet meer de demo-console. Kent die straks een nummer dat hier niet als
	// `stelsel` gemerkt is, dan vragen we er niet naar en krijgt die persona de dataset.
	const kvkNummer = window.berichtenboxData && paginaGebruiktKeten() && hoortBijStelsel() ? actiefKvkNummer() : null;

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

		/**
		 * Is deze persona op de keten aangesloten?
		 *
		 * Twee bronnen, en beide tellen. De demo-console bevestigt het — dat is het bewijs. Het
		 * persona-bestand zegt het vooraf. Dat tweede is nodig omdat een onbereikbare console geen
		 * bewijs oplevert, en de bron dan geen grond heeft om deze persona op te eisen; de dataset
		 * neemt het over en de bezoeker ziet niet dat dit niet zijn post is.
		 *
		 * Binnen dit bestand blijft `aangeslotenBevestigd` het strengere begrip: dat beslist of een
		 * verdwenen ontvanger een storing is of een normale eerste ronde.
		 */
		get aangesloten() {
			return aangeslotenBevestigd || hoortBijStelsel();
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

		/**
		 * De inhoud van één bericht, of null als er niets op te halen valt.
		 *
		 * Werpt niet: de aanroeper is de detailpagina, en die moet iets kunnen tonen. Wat er misging
		 * komt terug als `{ fout }` met een tekst voor de bezoeker, zodat een leeg bericht nooit
		 * zonder uitleg op het scherm belandt.
		 */
		inhoudVan: async function (berichtId) {
			// Zonder ronde is er geen ontvanger, en zonder ontvanger geen adres om het bij op te
			// halen. Voor de aanroeper is dat iets anders dan "de organisatie heeft niets": er is
			// niets gevraagd. Dat verschil moet zichtbaar blijven, anders staat er straks een
			// uitspraak over een organisatie die nooit iets gevraagd is.
			if (!ontvangerVanRonde || !berichtId) {
				console.warn("[Berichtenbox] Geen ontvanger van een ophaalronde; de inhoud is niet op te vragen.", berichtId);
				return { fout: "Wij konden de inhoud van dit bericht niet opvragen. Ververs de pagina om het opnieuw te proberen." };
			}

			try {
				return await haalInhoud(ontvangerVanRonde, berichtId);
			} catch (fout) {
				// "stil" heet hier "traag": dat is de tijdslimiet van één bericht bij één organisatie,
				// niet het stelsel dat er als geheel mee ophoudt.
				const reden = redenVan(fout) === "stil" ? "traag" : redenVan(fout);
				console.error("[Berichtenbox] berichtinhoud ophalen mislukt", fout);
				return { fout: FOUT_TEKSTEN[reden] || FOUT_TEKSTEN.onbereikbaar };
			}
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
		 * Draait de ophaalronde opnieuw. Bedoeld voor een "Opnieuw proberen"-knop bij de melding — die
		 * knop bestaat nog niet, dus dit heeft op dit moment geen aanroeper. Bewaard omdat de knop er
		 * hoort te komen; zolang dat niet zo is, zeggen de teksten hierboven "ververs de pagina".
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
