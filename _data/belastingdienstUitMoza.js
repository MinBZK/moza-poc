// Berichtenbox-inhoud voor Mijn Belastingdienst Zakelijk: alleen de
// Belastingdienst-berichten uit de gedeelde MOZa-berichtenbox.
// Hergebruikt dezelfde bron (berichtenboxData.js) zodat de detailpagina's
// onder /moza/berichtenbox/bericht/{id}/ blijven kloppen.

const bron = require("./berichtenboxData.js");
const data = typeof bron === "function" ? bron() : bron;

const MAGAZIJN_ID = "belastingdienst";

const berichten = data.berichten.filter((b) => b.magazijnId === MAGAZIJN_ID);

module.exports = {
	magazijnen: data.magazijnen.filter((m) => m.id === MAGAZIJN_ID),
	berichten,
	mappen: data.mappen,
	aantalMagazijnen: 1,
	aantalOngelezen: berichten.filter((b) => b.isOngelezen).length,
};
