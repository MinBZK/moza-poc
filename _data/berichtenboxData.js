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
];

const GEMEENTES = [
	"'s-Gravenhage",
	"Voorburg",
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
	});
}

// Vier vaste Belastingdienst-berichten. Zichtbaar in de MOZa-berichtenbox én
// (na filtering op magazijnId) in de Mijn Belastingdienst-berichtenbox, zodat
// daar genoeg berichten zijn om paginering te tonen.
const belastingdienstMag = magazijnen.find((m) => m.id === "belastingdienst");
[
	{ onderwerp: "Aangifte vennootschapsbelasting 2025 beschikbaar", datum: "2026-04-22", isOngelezen: true, map: "belastingen-2025", heeftBijlage: true },
	{ onderwerp: "Naheffingsaanslag omzetbelasting eerste kwartaal 2026", datum: "2026-04-18", isOngelezen: true, map: null, heeftBijlage: true },
	{ onderwerp: "Beschikking uitstel van betaling", datum: "2026-04-12", isOngelezen: false, map: "belastingen-2025", heeftBijlage: false },
	{ onderwerp: "Herinnering aangifte loonheffingen", datum: "2026-04-05", isOngelezen: false, map: null, heeftBijlage: true },
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
	});
});

// Sorteer op datum, nieuwste eerst.
berichten.sort((a, b) => (a.datum < b.datum ? 1 : -1));

module.exports = {
	magazijnen,
	berichten,
	mappen,
	aantalMagazijnen: magazijnen.length,
	aantalOngelezen: berichten.filter((b) => b.isOngelezen).length,
};
