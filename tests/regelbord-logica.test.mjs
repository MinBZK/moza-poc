import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const bord = require("../assets/javascript/regelbord-logica.js");
const vraagModule = require("../assets/javascript/assistent-vraag.js");

const REGELS = [
	{ id: "milieubeheer", titel: "Wet milieubeheer: rapportageplicht energiebesparing", beschrijving: "Energie", inhoud: ["kWh aardgas koelinstallatie"], geldtVoor: "Ondernemingen met hoog energieverbruik", bron: "Rijksoverheid", inwerkingtreding: "1 juli 2023", regelrechtRegel: "omgevingswet/energiebesparing/informatieplicht" },
	{ id: "upv", titel: "Uitgebreide producentenverantwoordelijkheid verpakkingen", beschrijving: "Verpakkingen", inhoud: ["recycling"], geldtVoor: "Retailers", bron: "Rijksoverheid", inwerkingtreding: "1 juli 2027" },
	{ id: "arbowet", titel: "Arbowet: RI&E", beschrijving: "Veilig werken", inhoud: ["risico-inventarisatie"], geldtVoor: "Werkgevers", bron: "SZW", inwerkingtreding: "1 januari 2020" },
];
const SUBSIDIES = [{ id: "isde", titel: "Investeringssubsidie Duurzame Energie (ISDE)", beschrijving: "Warmtepomp", inhoud: ["zonneboiler"], verstrekker: "RVO", aanvraagperiode: "Tot 31 december 2026" }];
const PERSONA = { bedrijf: { kvkNummer: "62345681" }, regelgeving: ["milieubeheer", "upv", "onbekend-id"], subsidies: ["isde"] };
const VANDAAG = new Date("2026-08-27");

test("parseDatum leest een Nederlandse datum", () => {
	assert.equal(bord.parseDatum("1 juli 2026").toISOString().slice(0, 10), "2026-07-01");
	assert.equal(bord.parseDatum("onzin"), null);
	assert.equal(bord.parseDatum(""), null);
});

test("kaartenVoor levert regels en subsidies van de persona, onbekende ids overgeslagen", () => {
	const kaarten = bord.kaartenVoor(PERSONA, REGELS, SUBSIDIES);
	assert.deepEqual(
		kaarten.map((k) => k.id),
		["milieubeheer", "upv", "isde"]
	);
	assert.equal(kaarten[2].soort, "subsidie");
});

test("voorstelKolom: toekomstige inwerkingtreding is Komt eraan", () => {
	const [, upv] = bord.kaartenVoor(PERSONA, REGELS, SUBSIDIES);
	assert.equal(bord.voorstelKolom(upv, { vandaag: VANDAAG, zaken: [], verborgenTitels: new Set() }), "komt-eraan");
});

test("voorstelKolom: ingediende zaak is Afgerond, lopende zaak is Mee bezig", () => {
	const [milieu] = bord.kaartenVoor(PERSONA, REGELS, SUBSIDIES);
	const ctx = (status) => ({ vandaag: VANDAAG, verborgenTitels: new Set(), zaken: [{ onderwerp: "Informatieplicht energiebesparing", regelId: "milieubeheer", status }] });
	assert.equal(bord.voorstelKolom(milieu, ctx("ingediend")), "afgerond");
	assert.equal(bord.voorstelKolom(milieu, ctx("in behandeling")), "mee-bezig");
});

test("voorstelKolom: eerder verborgen is Niet beoordelen, anders Te doen", () => {
	const kaarten = bord.kaartenVoor(PERSONA, REGELS, SUBSIDIES);
	const arbo = { id: "arbowet", soort: "regeling", item: REGELS[2] };
	assert.equal(bord.voorstelKolom(arbo, { vandaag: VANDAAG, zaken: [], verborgenTitels: new Set(["Arbowet: RI&E"]) }), "niet-beoordelen");
	assert.equal(bord.voorstelKolom(kaarten[0], { vandaag: VANDAAG, zaken: [], verborgenTitels: new Set() }), "te-doen");
});

test("plaatsing: het voorstel geldt tot de ondernemer verplaatst", () => {
	const [milieu] = bord.kaartenVoor(PERSONA, REGELS, SUBSIDIES);
	const ctx = { vandaag: VANDAAG, zaken: [], verborgenTitels: new Set() };
	assert.deepEqual(bord.plaatsing(milieu, {}, ctx), { kolom: "te-doen", door: "assistent" });
	const handmatig = { milieubeheer: { kolom: "mee-bezig", door: "ondernemer", op: "2026-08-27" } };
	assert.deepEqual(bord.plaatsing(milieu, handmatig, ctx), { kolom: "mee-bezig", door: "ondernemer", op: "2026-08-27" });
});

test("leesBord en schrijfBord gaan via storage per kvk", () => {
	const opslag = new Map();
	const storage = { getItem: (k) => (opslag.has(k) ? opslag.get(k) : null), setItem: (k, v) => opslag.set(k, v) };
	assert.deepEqual(bord.leesBord(storage, "62345681"), {});
	bord.schrijfBord(storage, "62345681", { upv: { kolom: "afgerond", door: "ondernemer", op: "2026-08-27" } });
	assert.equal(bord.leesBord(storage, "62345681").upv.kolom, "afgerond");
	assert.deepEqual(bord.leesBord(storage, "11111111"), {});
	storage.setItem("bord:62345681", "geen json");
	assert.deepEqual(bord.leesBord(storage, "62345681"), {});
});

test("zoek: titel weegt zwaarder dan inhoud, en extra termen tellen mee", () => {
	const uit = bord.zoek("energiebesparing", REGELS, SUBSIDIES, []);
	assert.equal(uit[0].id, "milieubeheer");
	const metTermen = bord.zoek("koelcel", REGELS, SUBSIDIES, ["koelinstallatie"]);
	assert.equal(metTermen[0].id, "milieubeheer");
	assert.deepEqual(bord.zoek("kinderopvang", REGELS, SUBSIDIES, []), []);
	assert.deepEqual(bord.zoek("  ", REGELS, SUBSIDIES, []), []);
});

test("zoek: hoofdletters en diakrieten doen er niet toe", () => {
	assert.equal(bord.zoek("RI&E", REGELS, SUBSIDIES, [])[0].id, "arbowet");
	assert.equal(bord.zoek("Duurzame Énergie", REGELS, SUBSIDIES, [])[0].id, "isde");
});

test("scopeVraag: toets gebruikt de redactionele vraag, vraag opent met de regel", () => {
	const item = { titel: "Wet milieubeheer: rapportageplicht energiebesparing", assistentVraag: "Help mij met de informatieplicht energiebesparing voor mijn bedrijf" };
	assert.equal(vraagModule.scopeVraag(item, "regeling", "toets"), "Help mij met de informatieplicht energiebesparing voor mijn bedrijf");
	assert.equal(vraagModule.scopeVraag({ titel: "Arbowet: RI&E" }, "regeling", "toets"), "Geldt “Arbowet: RI&E” voor mijn bedrijf?");
	assert.equal(vraagModule.scopeVraag({ titel: "Arbowet: RI&E" }, "regeling", "vraag"), "Ik heb een vraag over “Arbowet: RI&E”.");
});
