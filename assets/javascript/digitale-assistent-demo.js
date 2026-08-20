/**
 * digitale-assistent-demo.js
 *
 * Het draaiboek achter de Demo-modus van de Digitale Assistent.
 *
 * De backend praat met de chat via Server-Sent Events (status, tool, case,
 * answer, error). Dit bestand levert diezelfde events, alleen dan uit een
 * script in plaats van uit een model. digitale-assistent.js verwerkt ze via
 * hetzelfde renderpad als een echte beurt, dus wat u in demo-modus ziet is wat
 * de gebruiker live ook krijgt: het deelverzoek, de energiekaart, de
 * vraagformulieren, de aangemaakte zaak en de foutmelding.
 *
 * Er zit bewust geen model of willekeur in: een demo die elke keer hetzelfde
 * doet, is te gebruiken in gebruikersonderzoek en in een presentatie.
 *
 * Een scenario is een reeks beurten. `kies()` geeft de events van de beurt
 * terug waar het gesprek nu staat en zet de teller een stap verder. De teller
 * (`stand`) leeft in digitale-assistent.js en wordt gewist bij "Nieuw gesprek".
 */

(function () {
	"use strict";

	// Dezelfde KvK-nummers als de allowlist van de backend (TEST_KVK_NUMMERS).
	// Een persona daarbuiten hoort ook in de demo "log eerst in" te krijgen —
	// als gewoon antwoord, niet als foutmelding.
	var KVK_TOEGESTAAN = ["85234567", "62345681", "56789012"];

	// De demo doet alsof alle bronnen bereikbaar zijn: zonder backend zou
	// /health falen en zou de statuslijst vijf keer "niet bereikbaar" tonen.
	// Dat leest als storing, terwijl er niets stuk is.
	var HEALTH = {
		servers: { regelrecht: "verbonden", rvo: "verbonden", netbeheerder: "verbonden", kvk: "verbonden", koop: "verbonden" },
		cli: { regelrecht: "verbonden", rvo: "verbonden", netbeheerder: "verbonden", kvk: "verbonden", koop: "verbonden" },
	};

	// Normaal komen deze grenzen uit RegelRecht (/regelrecht/definities). Zonder
	// backend zou de energiekaart de waarden zonder grens-annotatie tonen, en
	// juist die annotatie is het punt van de kaart.
	var DREMPEL = { kwh: 50000, gas: 25000 };

	// Verbruik voor een persona zonder eigen `bedrijf.energie` in personas.json.
	// Bewust boven de drempel: anders loopt de hoofdroute van de demo dood.
	var VERBRUIK_STANDAARD = { elektriciteitKwh: 61250, gasM3: 9800 };

	// De Wallet-credential zoals de netbeheerder-mock hem afgeeft. Het verbruik en
	// de houder komen van de actieve persona, zodat de kaart niet de cijfers van
	// een ander bedrijf toont dan de rest van het prototype.
	function walletData(bedrijf) {
		var energie = (bedrijf && bedrijf.energie) || VERBRUIK_STANDAARD;
		return {
			beschikbaar: true,
			credential: {
				type: "EnergieverbruikAttestatie",
				uitgegeven_door: "Stedin (demo)",
				houder: { kvk_nummer: (bedrijf && bedrijf.kvkNummer) || "" },
				peiljaar: 2025,
			},
			toestemming: { gedeeld_via: "EU Business Wallet (demo)", met_toestemming_ondernemer: true },
			verbruik: {
				totaal: {
					jaarlijks_elektriciteitsverbruik_kwh: Number(energie.elektriciteitKwh) || 0,
					jaarlijks_gasverbruik_m3: Number(energie.gasM3) || 0,
				},
				aansluitingen: [],
			},
		};
	}

	function getal(waarde) {
		return Number(waarde || 0).toLocaleString("nl-NL");
	}

	// Bronvermelding gaat als gestructureerde lijst mee (`bronnen` in het
	// answer-event), niet als markdown in de antwoordtekst: de chat rendert het
	// dan met het eigen bronnenpatroon (label, titel, datum van raadpleging) in
	// plaats van als kale opsomming.
	var BRONNEN_ENERGIE = [
		{ label: "KOOP Regelingenbank", titel: "Besluit activiteiten leefomgeving, artikel 5.15", url: "https://wetten.overheid.nl/BWBR0041330/" },
		{ label: "RVO", titel: "Informatieplicht energiebesparing: rapportagetermijn", url: "https://www.rvo.nl/onderwerpen/informatieplicht-energiebesparing" },
	];

	// De Business Wallet is in dit prototype een mock; er is geen pagina om naar te
	// verwijzen. Zonder `url` toont de chat de naam zonder link.
	var BRONNEN_WALLET = [{ label: "Business Wallet", titel: "Energieverbruik-attestatie, afgegeven door uw netbeheerder" }];

	var BRONNEN_KVK = [{ label: "KvK Handelsregister", titel: "Uittreksel onderneming: rechtsvorm, SBI-code en vestiging", url: "https://www.kvk.nl/handelsregister/" }];

	function stap(wacht, event, data) {
		return { wacht: wacht, event: event, data: data };
	}

	function antwoord(wacht, message, extra) {
		var data = { message: message, session_id: "demo-sessie" };
		if (extra)
			Object.keys(extra).forEach(function (k) {
				data[k] = extra[k];
			});
		return stap(wacht, "answer", data);
	}

	// --- Scenario: energiebesparingsinformatieplicht -------------------------
	// De langste route, en de enige waarin alle patronen voorkomen: toestemming
	// vragen vóór het raadplegen van een bron, een geverifieerde credential,
	// twee soorten vraagformulier en een zaak die bij de RVO wordt ingediend.

	function energieBeurten(bedrijf) {
		var wallet = walletData(bedrijf);
		var totaal = wallet.verbruik.totaal;
		var kwh = totaal.jaarlijks_elektriciteitsverbruik_kwh;
		var m3 = totaal.jaarlijks_gasverbruik_m3;
		var boven = kwh > DREMPEL.kwh || m3 > DREMPEL.gas;
		var verbruikszin = "U gebruikt " + getal(kwh) + " kWh elektriciteit en " + getal(m3) + " m³ aardgas per jaar.";

		// Blijft de persona onder beide drempels, dan houdt het hier op: de demo
		// hoort niet iets te rapporteren wat niet hoeft.
		if (!boven) {
			var geenPlicht = [stap(600, "status", { message: "netbeheerder__zoek_aansluiting" }), energieToolStap(wallet), stap(900, "status", { message: "regelrecht__toets" }), antwoord(1100, verbruikszin + " Daarmee blijft u onder beide grenzen, dus de informatieplicht geldt niet voor uw bedrijf. U hoeft niets te rapporteren.\n\nGaat u meer verbruiken, dan kan de plicht alsnog gaan gelden.", { bronnen: BRONNEN_WALLET.concat(BRONNEN_ENERGIE) })];
			var vervolg = [antwoord(900, "Wilt u weten welke energiebesparende maatregelen u vrijwillig kunt nemen?")];
			return [energieDeelverzoekBeurt(), geenPlicht, vervolg];
		}

		return [
			// Beurt 1: uitleg + deelverzoek. Nog geen enkele bron geraadpleegd.
			energieDeelverzoekBeurt(),
			// Beurt 2: toestemming gegeven → credential ophalen + eerste formulier.
			[
				stap(600, "status", { message: "netbeheerder__zoek_aansluiting" }),
				energieToolStap(wallet),
				stap(900, "status", { message: "regelrecht__toets" }),
				antwoord(1100, verbruikszin + " Daarmee komt u boven de grens, dus de informatieplicht geldt voor uw bedrijf. U rapporteert uiterlijk 1 december 2026 bij de RVO.\n\nWelke maatregelen voor u gelden, hangt af van wat er in uw bedrijf aanwezig is. Kies hieronder de onderdelen die bij u voorkomen.", {
					bronnen: BRONNEN_WALLET.concat(BRONNEN_ENERGIE),
					vraag: {
						titel: "Wat is er in uw bedrijf aanwezig?",
						intro: "De erkende maatregelenlijst kent achtentwintig categorieën. U ziet alleen de categorieën die bij uw keuze horen.",
						bron: "RegelRecht",
						velden: [
							{
								naam: "AANWEZIGE_CATEGORIEEN",
								label: "Onderdelen in uw bedrijf",
								type: "categorieen",
								groepen: [
									{ onderdeel: "Gebouwen", opties: ["Ruimteverwarming", "Verlichting", "Isolatie van de schil", "Warm tapwater"] },
									{ onderdeel: "Faciliteiten", opties: ["Koeling en vriezen", "Ventilatie", "Liften en roltrappen"] },
									{ onderdeel: "Processen", opties: ["Perslucht", "Pompen", "Warmteterugwinning"] },
								],
							},
						],
					},
				}),
			],
			// Beurt 3: maatregelenlijst. Eén maatregel is voorgevuld uit een eerdere
			// registratie; de toelichting zegt waarop dat is gebaseerd, zodat de
			// ondernemer het kan weerspreken.
			[
				stap(700, "status", { message: "regelrecht__maatregelen" }),
				antwoord(1200, "Op basis van uw antwoorden gelden 5 erkende maatregelen voor uw bedrijf. Geef per maatregel aan of u die al heeft uitgevoerd.", {
					bronnen: BRONNEN_ENERGIE,
					vraag: {
						titel: "Erkende Maatregelenlijst (EML 2023)",
						intro: "Deze maatregelen horen bij de categorieën die u koos.",
						tekst: "Geef per maatregel aan of deze is uitgevoerd.",
						bron: "RegelRecht",
						velden: [
							{ naam: "GC1", label: "GC1 – Pas een klokregeling toe en regel deze in (ruimteverwarming)", type: "radio", opties: ["Uitgevoerd", "Niet uitgevoerd"] },
							{ naam: "GC3", label: "GC3 – Pas een weersafhankelijke regeling toe", type: "radio", opties: ["Uitgevoerd", "Niet uitgevoerd"] },
							{
								naam: "GF4",
								label: "GF4 – Vervang gloei-, halogeen- en spaarlampen door LED-lampen",
								type: "radio",
								opties: ["Uitgevoerd", "Niet uitgevoerd"],
								waarde: "Uitgevoerd",
								toelichting: "Alvast ingevuld op basis van uw subsidieaanvraag van 4 maart 2026. Klopt dit niet, wijzig het dan.",
							},
							{ naam: "FD3", label: "FD3 – Pas nachtafdekking toe bij semi-verticale koelmeubels", type: "radio", opties: ["Uitgevoerd", "Niet uitgevoerd"] },
							{ naam: "FD7", label: "FD7 – Isoleer de wanden van koelcellen om warmte buiten te houden", type: "radio", opties: ["Uitgevoerd", "Niet uitgevoerd"] },
						],
					},
				}),
			],
			// Beurt 4: rapportage indienen → case-event, dus een zaak in Lopende zaken.
			[
				stap(700, "status", { message: "rvo__rapportage_indienen" }),
				stap(1200, "case", {
					data: {
						organisatie: "Rijksdienst voor Ondernemend Nederland",
						onderwerp: "Rapportage informatieplicht energiebesparing",
						referentienummer: "RVO-2026-DEMO-0041",
						status: "In behandeling",
						ingediend_op: "2026-08-20",
						zaak_type: "Rapportage",
					},
				}),
				antwoord(800, "Uw rapportage is ingediend bij de RVO onder referentienummer RVO-2026-DEMO-0041. U hoort binnen vijf werkdagen of de rapportage compleet is.\n\nDe maatregelen die u nog niet heeft uitgevoerd, blijven verplicht. Uw omgevingsdienst houdt daar toezicht op.", { bronnen: BRONNEN_ENERGIE }),
			],
			// Beurt 5 en verder: het scenario is uit, maar het gesprek loopt door.
			[antwoord(900, "De rapportage staat klaar in Lopende zaken. Wilt u nog iets weten over de maatregelen die nog openstaan, of over de termijn?")],
		];
	}

	// De eerste beurt en het tool-event staan apart: beide routes hierboven
	// beginnen hetzelfde, want of de plicht geldt weet de assistent pas ná het
	// raadplegen van de Wallet — en dus pas na toestemming.
	function energieDeelverzoekBeurt() {
		return [
			stap(700, "status", { message: "koop__zoek_regeling" }),
			stap(1100, "status", { message: "regelrecht__toets" }),
			antwoord(900, "De energiebesparingsinformatieplicht geldt voor bedrijven die per jaar meer dan " + getal(DREMPEL.kwh) + " kWh elektriciteit of " + getal(DREMPEL.gas) + " m³ aardgas gebruiken. Om dat voor u uit te rekenen heb ik uw energieverbruik nodig.\n\nUw netbeheerder heeft dat verbruik als verklaring in uw Business Wallet gezet. Ik haal het pas op nadat u daar toestemming voor geeft.", {
				bronnen: BRONNEN_ENERGIE,
				toestemming_nodig: {
					bron: "uw Business Wallet",
					omschrijving: "De assistent wil uw energieverbruik-attestatie gebruiken, afgegeven door uw netbeheerder. Er wordt niets opgehaald voordat u akkoord geeft.",
				},
			}),
		];
	}

	function energieToolStap(wallet) {
		return stap(1000, "tool", {
			tool: "netbeheerder__verbruik",
			message: "netbeheerder__verbruik",
			data: wallet,
			provenance: { source: "EU Business Wallet (demo)", issuer: "Stedin (demo, uitgever)" },
		});
	}

	// --- Scenario: bedrijfsgegevens bekijken --------------------------------
	// Kort, en laat zien dat de toestemmingspoort niet alleen over de Wallet
	// gaat: ook het Handelsregister wordt pas geraadpleegd na akkoord.

	function bedrijfsgegevensBeurten(bedrijf) {
		bedrijf = bedrijf || {};
		var sbi = (bedrijf.sbi && bedrijf.sbi[0]) || null;
		// Alleen regels tonen die de persona ook echt heeft: een uittreksel met
		// lege velden zou de indruk wekken dat er gegevens ontbreken bij de KvK.
		var regels = [
			["Naam", bedrijf.handelsnaam],
			["KvK-nummer", bedrijf.kvkNummer],
			["Rechtsvorm", bedrijf.rechtsvorm],
			["SBI-code", sbi ? sbi.code + " – " + sbi.omschrijving : ""],
			["Vestiging", bedrijf.vestigingsadresVolledig || bedrijf.vestigingsadres],
			["Datum inschrijving", bedrijf.startdatum],
		]
			.filter(function (r) {
				return r[1];
			})
			.map(function (r) {
				return "- **" + r[0] + ":** " + r[1];
			})
			.join("\n");

		return [
			[
				antwoord(900, "Uw bedrijfsgegevens staan in het Handelsregister van de KvK. Ik kan ze voor u ophalen, maar doe dat pas nadat u toestemming geeft.", {
					toestemming_nodig: {
						bron: "het KvK Handelsregister",
						omschrijving: "De assistent wil uw naam, rechtsvorm, SBI-code en vestigingsadres ophalen uit het Handelsregister. Er wordt niets opgehaald voordat u akkoord geeft.",
					},
				}),
			],
			[stap(700, "status", { message: "kvk__zoek_onderneming" }), antwoord(1100, "Dit staat er over uw onderneming in het Handelsregister:\n\n" + regels + "\n\nKloppen deze gegevens niet, dan wijzigt u ze bij de KvK.", { bronnen: BRONNEN_KVK })],
			[antwoord(900, "Wilt u dat ik nog iets anders opzoek over uw onderneming?")],
		];
	}

	// --- Scenario: belastingaangifte voorbereiden ---------------------------
	// Laat het vraagformulier met gemengde veldtypen zien: een keuze en een
	// open veld in hetzelfde formulier.

	function belastingBeurten(bedrijf) {
		bedrijf = bedrijf || {};
		var btwRegel = bedrijf.omzetbelastingnummer ? "\n- uw omzetbelastingnummer " + bedrijf.omzetbelastingnummer : "\n- uw omzetbelastingnummer";
		return [
			[
				antwoord(1000, "Ik help u de aangifte omzetbelasting voorbereiden. Daarvoor heb ik twee dingen van u nodig.", {
					vraag: {
						titel: "Aangifte omzetbelasting voorbereiden",
						intro: "Uw antwoorden bepalen welke termijn en welke velden voor u gelden.",
						bron: "RegelRecht",
						velden: [
							{ naam: "KWARTAALAANGIFTE", label: "Doet u aangifte per kwartaal?", type: "radio", opties: ["Ja", "Nee"] },
							{ naam: "BUITENLANDSE_OMZET", label: "Levert u goederen of diensten aan klanten buiten Nederland?", type: "radio", opties: ["Ja", "Nee"] },
							{ naam: "omzet", label: "Wat was uw omzet over het laatste kwartaal (in euro)?", type: "tekst" },
						],
					},
				}),
			],
			[stap(700, "status", { message: "regelrecht__toets" }), antwoord(1100, "Dank u. Uw aangifte over het derde kwartaal van 2026 moet uiterlijk **31 oktober 2026** binnen zijn bij de Belastingdienst.\n\nWat u klaarzet:\n\n- het overzicht van uw omzet en de btw die u in rekening bracht\n- de btw die u zelf betaalde over inkopen" + btwRegel + "\n\nDe aangifte zelf doet u in Mijn Belastingdienst Zakelijk. Ik kan er niet namens u een indienen.")],
			[antwoord(900, "Wilt u dat ik de termijn als herinnering in uw Lopende zaken zet?")],
		];
	}

	// --- Losse demonstraties -------------------------------------------------

	function foutmelding() {
		return [stap(900, "error", { message: "De assistent kan RegelRecht op dit moment niet bereiken. Probeer het over een paar minuten opnieuw." })];
	}

	function nietIngelogd() {
		return [antwoord(900, "Ik kan uw gegevens nog niet ophalen, omdat u niet bent ingelogd. Log eerst in met eHerkenning. Daarna kan ik uw bedrijfsgegevens en uw verbruik voor u opzoeken.")];
	}

	// "Niet delen" mag het draaiboek niet vooruit schuiven: anders zou de demo de
	// gegevens alsnog tonen die de gebruiker net weigerde, en dat is precies de
	// belofte die het deelverzoek doet.
	function geweigerd() {
		return [antwoord(900, "Begrijpelijk. Ik raadpleeg die bron niet. Zonder die gegevens kan ik niet voor u uitrekenen of de regel geldt.\n\nU kunt de gegevens zelf opzoeken bij de organisatie die ze beheert, of het deelverzoek alsnog goedkeuren door uw vraag opnieuw te stellen.")];
	}

	function uitleg() {
		return [antwoord(1100, "In gewone woorden: de vragen hierboven komen uit de erkende maatregelenlijst. Op die lijst staan maatregelen waarvan de overheid al heeft vastgesteld dat ze zich binnen vijf jaar terugverdienen.\n\nPer maatregel geeft u aan of u die al heeft uitgevoerd. Twijfelt u? Kies dan “Niet uitgevoerd”. U mag later melden dat u de maatregel alsnog heeft genomen.\n\nHet formulier blijft staan, dus u kunt het nu invullen.")];
	}

	function algemeen() {
		return [stap(700, "status", { message: "koop__zoek_regeling" }), antwoord(1100, "In de demo-modus praat de assistent niet met een model, maar speelt die een vast draaiboek af. Probeer een van deze vragen om een volledige route te zien:\n\n- Geldt de energiebesparingsinformatieplicht voor mij?\n- Hoe kan ik mijn bedrijfsgegevens bekijken?\n- Hoe bereid ik mijn belastingaangifte voor?\n\nTyp “fout” om te zien wat er gebeurt als een bron niet bereikbaar is.")];
	}

	// Elk scenario is een functie van het bedrijf van de actieve persona: de demo
	// hoort de gegevens te tonen die de rest van het prototype ook toont, niet die
	// van een ander bedrijf.
	var SCENARIOS = {
		energie: energieBeurten,
		bedrijfsgegevens: bedrijfsgegevensBeurten,
		belasting: belastingBeurten,
	};

	function herkenScenario(bericht) {
		if (/energie|informatieplicht|besparing|verbruik|eml|maatregel/i.test(bericht)) return "energie";
		if (/bedrijfsgegeven|handelsregister|\bkvk\b|inschrijving|sbi/i.test(bericht)) return "bedrijfsgegevens";
		if (/belasting|aangifte|\bbtw\b|omzetbelasting|fiscaal/i.test(bericht)) return "belasting";
		return null;
	}

	/**
	 * Geeft de events van deze beurt terug.
	 *
	 * @param {string} bericht  Wat de gebruiker verstuurde.
	 * @param {object} stand    { scenario, beurt } — leeft in de chat, wordt gewist bij een nieuw gesprek.
	 * @param {object} context  { kvkNummer, bedrijf } van de actieve persona.
	 * @returns {Array} stappen: [{ wacht, event, data }]
	 */
	function kies(bericht, stand, context) {
		bericht = String(bericht || "");
		context = context || {};

		// Een persona buiten de allowlist krijgt bij de backend geen gegevens,
		// en hier dus ook niet. Het blijft een antwoord en geen foutmelding: er
		// is niets stuk, de gebruiker is alleen niet ingelogd.
		if (context.kvkNummer && KVK_TOEGESTAAN.indexOf(context.kvkNummer) === -1) return nietIngelogd();

		if (/^leg mij dit uit/i.test(bericht)) return uitleg();
		if (/geen toestemming/i.test(bericht)) return geweigerd();
		if (/\b(fout|storing|error|onbereikbaar)\b/i.test(bericht)) return foutmelding();

		// Een nieuw onderwerp start een nieuw scenario; een vervolgbeurt (een
		// antwoord op een formulier, of "Ja, ik geef toestemming") houdt het
		// lopende scenario vast — die woorden zeggen niets over het onderwerp.
		var herkend = herkenScenario(bericht);
		if (herkend && herkend !== stand.scenario) {
			stand.scenario = herkend;
			stand.beurt = 0;
		}
		if (!stand.scenario) return algemeen();

		var beurten = SCENARIOS[stand.scenario](context.bedrijf);
		var index = Math.min(stand.beurt, beurten.length - 1);
		stand.beurt = index + 1;
		return beurten[index];
	}

	window.MozaDemoScript = {
		kies: kies,
		health: HEALTH,
		drempel: DREMPEL,
		walletData: walletData,
	};
})();
