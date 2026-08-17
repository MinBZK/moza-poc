// Genereert de dataset voor de FBS Berichtenbox-mock.
// 10 instanties + echte gemeentes, 120 berichten, 2 voorgevulde mappen.
// Vaste seed zodat dezelfde dataset ontstaat bij elke build (nodig voor reproduceerbare permalinks).

const AANTAL_BERICHTEN = 120;
const AANTAL_ONGELEZEN = 12;

const INSTANTIES = [
	{ id: "belastingdienst", naam: "Belastingdienst" },
	{ id: "kvk", naam: "Kamer van Koophandel" },
	{ id: "rvo", naam: "Rijksdienst voor Ondernemend Nederland" },
	{ id: "svb", naam: "Sociale Verzekeringsbank" },
	{ id: "uwv", naam: "UWV" },
	{ id: "rdw", naam: "RDW" },
	{ id: "cbs", naam: "Centraal Bureau voor de Statistiek" },
	{ id: "ind", naam: "IND" },
	{ id: "ap", naam: "Autoriteit Persoonsgegevens" },
	{ id: "kadaster", naam: "Kadaster" },
	{ id: "nla", naam: "Nederlandse Arbeidsinspectie" },
];

const GEMEENTES = [
	"'s-Gravenhage",
	"Voorburg",
	"Rotterdam",
];

function slugify(naam) {
	return naam
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

// ---- Magazijnen ----
const magazijnen = [
	...INSTANTIES.map((i) => ({ id: i.id, naam: i.naam, type: "instantie" })),
	...GEMEENTES.map((g) => ({
		id: "gem-" + slugify(g),
		naam: `Gemeente ${g}`,
		type: "gemeente",
	})),
];

// ---- Mappen (voorgevuld) ----
const mappen = [
	{ slug: "belastingen-2025", naam: "Belastingen 2025" },
	{ slug: "subsidies", naam: "Subsidies" },
];

// ---- Berichten ----
let seed = 42;
function rnd() {
	seed = (seed * 9301 + 49297) % 233280;
	return seed / 233280;
}
function pick(arr) {
	return arr[Math.floor(rnd() * arr.length)];
}

const ONDERWERPEN = {
	belastingdienst: [
		"Voorlopige aanslag inkomstenbelasting 2025",
		"Btw-aangifte eerste kwartaal beschikbaar",
		"Beschikking kleineondernemersregeling",
		"Vooraankondiging btw-controle",
		"Bevestiging aangifte omzetbelasting",
	],
	kvk: [
		"Bevestiging inschrijving handelsregister",
		"Wijziging bestuurder geregistreerd",
		"Herinnering jaarstukken deponeren",
		"Bevestiging uittreksel aangevraagd",
	],
	rvo: [
		"Subsidie SLIM toegekend",
		"Aanvraag MIT-regeling in behandeling",
		"Beschikking WBSO 2025",
		"Betaalspecificatie subsidie",
	],
	svb: ["Bevestiging AOW-aanvraag", "Wijziging uitkering doorgegeven"],
	uwv: ["Aanvraag WW verwerkt", "Loonheffingskorting gewijzigd"],
	rdw: ["Kenteken overgeschreven", "APK-herinnering bedrijfsauto"],
	cbs: ["Verzoek productie-enquête", "Herinnering statistiek-opgave"],
	ind: ["Besluit aanvraag kennismigrant"],
	ap: ["Melding datalek ontvangen"],
	kadaster: ["Inschrijving eigendomsoverdracht"],
	gemeente: [
		"Aanslag toeristenbelasting",
		"Aanslag reclamebelasting",
		"Vergunning evenement verleend",
		"Bevestiging melding openbare ruimte",
		"Aanslag onroerendezaakbelasting",
		"Besluit ontheffing venstertijden",
		"Besluit terrasvergunning",
		"Parkeervergunning verleend",
		"Handhavingsbesluit reclame-uiting",
		"Melding werkzaamheden openbare weg",
	],
};

function onderwerpVoor(mag) {
	if (mag.type === "gemeente") return pick(ONDERWERPEN.gemeente);
	return pick(ONDERWERPEN[mag.id] || ONDERWERPEN.gemeente);
}

function inhoudVoor(mag, onderwerp) {
	return [
		`Geachte ondernemer,`,
		`Dit bericht van ${mag.naam} betreft "${onderwerp}". De behandeling van dit bericht verloopt volgens de standaardprocedure van de betreffende organisatie.`,
		`Voor vragen over de inhoud kunt u contact opnemen via de bij ${mag.naam} bekende kanalen.`,
	].join("\n\n");
}

// 25 leverende magazijnen: alle instanties + de 15 grootste gemeentes.
const leverendeMagazijnen = [
	...magazijnen.filter((m) => m.type === "instantie"),
	...magazijnen.filter((m) => m.type === "gemeente").slice(0, 15),
];

if (leverendeMagazijnen.length === 0) {
	throw new Error("Geen leverende magazijnen: berichten kunnen niet worden gegenereerd.");
}

function datumVoorIndex(i) {
	const eind = new Date("2026-04-10");
	const dag = new Date(eind);
	dag.setDate(eind.getDate() - Math.floor((i / AANTAL_BERICHTEN) * 180) - Math.floor(rnd() * 4));
	return dag.toISOString().slice(0, 10);
}

// Variant C (A/B/C-test): leidt uit het onderwerp passende directe acties af.
// Werkwoord-gericht, u-vorm, B1 (Schrijfwijzer). Eerste actie is primair (btn-cta).
function actiesVoor(onderwerp) {
	const o = onderwerp.toLowerCase();
	function res(uitleg, acties) { return { actiesUitleg: uitleg, acties: acties }; }
	if (o.includes("aanslag") || o.includes("naheffing")) return res(
		"Betaal het bedrag op tijd. Bent u het niet eens met de aanslag? Dien dan bezwaar in.",
		[{ label: "Direct betalen", primair: true, extern: true }, { label: "Bezwaar indienen", extern: true }, { label: "Uitstel van betaling aanvragen", extern: true }]);
	if (o.includes("aangifte")) return res(
		"Doe de aangifte op tijd. Lukt dat niet? Vraag dan uitstel aan.",
		[{ label: "Aangifte doen", primair: true, extern: true }, { label: "Uitstel aanvragen", extern: true }]);
	if (o.includes("jaarstukken") || o.includes("deponeren")) return res(
		"Deponeer uw jaarstukken vóór de uiterste datum.",
		[{ label: "Jaarstukken deponeren", primair: true, extern: true }, { label: "Uitstel aanvragen", extern: true }]);
	if (o.includes("enquête") || o.includes("statistiek")) return res(
		"Vul de enquête in. Deelname is wettelijk verplicht.",
		[{ label: "Enquête invullen", primair: true, extern: true }, { label: "Uitstel aanvragen", extern: true }]);
	if (o.includes("apk")) return res(
		"Plan de APK-keuring op tijd in, zo voorkomt u een boete.",
		[{ label: "APK inplannen", primair: true, extern: true }]);
	if (o.includes("uittreksel")) return res(
		"Uw uittreksel staat klaar om te downloaden.",
		[{ label: "Uittreksel downloaden", primair: true, extern: true }]);
	if (o.includes("handelsregister") || o.includes("inschrijving")) return res(
		"Controleer of uw gegevens in het Handelsregister nog kloppen.",
		[{ label: "Gegevens controleren", primair: true, extern: true }, { label: "Wijziging doorgeven", extern: true }]);
	if (o.includes("controle") || o.includes("controleer")) return res(
		"Bereid u voor op de controle en lever de gevraagde documenten aan.",
		[{ label: "Bekijken wat u moet doen", primair: true, extern: true }, { label: "Contact opnemen", extern: true }]);
	if (o.includes("wwft") || o.includes("cliëntenonderzoek")) return res(
		"Lees wat het verscherpte cliëntenonderzoek voor u betekent.",
		[{ label: "Meer informatie", primair: true, extern: true }]);
	if (o.includes("avg") || o.includes("cliëntgegevens") || o.includes("persoonsgegevens") || o.includes("datalek")) return res(
		"Lees hoe u persoonsgegevens veilig verwerkt en wat u moet doen.",
		[{ label: "Meer informatie", primair: true, extern: true }]);
	if (o.includes("subsidie") || o.includes("wbso") || o.includes("mit") || o.includes("slim") || o.includes("voucher") || o.includes("s&o")) return res(
		"Bekijk de beschikking en wat dit voor uw onderneming betekent.",
		[{ label: "Beschikking bekijken", primair: true, extern: true }, { label: "Vraag stellen", extern: true }]);
	if (o.includes("vergunning") || o.includes("besluit") || o.includes("beschikking") || o.includes("ontheffing") || o.includes("handhaving")) return res(
		"Bekijk het besluit. Bent u het er niet mee eens? Dien dan bezwaar in.",
		[{ label: "Besluit bekijken", primair: true, extern: true }, { label: "Bezwaar indienen", extern: true }]);
	if (o.includes("aanvraag") || o.includes("verwerkt") || o.includes("behandeling")) return res(
		"Bekijk de status van uw aanvraag.",
		[{ label: "Status bekijken", primair: true, extern: true }]);
	if (o.includes("wijziging") || o.includes("gewijzigd") || o.includes("doorgegeven") || o.includes("overgeschreven") || o.includes("geregistreerd") || o.includes("bevestiging") || o.includes("melding")) return res(
		"Controleer of de gegevens kloppen.",
		[{ label: "Gegevens controleren", primair: true, extern: true }]);
	return res(
		"Bekijk dit bericht en onderneem waar nodig actie.",
		[{ label: "Bericht bekijken", primair: true }, { label: "Reageren" }]);
}

const berichten = [];
for (let i = 0; i < AANTAL_BERICHTEN; i++) {
	const mag = pick(leverendeMagazijnen);
	const onderwerp = onderwerpVoor(mag);
	const isOngelezen = i < AANTAL_ONGELEZEN;
	let map = null;
	if (mag.id === "belastingdienst" && rnd() < 0.7) map = "belastingen-2025";
	else if (mag.id === "rvo" && rnd() < 0.6) map = "subsidies";
	berichten.push({
		id: "msg-" + String(i + 1).padStart(4, "0"),
		magazijnId: mag.id,
		afzender: mag.naam,
		onderwerp,
		inhoud: inhoudVoor(mag, onderwerp),
		datum: datumVoorIndex(i),
		isOngelezen,
		map,
		heeftBijlage: rnd() < 0.4,
		// Variant C (A/B/C-test): uitgebreide uitleg + directe acties. Generiek,
		// afgeleid van het onderwerp, zodat elk bericht in variant C een acties-
		// paneel toont. De vaste Belastingdienst-berichten hieronder hebben eigen,
		// specifieke variant C-teksten.
		variantCInhoud: [
			`Dit bericht van ${mag.naam} gaat over “${onderwerp}”. Hieronder leest u wat dit voor uw onderneming betekent en wat u nu kunt doen.`,
			"Bekijk de details en onderneem waar nodig actie. Hebt u vragen over de inhoud? Neem dan contact op met de afzender.",
		].join("\n\n"),
		...actiesVoor(onderwerp),
	});
}

// Vier vaste Belastingdienst-berichten. Zichtbaar in de MOZa-berichtenbox én
// (na filtering op magazijnId) in de Mijn Belastingdienst-berichtenbox, zodat
// daar genoeg berichten zijn om paginering te tonen.
const belastingdienstMag = magazijnen.find((m) => m.id === "belastingdienst");
[
	{
		onderwerp: "Aangifte vennootschapsbelasting 2025 beschikbaar", datum: "2026-04-22", isOngelezen: true, map: "belastingen-2025", heeftBijlage: true,
		variantCInhoud: [
			"U kunt nu aangifte vennootschapsbelasting over 2025 doen. In deze aangifte geeft u de winst van uw onderneming over het afgelopen jaar op.",
			"Doe de aangifte vóór 1 juni 2026. Hebt u meer tijd nodig? Dan kunt u uitstel aanvragen.",
		].join("\n\n"),
		actiesUitleg: "Doe de aangifte online. U hebt hiervoor de jaarcijfers van uw onderneming nodig.",
		acties: [
			{ label: "Aangifte doen", primair: true, extern: true },
			{ label: "Uitstel aanvragen", extern: true },
		],
	},
	{
		onderwerp: "Naheffingsaanslag omzetbelasting eerste kwartaal 2026", datum: "2026-04-18", isOngelezen: true, map: null, heeftBijlage: true,
		variantCInhoud: [
			"U hebt over het eerste kwartaal van 2026 te weinig btw betaald. Daarom legt de Belastingdienst een naheffingsaanslag op van € 1.284,00.",
			"Betaal dit bedrag vóór 15 mei 2026. Betaalt u niet op tijd, dan komt er rente bij en kunt u een boete krijgen.",
			"Bent u het niet eens met deze aanslag? Dan kunt u binnen 6 weken na de datum van dit bericht bezwaar maken.",
		].join("\n\n"),
		actiesUitleg: "Betaal de aanslag op tijd. Kunt u niet in één keer betalen? Vraag dan uitstel van betaling aan.",
		acties: [
			{ label: "Betalen", primair: true, extern: true },
			{ label: "Bezwaar maken", extern: true },
			{ label: "Uitstel van betaling aanvragen", extern: true },
		],
	},
	{
		onderwerp: "Beschikking uitstel van betaling", datum: "2026-04-12", isOngelezen: false, map: "belastingen-2025", heeftBijlage: false,
		variantCInhoud: [
			"Uw verzoek om uitstel van betaling is toegekend. U krijgt langer de tijd om uw openstaande aanslag te betalen.",
			"U betaalt volgens de betalingsregeling die voor u is vastgesteld. Bekijk de regeling om te zien welke bedragen u wanneer betaalt.",
		].join("\n\n"),
		actiesUitleg: "U hoeft nu niets te doen. Bekijk uw betalingsregeling voor de bedragen en betaaldata.",
		acties: [{ label: "Betalingsregeling bekijken", extern: true }],
	},
	{
		onderwerp: "Herinnering aangifte loonheffingen", datum: "2026-04-05", isOngelezen: false, map: null, heeftBijlage: true,
		variantCInhoud: [
			"U hebt de aangifte loonheffingen over de laatste periode nog niet gedaan. Doe deze aangifte alsnog zo snel mogelijk.",
			"Doe de aangifte vóór 30 april 2026. Doet u dit niet op tijd, dan kunt u een boete krijgen.",
		].join("\n\n"),
		actiesUitleg: "Doe de aangifte alsnog. Lukt dit niet op tijd? Vraag dan uitstel aan.",
		acties: [
			{ label: "Aangifte doen", primair: true, extern: true },
			{ label: "Uitstel aanvragen", extern: true },
		],
	},
].forEach((b, i) => {
	berichten.push({
		id: "msg-" + String(AANTAL_BERICHTEN + i + 1).padStart(4, "0"),
		magazijnId: "belastingdienst",
		afzender: belastingdienstMag.naam,
		onderwerp: b.onderwerp,
		inhoud: inhoudVoor(belastingdienstMag, b.onderwerp),
		datum: b.datum,
		isOngelezen: b.isOngelezen,
		map: b.map,
		heeftBijlage: b.heeftBijlage,
		// Variant C (A/B/C-test): uitgebreide uitleg + directe acties.
		// variantCInhoud vervangt de standaardtekst; eerste actie is primair (btn-cta).
		variantCInhoud: b.variantCInhoud || null,
		actiesUitleg: b.actiesUitleg || null,
		acties: b.acties || null,
	});
});

// Persona-relevante berichten (Aanpak A). Server-gerenderd zodat detailpagina's
// én tellers werken; client-side wordt op basis van relevantVoor gefilterd op de
// actieve persona (zie persoonRelevant in berichtenbox.js). Berichten zonder
// relevantVoor zijn generiek en verschijnen bij iedere persona.
[
	// Bouwmanagement (Bouwnijverheid)
	{ magazijnId: "gem-rotterdam", onderwerp: "Omgevingsvergunning verleend voor uw bouwproject", datum: "2026-04-24", isOngelezen: true, heeftBijlage: true, relevantVoor: ["bouwmanagement"] },
	{ magazijnId: "nla", onderwerp: "Aangekondigde controle op de bouwplaats", datum: "2026-04-21", isOngelezen: true, heeftBijlage: false, relevantVoor: ["bouwmanagement"] },
	{ magazijnId: "rvo", onderwerp: "Subsidie verduurzaming bedrijfspand toegekend", datum: "2026-04-17", isOngelezen: false, heeftBijlage: true, relevantVoor: ["bouwmanagement"] },
	// Bloemenkweker (Landbouw, bosbouw en visserij)
	{ magazijnId: "nla", onderwerp: "Controle arbeidsomstandigheden in de glastuinbouw", datum: "2026-04-23", isOngelezen: true, heeftBijlage: false, relevantVoor: ["bloemenkweker"] },
	{ magazijnId: "rvo", onderwerp: "Openstelling subsidie precisielandbouw", datum: "2026-04-19", isOngelezen: true, heeftBijlage: false, relevantVoor: ["bloemenkweker"] },
	{ magazijnId: "belastingdienst", onderwerp: "Herinnering aangifte loonheffingen", datum: "2026-04-15", isOngelezen: false, heeftBijlage: false, relevantVoor: ["bloemenkweker"] },
	// Activiteiten Coördinator Zorg en Welzijn (Gezondheids- en welzijnszorg)
	{ magazijnId: "ap", onderwerp: "Verwerking van cliëntgegevens onder de AVG", datum: "2026-04-22", isOngelezen: true, heeftBijlage: false, relevantVoor: ["zorgcoordinator"] },
	{ magazijnId: "rvo", onderwerp: "Subsidie gezond en veilig werken beschikbaar", datum: "2026-04-18", isOngelezen: true, heeftBijlage: false, relevantVoor: ["zorgcoordinator"] },
	{ magazijnId: "uwv", onderwerp: "Wijziging in de ziekmeldingsprocedure voor werkgevers", datum: "2026-04-14", isOngelezen: false, heeftBijlage: false, relevantVoor: ["zorgcoordinator"] },
	// Business Development manager (Industrie, ZZP)
	{ magazijnId: "rvo", onderwerp: "Uw S&O-verklaring (WBSO) is beschikbaar", datum: "2026-04-24", isOngelezen: true, heeftBijlage: true, relevantVoor: ["business-development"] },
	{ magazijnId: "kvk", onderwerp: "Controleer uw inschrijving in het Handelsregister", datum: "2026-04-16", isOngelezen: false, heeftBijlage: false, relevantVoor: ["business-development"] },
	// Docent (Onderwijs)
	{ magazijnId: "rvo", onderwerp: "Subsidie praktijkleren: aanvraagperiode geopend", datum: "2026-04-20", isOngelezen: true, heeftBijlage: false, relevantVoor: ["docent"] },
	{ magazijnId: "belastingdienst", onderwerp: "Aangifte inkomstenbelasting voor ondernemers", datum: "2026-04-12", isOngelezen: false, heeftBijlage: true, relevantVoor: ["docent"] },
	// Hondenuitlater en Dierenverzorging (ZZP)
	{ magazijnId: "kvk", onderwerp: "Jaarlijkse controle van uw inschrijving", datum: "2026-04-21", isOngelezen: true, heeftBijlage: false, relevantVoor: ["hondenuitlater"] },
	{ magazijnId: "belastingdienst", onderwerp: "Btw-aangifte eerste kwartaal 2026", datum: "2026-04-13", isOngelezen: false, heeftBijlage: false, relevantVoor: ["hondenuitlater"] },
	// Financial Manager en Accountant (Groothandel)
	{ magazijnId: "belastingdienst", onderwerp: "Verscherpt cliëntenonderzoek (Wwft): wat dit voor u betekent", datum: "2026-04-23", isOngelezen: true, heeftBijlage: true, relevantVoor: ["financial-manager"] },
	{ magazijnId: "rvo", onderwerp: "Voucher mkb-cyberweerbaarheid beschikbaar", datum: "2026-04-17", isOngelezen: false, heeftBijlage: false, relevantVoor: ["financial-manager"] },
].forEach((b) => {
	const mag = magazijnen.find((m) => m.id === b.magazijnId);
	berichten.push({
		id: "msg-" + String(berichten.length + 1).padStart(4, "0"),
		magazijnId: b.magazijnId,
		afzender: mag ? mag.naam : b.magazijnId,
		onderwerp: b.onderwerp,
		inhoud: inhoudVoor(mag, b.onderwerp),
		datum: b.datum,
		isOngelezen: b.isOngelezen,
		map: null,
		heeftBijlage: b.heeftBijlage,
		variantCInhoud: [
			`Dit bericht van ${mag ? mag.naam : b.magazijnId} gaat over “${b.onderwerp}”. Hieronder leest u wat dit voor uw onderneming betekent en wat u nu kunt doen.`,
			"Bekijk de details en onderneem waar nodig actie. Hebt u vragen over de inhoud? Neem dan contact op met de afzender.",
		].join("\n\n"),
		...actiesVoor(b.onderwerp),
		relevantVoor: b.relevantVoor,
	});
});

// Sorteer op datum, nieuwste eerst.
berichten.sort((a, b) => (a.datum < b.datum ? 1 : -1));

// Spreid de berichten over de afzenders. Zonder spreiding staan de nieuwste
// (Belastingdienst-)berichten allemaal bovenaan, waardoor de eerste pagina door
// één organisatie wordt gedomineerd en gebruikers kunnen denken dat ze bij die
// organisatie zijn. Round-robin: neem beurtelings het nieuwste resterende
// bericht per afzender. De buckets staan al op datum (nieuwste eerst) en hun
// onderlinge volgorde volgt het eerste (= nieuwste) voorkomen, dus recente
// berichten blijven vooraan terwijl de afzenders elkaar afwisselen.
const perAfzender = new Map();
for (const b of berichten) {
	if (!perAfzender.has(b.magazijnId)) perAfzender.set(b.magazijnId, []);
	perAfzender.get(b.magazijnId).push(b);
}
const buckets = [...perAfzender.values()];
const gevarieerd = [];
let toegevoegd = true;
while (toegevoegd) {
	toegevoegd = false;
	for (const bucket of buckets) {
		if (bucket.length) {
			gevarieerd.push(bucket.shift());
			toegevoegd = true;
		}
	}
}
berichten.length = 0;
berichten.push(...gevarieerd);

module.exports = {
	magazijnen,
	berichten,
	mappen,
	aantalMagazijnen: magazijnen.length,
	aantalOngelezen: berichten.filter((b) => b.isOngelezen).length,
};
