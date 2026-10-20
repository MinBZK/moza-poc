// Schermafdrukken en controles van het prototype in headless Chromium.
// Gebruik: node test/schermen.mjs <basis-url> <uitvoermap>
// Per pagina: 1280 en 390 breed, consolefouten, horizontale scroll, h1 aanwezig.
// De zaak- en besluitpagina's krijgen de toestand "verstuurd, besluit genomen" via localStorage.
import { chromium } from "/home/claude/projects/regelrecht/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";

const [basis, uit] = process.argv.slice(2);
await mkdir(uit, { recursive: true });

const PAGINAS = [
	["01-personeel", "/moza/personeel/", null],
	["02-kandidaat", "/moza/iemand-aannemen/", null],
	["03-gegevens", "/moza/iemand-aannemen/gegevens/", { bronnen: { uwv: true, gemeente: true, kvk: true } }],
	["04-oplevert", "/moza/iemand-aannemen/wat-het-oplevert/", { bronnen: { uwv: true, gemeente: true, kvk: true, belastingdienst: true, eigen: true } }],
	["05-concept", "/moza/iemand-aannemen/concept-aanvraag-loonkostensubsidie/", { bronnen: { uwv: true, gemeente: true, kvk: true, belastingdienst: true, eigen: true } }],
	["06-verstuurd", "/moza/iemand-aannemen/verstuurd/", { ingediend: true, verstuurdOp: "2026-10-05", fase: "ontvangst" }],
	["07-zaken", "/moza/lopende-zaken/", { ingediend: true, fase: "ontvangst" }],
	["08-zaak-ontvangst", "/moza/lopende-zaken/loonkostensubsidie-koen/", { ingediend: true, fase: "ontvangst" }],
	["09-zaak-besluit", "/moza/lopende-zaken/loonkostensubsidie-koen/", { ingediend: true, fase: "antwoord", vraag: "Telt de vergoeding voor werkgeverslasten niet mee in het bedrag?" }],
	["10-besluit", "/moza/lopende-zaken/loonkostensubsidie-koen/besluit/", { ingediend: true, fase: "besluit" }],
	["11-personeel-met-zaak", "/moza/personeel/", { ingediend: true, fase: "besluit" }],
];

const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell`, args: ["--no-sandbox"] });
let fouten = 0;
for (const breed of [1280, 390]) {
	const context = await browser.newContext({ viewport: { width: breed, height: 900 } });
	for (const [naam, pad, staat] of PAGINAS) {
		const page = await context.newPage();
		const console_ = [];
		page.on("console", (m) => {
			if (m.type() === "error") console_.push(m.text());
		});
		page.on("pageerror", (e) => console_.push("pageerror: " + e.message));
		await page.goto(basis + pad, { waitUntil: "networkidle" });
		await page.evaluate((s) => {
			localStorage.removeItem("da-aannemen");
			if (s) localStorage.setItem("da-aannemen", JSON.stringify(s));
		}, staat);
		await page.reload({ waitUntil: "networkidle" });
		await page.waitForTimeout(300);
		const info = await page.evaluate(() => ({
			h1: document.querySelector("h1")?.textContent.trim().slice(0, 60),
			scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
			verborgenHoofd: !!document.querySelector("#da-zaak[hidden], #da-besluit[hidden]"),
		}));
		await page.screenshot({ path: `${uit}/${naam}-${breed}.png`, fullPage: true });
		const problemen = [];
		if (!info.h1) problemen.push("geen h1");
		if (info.scroll) problemen.push("horizontale scroll");
		if (console_.length) problemen.push("console: " + console_.slice(0, 2).join(" | ").slice(0, 160));
		if (problemen.length) fouten++;
		console.log(`${naam} ${breed}: ${info.h1 ?? "-"}${problemen.length ? "  !! " + problemen.join("; ") : ""}`);
		await page.close();
	}
	await context.close();
}
// Persona-wissel: werkgevergegevens volgen de actieve persona, Koen blijft.
{
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const page = await context.newPage();
	await page.goto(basis + "/moza/personeel/", { waitUntil: "networkidle" });
	const opties = await page.evaluate(() => document.querySelectorAll("#da-persona option").length);
	await page.goto(basis + "/moza/iemand-aannemen/concept-aanvraag-loonkostensubsidie/?persona=koffiezaak", { waitUntil: "networkidle" });
	const w = await page.evaluate(() => ({
		naam: document.querySelector('[data-profiel="handelsnaam"]')?.textContent,
		kvk: document.querySelector('[data-profiel="kvkNummer"]')?.textContent,
		iban: document.querySelector('[data-profiel="iban"]')?.textContent,
		kandidaat: document.body.textContent.includes("Koen de Wit"),
		kop: document.querySelector('[data-profiel="naam"]')?.textContent,
	}));
	await page.screenshot({ path: `${uit}/12-concept-andere-persona-1280.png`, fullPage: true });
	const goed = opties > 5 && w.naam && w.naam !== "Kwekerij De Bloesem" && w.kandidaat;
	console.log(`persona-wissel: ${opties} persona's in de keuzelijst; werkgever ${w.naam} (${w.kvk}, ${w.iban}), ondernemer ${w.kop}, kandidaat Koen ${w.kandidaat}${goed ? "" : "  !! persona-wissel werkt niet"}`);
	if (!goed) fouten++;
	await context.close();
}
await browser.close();
console.log(fouten ? `${fouten} pagina's met problemen` : "alle pagina's in orde");
process.exit(fouten ? 1 : 0);
