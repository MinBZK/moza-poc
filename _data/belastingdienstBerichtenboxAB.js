// Databron voor de Belastingdienst-berichtenbox A/B-test.
// Bevat ALLE MOZa-berichten (alle organisaties). De berichtenbox toont standaard
// alleen de Belastingdienst-berichten (versie A). Via een feature-flag verschijnt
// een schakelaar waarmee ook de berichten van andere organisaties getoond kunnen
// worden (versie B) — die filtering gebeurt client-side in berichtenbox.js.

const bron = require("./berichtenboxData.js");
const data = typeof bron === "function" ? bron() : bron;

// Mappen die niet relevant zijn voor de Belastingdienst-berichtenbox verbergen.
const VERBORGEN_MAPPEN = ["subsidies"];

module.exports = {
	magazijnen: data.magazijnen,
	berichten: data.berichten,
	mappen: data.mappen.filter((m) => !VERBORGEN_MAPPEN.includes(m.slug)),
	aantalMagazijnen: data.aantalMagazijnen,
	aantalOngelezen: data.berichten.filter((b) => b.isOngelezen).length,
};
