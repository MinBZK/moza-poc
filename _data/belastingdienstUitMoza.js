// Berichtenbox-inhoud voor Mijn Belastingdienst Zakelijk: alleen de
// Belastingdienst-berichten uit de gedeelde MOZa-berichtenbox.
// Hergebruikt dezelfde bron (berichtenboxData.js) zodat de detailpagina's
// onder /moza/berichtenbox/bericht/{id}/ blijven kloppen.

const bron = require("./berichtenboxData.js");
const data = typeof bron === "function" ? bron() : bron;

const MAGAZIJN_ID = "belastingdienst";

const berichten = data.berichten.filter((b) => b.magazijnId === MAGAZIJN_ID);

// Mappen die niet relevant zijn voor de Belastingdienst-berichtenbox verbergen.
const VERBORGEN_MAPPEN = ["subsidies"];

module.exports = {
	magazijnen: data.magazijnen.filter((m) => m.id === MAGAZIJN_ID),
	berichten,
	mappen: data.mappen.filter((m) => !VERBORGEN_MAPPEN.includes(m.slug)),
	aantalMagazijnen: 1,
	aantalOngelezen: berichten.filter((b) => b.isOngelezen).length,
};
