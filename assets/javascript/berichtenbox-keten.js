/**
 * berichtenbox-keten.js
 *
 * Haalt de berichten voor een aangesloten persona op uit het Federatief Berichtenstelsel, in
 * plaats van uit de gegenereerde dataset. Welke persona aangesloten is zegt de demo-omgeving
 * (/api/demo/personas); staat de actieve persona daar niet bij, dan blijft de dataset staan.
 *
 * Alleen lezen: markeren, verplaatsen en verwijderen blijven op de bestaande localStorage-state.
 *
 * Dit bestand blokkeert de berichtenbox niet. Het draait vóór berichtenbox.js en herstelt daar
 * synchroon een eerdere ophaalronde uit localStorage (zodat archief, prullenbak en de
 * detailpagina's hun berichten vinden). Een nieuwe ophaalronde loopt asynchroon; berichtenbox.js
 * rendert eerst de dataset en neemt de keten-berichten over via window.Berichtenbox.ketenOvername.
 *
 * Er is geen stille terugval. Lukt het ophalen niet voor een persona die aantoonbaar aangesloten
 * is, dan verdwijnt de dataset-lijst en zegt de melding boven de lijst wat er misging; anders zou
 * een bezoeker verzonnen berichten voor echte aanzien. "Niet aangesloten" mag wél stil blijven —
 * dat is voor de meeste persona's de normale, juiste uitkomst.
 *
 * Let op: de ontvanger gaat als header `X-Ontvanger` mee en is in de browser aan te passen. Dit is
 * geen authenticatie, net zomin als `X-Test-User` bij de Digitale Assistent; de keten-backend moet
 * zijn eigen allowlist hanteren. Aanvaardbaar voor een gesloten testgroep met fictieve gegevens.
 */
(function () {
	"use strict";

	const CACHE_KEY = "berichtenbox-keten";

	// De demo-console is een kleine lijst en hoort meteen te antwoorden. De berichtenlijst mag wat
	// langer duren. De ophaalronde zelf krijgt geen harde limiet maar een stiltebewaking: een ronde
	// langs tientallen organisaties mag lang duren, stilte niet.
	// De berichtenlijst komt in één antwoord. Zit hij aan dit maximum, dan is er waarschijnlijk meer
	// dan we tonen; dat hoort de bezoeker te weten in plaats van het stil af te kappen.
	const LIJST_GROOTTE = 200;

	const DEMO_LIMIET_MS = 5000;
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

	// --- Meldingen ----------------------------------------------------------------------------

	// Geen eigen opmaak: de berichtenbox heeft al meldingsblokken voor deze gevallen. Wij vullen de
	// tekst-slots en zetten het blok aan of uit.
	function toonFout(reden) {
		const blok = document.querySelector("[data-geen-bronnen]");
		if (!blok) {
			// Zonder blok is er niets te melden en zou de vlag alleen de demo-meldingen smoren.
			console.error("[Berichtenbox] geen meldingsblok op deze pagina; storing blijft onzichtbaar:", reden);
			return;
		}
		meldingActief = true;

		const tekst = blok.querySelector("[data-geen-bronnen-tekst]");
		if (tekst) tekst.textContent = FOUT_TEKSTEN[reden] || FOUT_TEKSTEN.onbereikbaar;
		blok.hidden = false;
	}

	// Het waarschuwingsblok boven de lijst. De standaardtekst gaat over één bron die zojuist uitviel;
	// wij schrijven de zin zelf, want het kan ook om meerdere bronnen of om een onvolledige lijst
	// gaan. `nadruk` komt in het bestaande <b>, zodat de opmaak dezelfde blijft.
	function toonWaarschuwing(voor, nadruk, na) {
		const blok = document.querySelector("[data-bron-uitval]");
		if (!blok) return;

		const alinea = blok.querySelector("[data-bron-uitval-tekst]");
		const naamEl = blok.querySelector("[data-bron-uitval-naam]");
		if (!alinea || !naamEl) return;

		meldingActief = true;
		naamEl.textContent = nadruk;
		alinea.replaceChildren(document.createTextNode(voor), naamEl, document.createTextNode(na));
		blok.hidden = false;
	}

	// Organisaties die tijdens de ronde niet antwoordden.
	function toonUitval(namen) {
		if (namen.length > 1) {
			toonWaarschuwing(
				"Deze organisaties waren tijdens het ophalen niet bereikbaar: ",
				namen.join(", "),
				". Berichten van deze organisaties ontbreken mogelijk."
			);
		} else {
			toonWaarschuwing(
				"",
				namen[0],
				" was tijdens het ophalen niet bereikbaar. Berichten van deze organisatie ontbreken mogelijk."
			);
		}
	}

	// De ronde telde meer berichten dan de lijst teruggaf: meer dan één pagina, of onderweg iets
	// kwijtgeraakt. Stil inslikken zou een halve postbus als een volledige presenteren.
	function toonOnvolledig(getoond, gevonden) {
		toonWaarschuwing(
			"De bronnen vonden ",
			gevonden + " berichten",
			", maar er zijn er " + getoond + " opgehaald. Probeer het opnieuw om de rest op te halen."
		);
	}

	function verbergMeldingen() {
		meldingActief = false;
		["[data-geen-bronnen]", "[data-bron-uitval]"].forEach((kiezer) => {
			const blok = document.querySelector(kiezer);
			if (blok) blok.hidden = true;
		});
	}

	// --- Voortgang ----------------------------------------------------------------------------

	// Zolang er wordt opgehaald hoort de server-gerenderde lijst niet in beeld: dat zijn andere
	// berichten dan die straks binnenkomen. De lege-staat en de paginanavigatie gaan mee naar
	// verborgen — anders zegt de pagina "u heeft nog geen berichten" terwijl ze onderweg zijn.
	//
	// Terugzetten doen we alleen voor de lijst zelf. Of de lege-staat en de paginanavigatie erbij
	// horen hangt af van wat er ná het ophalen in de lijst staat; dat bepaalt berichtenbox.js bij
	// het renderen. Hier onvoorwaardelijk zichtbaar maken zou "u heeft geen berichten" tonen boven
	// een volle lijst.
	function zetLijstZichtbaar(zichtbaar) {
		const lijst = document.querySelector("[data-berichtenbox-list]");
		if (lijst) lijst.hidden = !zichtbaar;

		if (zichtbaar) {
			// berichtenbox.js weet wat er nú in de lijst staat en zet de lege-staat, de
			// paginanavigatie en zijn eigen meldingen daarop terug. Vóór de eerste render is dit
			// een no-op, dus het is veilig op elk pad.
			if (window.Berichtenbox && typeof window.Berichtenbox.herstelLijstWeergave === "function") {
				window.Berichtenbox.herstelLijstWeergave();
			}
			return;
		}

		["[data-berichtenbox-pagination]", "[data-berichtenbox-empty]"].forEach((kiezer) => {
			const el = document.querySelector(kiezer);
			if (el) el.hidden = true;
		});
	}

	// De berichtenbox heeft een eigen voortgangsblok met slots voor "x van y bronnen" en het aantal
	// gevonden berichten. Onze ophaalronde levert precies die gegevens per organisatie, dus vullen
	// we dat blok in plaats van zelf iets te tekenen. Net als de demo-animatie verbergen we de
	// lijst zolang de ronde loopt: anders staat "Berichten worden opgehaald…" boven een volle
	// tabel met heel andere berichten. Het totaal groeit mee — hoeveel organisaties er bevraagd
	// worden blijkt pas uit de stroom zelf.
	function toonVoortgang(bevraagd, klaar, gevonden) {
		const blok = document.querySelector("[data-berichtenbox-progress]");
		if (!blok) return;

		zetLijstZichtbaar(false);
		blok.hidden = false;

		const slot = (kiezer, waarde) => {
			const el = blok.querySelector(kiezer);
			if (el) el.textContent = waarde;
		};
		slot("[data-berichtenbox-progress-source]", klaar);
		slot("[data-berichtenbox-progress-total]", bevraagd);
		slot("[data-berichtenbox-progress-found]", gevonden);

		const balk = blok.querySelector("[data-berichtenbox-progress-bar]");
		if (balk) balk.style.inlineSize = (bevraagd ? Math.round((klaar / bevraagd) * 100) : 0) + "%";

		// "1 bronnen" en "1 berichten" staan er anders; berichtenbox.js kent de meervoudsregels.
		if (window.Berichtenbox && typeof window.Berichtenbox.werkMeervoudBij === "function") {
			window.Berichtenbox.werkMeervoudBij();
		}
	}

	function verbergVoortgang(houdLijstVerborgen) {
		const blok = document.querySelector("[data-berichtenbox-progress]");
		if (blok) blok.hidden = true;
		zetLijstZichtbaar(!houdLijstVerborgen);
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
			lezer.cancel().catch(() => { /* stroom al dicht */ });
		}

		// Een stroom die eindigt zonder "ophalen-gereed" is afgebroken. Die zou een halve lijst als
		// volledig presenteren, dus accepteren we hem niet.
		if (!gereed) {
			throw ketenFout("afgebroken", "de ophaalronde brak af na " + klaar + " van " + Object.keys(organisaties).length + " organisaties");
		}

		return { organisaties: organisaties, stil: stil, gevonden: gevonden };
	}

	async function haalLijst(ontvanger) {
		const respons = await metTijdslimiet(
			"/api/v1/berichten?paginaGrootte=" + LIJST_GROOTTE,
			{ headers: { "X-Ontvanger": ontvanger } },
			LIJST_LIMIET_MS
		);
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

	// De detailpagina's en archief/prullenbak worden client-side uit dezelfde dataset gevuld. Zonder
	// cache zouden die opnieuw een hele ophaalronde moeten draaien om één bericht te tonen.
	//
	// Bewust localStorage en geen sessionStorage: `state.gearchiveerd` en `state.verwijderd` staan
	// óók in localStorage en verwijzen naar deze berichtIds. Raakte de cache eerder kwijt dan de
	// state, dan toonde het archief "u heeft nog niets gearchiveerd" naast een tabbadge van 3.
	function schrijfCache(ontvanger, berichten, magazijnen) {
		try {
			localStorage.setItem(CACHE_KEY, JSON.stringify({ ontvanger, berichten, magazijnen }));
		} catch (e) {
			console.error("[Berichtenbox] keten-cache niet te bewaren; detailpagina's vinden hun bericht straks niet.", e);
		}
	}

	function leesCache(ontvanger) {
		try {
			const rauw = localStorage.getItem(CACHE_KEY);
			if (!rauw) return null;
			const cache = JSON.parse(rauw);
			if (!cache || cache.ontvanger !== ontvanger) return null;
			if (!Array.isArray(cache.berichten) || !Array.isArray(cache.magazijnen)) return null;
			return cache;
		} catch (e) {
			console.error("[Berichtenbox] keten-cache onleesbaar; er wordt opnieuw opgehaald.", e);
			return null;
		}
	}

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
	function paginaStartRonde() {
		return paginaGebruiktKeten() && !!document.querySelector("[data-berichtenbox-list]:not([data-berichtenbox-view])");
	}

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

	// Zodra er één ronde geslaagd is staan er echte berichten op het scherm. Die blijven staan als
	// een herhaling mislukt: ze zijn niet verzonnen, alleen niet vers.
	let echteLijstOpScherm = false;

	function meldStoring(reden) {
		// De gegenereerde dataset is voor een aangesloten persona aantoonbaar niet zijn post en
		// blijft dus niet staan. Een eerder opgehaalde échte lijst blijft wél staan.
		verbergVoortgang(aangeslotenBevestigd && !echteLijstOpScherm);
		verbergMeldingen();
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
			verbergVoortgang(false);
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
				verbergVoortgang(false);
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

			const berichten = ruw
				.filter(bruikbaar)
				.map((bericht) => naarBerichtenboxVorm(bericht, uitvraag.organisaties));
			const overgeslagen = ruw.length - berichten.length;
			if (overgeslagen > 0) {
				console.error("[Berichtenbox] " + overgeslagen + " bericht(en) zonder berichtId overgeslagen.");
			}

			const magazijnen = Object.keys(uitvraag.organisaties).map((id) => ({
				id: id,
				naam: uitvraag.organisaties[id],
				type: "instantie",
			}));

			schrijfCache(ontvangerVanRonde, berichten, magazijnen);

			// De tellers boven de lijst tonen zelf hoeveel bronnen antwoordden; alleen een
			// onvolledige lijst of een organisatie die niet reageerde heeft een eigen melding nodig.
			verbergVoortgang(false);
			verbergMeldingen();
			echteLijstOpScherm = true;

			if (ruw.length >= LIJST_GROOTTE) {
				toonWaarschuwing(
					"Er worden maximaal ",
					LIJST_GROOTTE + " berichten",
					" getoond. Mogelijk heeft u meer berichten dan hier staan."
				);
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

	// berichtenbox.js bouwt de rijen. Struikelt dat over één bericht, dan blijft de bezoeker anders
	// met een half gevulde lijst zonder waarschuwing zitten.
	function neemOver(uitkomst) {
		if (!window.Berichtenbox || typeof window.Berichtenbox.ketenOvername !== "function") return;
		try {
			window.Berichtenbox.ketenOvername(uitkomst.berichten, uitkomst.magazijnen);
		} catch (fout) {
			console.error("[Berichtenbox] opgehaalde berichten niet te tonen", fout);
			echteLijstOpScherm = false;
			meldStoring("verwerking");
		}
	}

	// --- Start --------------------------------------------------------------------------------

	// Alleen op pagina's die een berichtenbox tonen: elders is er niets te vervangen, en zou een
	// persona zonder kvkNummer alleen console-ruis opleveren.
	const kvkNummer = (window.berichtenboxData && paginaGebruiktKeten()) ? actiefKvkNummer() : null;
	const startRonde = !!kvkNummer && paginaStartRonde();

	// Synchroon, vóór berichtenbox.js: staat de vorige ophaalronde nog in de cache, dan draait de
	// berichtenbox meteen op de keten-berichten. Op de inbox slaan we dat over — daar wordt toch
	// opnieuw opgehaald, en een oude lijst tonen om hem meteen te vervangen helpt niemand.
	if (kvkNummer && !startRonde) {
		const cache = leesCache("KVK:" + kvkNummer);
		if (cache) {
			window.berichtenboxData.berichten = cache.berichten;
			window.berichtenboxData.magazijnen = cache.magazijnen;
			ontvangerVanRonde = cache.ontvanger;
			aangeslotenBevestigd = true;
			echteLijstOpScherm = true;
		}
	}

	if (startRonde) {
		// De server-gerenderde lijst staat al in beeld en hoort daar niet te blijven staan terwijl
		// wordt opgehaald: dat zijn andere berichten dan die straks binnenkomen.
		toonVoortgang(0, 0, 0);
		ronde = draaiRonde(kvkNummer);
	}

	window.BerichtenboxKeten = {
		/**
		 * Loopt er een ophaalronde? berichtenbox.js houdt dan de demo-simulatie stil tot die ronde
		 * iets zegt: geen voortgangsanimatie, geen binnendruppelende berichten, geen bronuitval.
		 */
		get bezig() { return ronde !== null; },

		/**
		 * Staat er een melding van de keten op het scherm? Dan mag de demo-simulatie die niet
		 * overschrijven — dat zou de bezoeker de gegenereerde dataset als echte post voorschotelen.
		 */
		get meldingActief() { return meldingActief; },

		/** Is deze persona aantoonbaar aangesloten op de keten? */
		get aangesloten() { return aangeslotenBevestigd; },

		/**
		 * Roept `terugmelding` aan zodra de ophaalronde klaar is: met {berichten, magazijnen} bij
		 * een geslaagde ronde, en met null wanneer er niets over te nemen valt (niet aangesloten,
		 * of een storing waarvoor de melding al staat). Werpt nooit.
		 */
		dan: function (terugmelding) {
			if (!ronde) {
				terugmelding(null);
				return;
			}
			ronde.then(terugmelding, function (fout) {
				console.error("[Berichtenbox] onverwachte fout in de ophaalronde", fout);
				meldStoring("verwerking");
				terugmelding(null);
			});
		},

		/**
		 * Meldt dat opgehaalde berichten niet getoond konden worden. Voor berichtenbox.js, dat de
		 * rijen bouwt en daarbij kan struikelen over een bericht met een onverwachte vorm.
		 */
		meldStoring: function () {
			echteLijstOpScherm = false;
			meldStoring("verwerking");
		},

		/**
		 * Draait de ophaalronde opnieuw en geeft het resultaat rechtstreeks aan berichtenbox.js.
		 * Hangt onder de "Opnieuw proberen"-knop van de keten-melding. Alleen het kvk-nummer is
		 * nodig: draaiRonde vraagt de ontvanger zelf opnieuw op, zodat de knop ook werkt wanneer de
		 * vorige poging al bij de demo-omgeving strandde. Geeft false als er niets te herhalen valt.
		 */
		opnieuw: function () {
			if (!kvkNummer) return false;

			verbergMeldingen();
			// Meteen laten zien dat er iets gebeurt; de demo-omgeving mag er vijf seconden over doen.
			toonVoortgang(0, 0, 0);
			ronde = draaiRonde(kvkNummer);
			ronde.then(function (uitkomst) {
				if (uitkomst) neemOver(uitkomst);
			}, function (fout) {
				console.error("[Berichtenbox] onverwachte fout in de ophaalronde", fout);
				meldStoring("verwerking");
			});
			return true;
		},
	};
})();
