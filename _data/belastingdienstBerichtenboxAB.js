// Databron voor de Belastingdienst-berichtenbox A/B-test.
// Bevat ALLE MOZa-berichten (alle organisaties). De berichtenbox toont standaard
// alleen de Belastingdienst-berichten (versie A). Via een feature-flag verschijnt
// een schakelaar waarmee ook de berichten van andere organisaties getoond kunnen
// worden (versie B) — die filtering gebeurt client-side in berichtenbox.js.

const bron = require("./berichtenboxData.js");
const data = typeof bron === "function" ? bron() : bron;

// Alle MOZa-mappen blijven in de data. Bij alleen-Belastingdienst (switch uit)
// verbergt berichtenbox.js de eigen mappen client-side; staat de switch aan, dan
// verschijnen alle MOZa-mappen (incl. Subsidies) — volledige pariteit met MOZa.
module.exports = {
	magazijnen: data.magazijnen,
	berichten: data.berichten,
	mappen: data.mappen,
	aantalMagazijnen: data.aantalMagazijnen,
	aantalOngelezen: data.berichten.filter((b) => b.isOngelezen).length,
};
