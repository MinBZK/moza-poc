// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * "Mijn ondernemingen" in de balk, na inloggen met NL Wallet. NL Wallet deelt per inlog één
 * bevoegdheid; het menu toont de ondernemingen die in deze sessie gedeeld zijn, met een link naar
 * de bijbehorende persona en een link om er nog een toe te voegen. Zonder wallet-inlog blijft de
 * balk zoals die was.
 */
const BRON = readFileSync(process.cwd() + "/assets/javascript/nl-wallet-portaal.js", "utf8");

const PERSONAS = [
	{ id: "koffiezaak", label: "Horecaondernemer", bedrijf: { kvkNummer: "85234567" } },
	{ id: "koffiebranderij", label: "Koffiebrander", bedrijf: { kvkNummer: "91827364" } },
];

const CLAUDIA = JSON.stringify({ voornaam: "Claudia", achternaam: "van Dam", middel: "NL Wallet" });
const NOON = { kvkNummer: "85234567", handelsnaam: "Koffiezaak Noon", functie: "Eigenaar" };
const BLEND = { kvkNummer: "91827364", handelsnaam: "Koffiebranderij Blend", functie: "Eigenaar" };

function balk({ inlog = CLAUDIA, ondernemingen = [NOON, BLEND], actief = "koffiebranderij" } = {}) {
	sessionStorage.clear();
	if (inlog) sessionStorage.setItem("inlog:persoon", inlog);
	if (ondernemingen) sessionStorage.setItem("inlog:ondernemingen", JSON.stringify(ondernemingen));
	document.body.innerHTML = `
		<div class="user-menu">
			<div class="account-switcher" data-feature="Accountwisselaar"></div>
			<div class="account-switcher" hidden data-nl-wallet-ondernemingen>
				<button class="account-switcher-toggle"></button>
				<ul class="account-switcher-menu" role="menu" hidden>
					<li class="account-switcher-group-label">Mijn ondernemingen</li>
					<li role="menuitem" data-nl-wallet-toevoegen-item><a href="/inloggen/zakelijk/?onderneming=toevoegen">Andere onderneming toevoegen met NL Wallet</a></li>
				</ul>
			</div>
			<span class="icon-label account-switcher-fallback">Naam</span>
		</div>`;
	window.personasData = PERSONAS;
	window.Personas = { actief: () => PERSONAS.find((p) => p.id === actief) };
	new Function(BRON).call(window);
}

const walletSwitcher = () => document.querySelector("[data-nl-wallet-ondernemingen]");
const items = () => [...walletSwitcher().querySelectorAll("li[role='menuitem']:not([data-nl-wallet-toevoegen-item]) a")];

beforeEach(() => {
	window.history.replaceState({}, "", "/moza/berichtenbox/");
});

afterEach(() => {
	delete window.personasData;
	delete window.Personas;
	vi.restoreAllMocks();
});

describe("mijn ondernemingen na inloggen met NL Wallet", () => {
	it("toont de gedeelde ondernemingen met een link naar hun persona", () => {
		balk();
		expect(walletSwitcher().hidden).toBe(false);
		expect(items().map((a) => a.querySelector(".account-switcher-name").textContent)).toEqual(["Koffiezaak Noon", "Koffiebranderij Blend"]);
		expect(items().map((a) => a.getAttribute("href"))).toEqual(["/moza/?persona=Horecaondernemer", "/moza/?persona=Koffiebrander"]);
	});

	it("markeert de onderneming van de actieve persona", () => {
		balk({ actief: "koffiebranderij" });
		expect(items().map((a) => a.getAttribute("aria-current"))).toEqual([null, "true"]);
	});

	it("zet de toevoeg-link als laatste en laat die terugkeren naar deze pagina", () => {
		balk();
		const laatste = [...walletSwitcher().querySelectorAll("li[role='menuitem']")].pop();
		expect(laatste.hasAttribute("data-nl-wallet-toevoegen-item")).toBe(true);
		expect(laatste.querySelector("a").getAttribute("href")).toBe("/inloggen/zakelijk/?onderneming=toevoegen&vervolg=%2Fmoza%2Fberichtenbox%2F");
	});

	it("neemt de plek in van de gewone wisselaar en de losse naam", () => {
		balk();
		expect(document.querySelector(".account-switcher[data-feature]").hidden).toBe(true);
		expect(document.querySelector(".account-switcher-fallback").hidden).toBe(true);
	});

	it("slaat een onderneming zonder persona over", () => {
		balk({ ondernemingen: [NOON, { kvkNummer: "99999999", handelsnaam: "Onbekend", functie: "Eigenaar" }] });
		expect(items()).toHaveLength(1);
	});

	it.each([
		["zonder inlog", { inlog: null }],
		["na een inlog met een ander middel", { inlog: JSON.stringify({ voornaam: "Claudia", achternaam: "van Dam", middel: "DigiD" }) }],
		["zonder gedeelde ondernemingen", { ondernemingen: [] }],
	])("verandert niets %s", (_, opties) => {
		balk(opties);
		expect(walletSwitcher().hidden).toBe(true);
		expect(document.querySelector(".account-switcher-fallback").hidden).toBe(false);
	});
});
