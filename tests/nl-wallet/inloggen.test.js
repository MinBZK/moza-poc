// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Inloggen met NL Wallet vanaf de inlogkeuze. De kaart "Inloggen met een wallet" opent direct het
 * venster van NL Wallet; daarvoor zet het script een onzichtbare knop van NL Wallet op de pagina.
 * Onderaan in de overlay staat een link om eerst de bevoegdheid in de wallet te zetten. Dat venster
 * kan niet zien wanneer de uitgifte klaar is, dus daaronder staat een link terug naar inloggen.
 *
 * Na het inloggen bewaart het script de naam uit de wallet en stuurt door naar MijnOverheid
 * Zakelijk. De persona volgt uit de bevoegdheid: heeft precies één persona dat KVK-nummer, dan gaat
 * de gebruiker naar die persona. Claudia van Dam met KVK 85234567 is de Horecaondernemer.
 *
 * jsdom kent de custom element van NL Wallet niet, dus het venster zelf gaat hier niet open; de
 * tests kijken naar de knoppen die het script maakt en naar wat het met hun gebeurtenissen doet.
 */
const BRON = readFileSync(process.cwd() + "/assets/javascript/nl-wallet-inloggen.js", "utf8");

const PERSONAS = [
	{ id: "koffiezaak", label: "Horecaondernemer", persoon: { voornaam: "Claudia", achternaam: "van Dam" }, bedrijf: { kvkNummer: "85234567" } },
	{ id: "koffiebranderij", label: "Koffiebrander", persoon: { voornaam: "Claudia", achternaam: "van Dam" }, bedrijf: { kvkNummer: "91827364" } },
	{ id: "bloom", label: "Bloemist", persoon: { voornaam: "Robin", achternaam: "Vogel" }, bedrijf: { kvkNummer: "11111111" } },
	{ id: "dubbel-een", label: "Dubbel een", persoon: {}, bedrijf: { kvkNummer: "33333333" } },
	{ id: "dubbel-twee", label: "Dubbel twee", persoon: {}, bedrijf: { kvkNummer: "33333333" } },
];

const CLAUDIA = {
	voornaam: "Claudia",
	achternaam: "van Dam",
	bevoegdheid: { kvkNummer: "85234567", handelsnaam: "Koffiezaak Noon", functie: "Eigenaar", bevoegdheid: "Volledig bevoegd" },
};

const CONFIG = {
	bevoegdheden: [
		{ id: "noon", handelsnaam: "Koffiezaak Noon", kvkNummer: "85234567", same_device_ul: "walletdebuginteraction://noon/same", cross_device_ul: "walletdebuginteraction://noon/cross" },
		{ id: "blend", handelsnaam: "Koffiebranderij Blend", kvkNummer: "91827364", same_device_ul: "walletdebuginteraction://blend/same", cross_device_ul: "walletdebuginteraction://blend/cross" },
	],
	app: { beschikbaar: true },
};

function metKvk(kvkNummer) {
	return { ...CLAUDIA, bevoegdheid: { ...CLAUDIA.bevoegdheid, kvkNummer } };
}

// Antwoorden per endpoint; /api/nl-wallet/sessie loopt een reeks af en blijft op de laatste staan.
function nepFetch({ gegevens = CLAUDIA, config = CONFIG, sessie = [{ status: "GEEN" }] } = {}) {
	const reeks = [...sessie];
	const json = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
	return vi.fn((url) => {
		if (url === "/api/nl-wallet/config") return config ? json(config) : Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({}) });
		if (url === "/api/nl-wallet/sessie") return json(reeks.length > 1 ? reeks.shift() : reeks[0]);
		if (url.endsWith("/gegevens")) return json(gegevens);
		return Promise.reject(new Error("onverwacht: " + url));
	});
}

function pagina(fetchOpties) {
	vi.stubGlobal("fetch", nepFetch(fetchOpties));
	document.body.innerHTML = `
		<main>
			<div data-nl-wallet-status="bezig" hidden></div>
			<div data-nl-wallet-status="ingelogd" hidden><b data-nl-wallet-naam></b><b data-nl-wallet-onderneming></b><a href="/moza/" data-nl-wallet-vervolg></a></div>
			<div data-nl-wallet-status="mislukt" hidden></div>
			<div data-nl-wallet-status="andere-persoon" hidden></div>
			<div data-nl-wallet-bevoegdheid-status="niet-ingericht" hidden></div>
			<p class="nl-wallet-overlay-titel" data-nl-wallet-overlay="inloggen" hidden><span data-nl-wallet-titel-inloggen>Inloggen bij MijnOverheid Zakelijk</span></p>
			<div data-nl-wallet-overlay="inloggen" hidden><p data-nl-wallet-bevoegdheden hidden>Voeg toe voor <span data-nl-wallet-bevoegdheid-links></span></p></div>
			<p class="nl-wallet-overlay-titel" data-nl-wallet-overlay="bevoegdheid" hidden>Bevoegdheid voor <span data-nl-wallet-titel-onderneming>uw onderneming</span> toevoegen aan uw NL Wallet</p>
			<p data-nl-wallet-overlay="bevoegdheid" hidden><a href="#" data-nl-wallet-naar-inloggen>Ga verder met inloggen</a></p>
			<div data-nl-wallet-knoppen></div>
			<a href="#" data-nl-wallet-inloggen>Inloggen met een wallet</a>
		</main>`;
	window.personasData = PERSONAS;

	// Elke test voert het script opnieuw uit. Registreert het zijn DOMContentLoaded-listener echt op
	// document, dan draaien de scripts van eerdere tests mee; vang hem daarom op en roep hem één keer aan.
	let opStart = null;
	const echt = document.addEventListener;
	document.addEventListener = (type, luisteraar, ...rest) => (type === "DOMContentLoaded" ? (opStart = luisteraar) : echt.call(document, type, luisteraar, ...rest));
	try {
		new Function(BRON).call(window);
	} finally {
		document.addEventListener = echt;
	}
	opStart(new Event("DOMContentLoaded"));
}

const loginKnop = () => document.querySelector("nl-wallet-button[usecase]");
const bevoegdheidKnop = () => document.querySelector("nl-wallet-button:not([usecase])");
const vervolgHref = () => document.querySelector("[data-nl-wallet-vervolg]").getAttribute("href");

function klikKaart() {
	document.querySelector("[data-nl-wallet-inloggen]").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

async function sluitVensterNaSucces(gegevens) {
	pagina({ gegevens });
	klikKaart();
	loginKnop().dispatchEvent(new CustomEvent("success", { detail: ["UbGVHMKhupFHDHsNplXp4zlTtXPa3UWD", "cross_device"] }));
	await vi.waitFor(() => expect(document.querySelector("[data-nl-wallet-status='ingelogd']").hidden).toBe(false));
	return vervolgHref();
}

beforeEach(() => {
	window.history.replaceState({}, "", "/inloggen/zakelijk/");
	sessionStorage.clear();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	delete window.personasData;
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("de kaart opent direct het inlogvenster", () => {
	it("zet een onzichtbare inlogknop van NL Wallet op de pagina", () => {
		pagina();
		klikKaart();
		const knop = loginKnop();
		expect(knop).not.toBeNull();
		expect(knop.classList.contains("nl-wallet-onzichtbaar")).toBe(true);
		expect(knop.getAttribute("usecase")).toBe("moza_inloggen");
		expect(knop.getAttribute("start-url")).toBe("/api/nl-wallet/sessies");
		expect(knop.getAttribute("text")).toContain("NL Wallet");
	});

	it("hangt de knoppen, titels en links in de overlay direct onder body, anders valt het venster in een container", () => {
		pagina();
		expect(document.querySelector("[data-nl-wallet-knoppen]").parentElement).toBe(document.body);
		document.querySelectorAll("[data-nl-wallet-overlay]").forEach((hint) => expect(hint.parentElement).toBe(document.body));
	});

	it("volgt de link van de kaart niet", () => {
		pagina();
		const klik = new MouseEvent("click", { bubbles: true, cancelable: true });
		document.querySelector("[data-nl-wallet-inloggen]").dispatchEvent(klik);
		expect(klik.defaultPrevented).toBe(true);
	});

	it("maakt bij een tweede klik geen tweede inlogknop", () => {
		pagina();
		klikKaart();
		klikKaart();
		expect(document.querySelectorAll("nl-wallet-button[usecase]")).toHaveLength(1);
	});
});

describe("na het inloggen", () => {
	it("bewaart alleen de naam uit de wallet voor personas.js", async () => {
		await sluitVensterNaSucces(CLAUDIA);
		expect(JSON.parse(sessionStorage.getItem("inlog:persoon"))).toEqual({ voornaam: "Claudia", achternaam: "van Dam", middel: "NL Wallet" });
		expect(document.querySelector("[data-nl-wallet-naam]").textContent).toBe("Claudia van Dam");
		expect(document.querySelector("[data-nl-wallet-onderneming]").textContent).toBe("Koffiezaak Noon");
	});

	it("stuurt naar de persona met het KVK-nummer uit de bevoegdheid", async () => {
		expect(await sluitVensterNaSucces(CLAUDIA)).toBe("/moza/?persona=Horecaondernemer");
	});

	it("kiest op KVK-nummer en niet op naam", async () => {
		expect(await sluitVensterNaSucces({ ...metKvk("11111111"), voornaam: "Robin", achternaam: "Vogel" })).toBe("/moza/?persona=Bloemist");
	});

	it("kiest geen persona bij een dubbel of onbekend KVK-nummer, of zonder bevoegdheid", async () => {
		expect(await sluitVensterNaSucces(metKvk("33333333"))).toBe("/moza/");
		expect(await sluitVensterNaSucces(metKvk("99999999"))).toBe("/moza/");
		expect(await sluitVensterNaSucces({ ...CLAUDIA, bevoegdheid: null })).toBe("/moza/");
	});

	it("houdt een gevraagd vervolgpad aan en zet de persona erachter", async () => {
		window.history.replaceState({}, "", "/inloggen/zakelijk/?vervolg=/moza/berichtenbox/");
		expect(await sluitVensterNaSucces(CLAUDIA)).toBe("/moza/berichtenbox/?persona=Horecaondernemer");
	});
});

describe("titels in de overlay, want beide vensters zien er hetzelfde uit", () => {
	it("heeft in de include voor elk venster een eigen titel die zegt waar de QR-code voor is", () => {
		const include = readFileSync(process.cwd() + "/_includes/nl-wallet-inloggen.njk", "utf8");
		const titels = Object.fromEntries([...include.matchAll(/<p class="nl-wallet-overlay-titel"[^>]*data-nl-wallet-overlay="([a-z]+)"[^>]*>([\s\S]*?)<\/p>/g)].map(([, venster, inhoud]) => [venster, inhoud.replace(/<[^>]+>/g, "")]));
		expect(Object.keys(titels).sort()).toEqual(["bevoegdheid", "inloggen"]);
		expect(titels.inloggen).toContain("Inloggen");
		expect(titels.bevoegdheid).toContain("Bevoegdheid");
	});
});

describe("ondernemingen in deze sessie", () => {
	const BLEND = { ...CLAUDIA, bevoegdheid: { kvkNummer: "91827364", handelsnaam: "Koffiebranderij Blend", functie: "Eigenaar", bevoegdheid: "Volledig bevoegd" } };
	const opgeslagen = () => JSON.parse(sessionStorage.getItem("inlog:ondernemingen"));

	it("begint bij een gewone inlog met alleen de gedeelde onderneming", async () => {
		sessionStorage.setItem("inlog:ondernemingen", JSON.stringify([{ kvkNummer: "11111111", handelsnaam: "Oud", functie: "x" }]));
		await sluitVensterNaSucces(CLAUDIA);
		expect(opgeslagen()).toEqual([{ kvkNummer: "85234567", handelsnaam: "Koffiezaak Noon", functie: "Eigenaar" }]);
	});

	it("opent bij onderneming=toevoegen direct het venster, met een eigen titel", () => {
		window.history.replaceState({}, "", "/inloggen/zakelijk/?onderneming=toevoegen&vervolg=/moza/");
		pagina();
		expect(loginKnop()).not.toBeNull();
		expect(document.querySelector("[data-nl-wallet-titel-inloggen]").textContent).toContain("Andere onderneming toevoegen");
	});

	it("voegt bij toevoegen de onderneming toe aan de bestaande en stuurt naar die persona", async () => {
		sessionStorage.setItem("inlog:persoon", JSON.stringify({ voornaam: "Claudia", achternaam: "van Dam", middel: "NL Wallet" }));
		sessionStorage.setItem("inlog:ondernemingen", JSON.stringify([{ kvkNummer: "85234567", handelsnaam: "Koffiezaak Noon", functie: "Eigenaar" }]));
		window.history.replaceState({}, "", "/inloggen/zakelijk/?onderneming=toevoegen&vervolg=/moza/berichtenbox/");
		pagina({ gegevens: BLEND });
		loginKnop().dispatchEvent(new CustomEvent("success", { detail: ["UbGVHMKhupFHDHsNplXp4zlTtXPa3UWD", "cross_device"] }));
		await vi.waitFor(() => expect(opgeslagen()).toHaveLength(2));
		expect(opgeslagen().map((o) => o.handelsnaam)).toEqual(["Koffiezaak Noon", "Koffiebranderij Blend"]);
		expect(vervolgHref()).toBe("/moza/berichtenbox/?persona=Koffiebrander");
	});

	it("voegt dezelfde onderneming geen tweede keer toe", async () => {
		sessionStorage.setItem("inlog:persoon", JSON.stringify({ voornaam: "Claudia", achternaam: "van Dam", middel: "NL Wallet" }));
		sessionStorage.setItem("inlog:ondernemingen", JSON.stringify([{ kvkNummer: "85234567", handelsnaam: "Koffiezaak Noon", functie: "Eigenaar" }]));
		window.history.replaceState({}, "", "/inloggen/zakelijk/?onderneming=toevoegen");
		pagina({ gegevens: CLAUDIA });
		loginKnop().dispatchEvent(new CustomEvent("success", { detail: ["UbGVHMKhupFHDHsNplXp4zlTtXPa3UWD", "cross_device"] }));
		await vi.waitFor(() => expect(document.querySelector("[data-nl-wallet-status='ingelogd']").hidden).toBe(false));
		expect(opgeslagen()).toHaveLength(1);
	});

	it("weigert bij toevoegen een bevoegdheid van iemand anders", async () => {
		sessionStorage.setItem("inlog:persoon", JSON.stringify({ voornaam: "Linda", achternaam: "Strijps", middel: "NL Wallet" }));
		sessionStorage.setItem("inlog:ondernemingen", JSON.stringify([{ kvkNummer: "11111111", handelsnaam: "Iets", functie: "Eigenaar" }]));
		window.history.replaceState({}, "", "/inloggen/zakelijk/?onderneming=toevoegen");
		pagina({ gegevens: BLEND });
		loginKnop().dispatchEvent(new CustomEvent("success", { detail: ["UbGVHMKhupFHDHsNplXp4zlTtXPa3UWD", "cross_device"] }));
		await vi.waitFor(() => expect(document.querySelector("[data-nl-wallet-status='andere-persoon']").hidden).toBe(false));
		expect(opgeslagen()).toHaveLength(1);
		expect(JSON.parse(sessionStorage.getItem("inlog:persoon")).voornaam).toBe("Linda");
	});
});

describe("sessie volgen, zodat na Gelukt het venster niet gesloten hoeft te worden", () => {
	it("verwerkt het inloggen zodra de sessie gelukt is", async () => {
		vi.useFakeTimers();
		pagina({ sessie: [{ status: "GEEN" }, { status: "WAITING_FOR_RESPONSE" }, { status: "DONE", gegevens: CLAUDIA }] });
		klikKaart();

		await vi.advanceTimersByTimeAsync(6000);

		expect(document.querySelector("[data-nl-wallet-status='ingelogd']").hidden).toBe(false);
		expect(vervolgHref()).toBe("/moza/?persona=Horecaondernemer");
	});

	it("houdt op met volgen als de sessie afgebroken is", async () => {
		vi.useFakeTimers();
		pagina({ sessie: [{ status: "CANCELLED" }] });
		klikKaart();

		await vi.advanceTimersByTimeAsync(10000);

		expect(fetch.mock.calls.filter(([url]) => url === "/api/nl-wallet/sessie")).toHaveLength(1);
		expect(document.querySelector("[data-nl-wallet-status='ingelogd']").hidden).toBe(true);
	});
});

describe("bevoegdheid toevoegen vanuit de overlay", () => {
	async function klikLink(id) {
		await vi.waitFor(() => expect(document.querySelector(`[data-nl-wallet-bevoegdheid-toevoegen="${id}"]`)).not.toBeNull());
		document.querySelector(`[data-nl-wallet-bevoegdheid-toevoegen="${id}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
	}

	it("toont per onderneming een eigen link", async () => {
		pagina();
		await vi.waitFor(() => expect(document.querySelector("[data-nl-wallet-bevoegdheden]").hidden).toBe(false));
		const links = [...document.querySelectorAll("[data-nl-wallet-bevoegdheid-links] a")].map((a) => a.textContent);
		expect(links).toEqual(["Koffiezaak Noon", "Koffiebranderij Blend"]);
		expect(document.querySelector("[data-nl-wallet-bevoegdheid-links]").textContent).toBe("Koffiezaak Noon of Koffiebranderij Blend");
	});

	it("opent het venster voor precies de gekozen onderneming, met die naam in de titel", async () => {
		pagina();
		klikKaart();
		await klikLink("blend");
		await vi.waitFor(() => expect(bevoegdheidKnop()).not.toBeNull());
		expect(loginKnop()).toBeNull();
		expect(bevoegdheidKnop().getAttribute("same-device-ul")).toBe("walletdebuginteraction://blend/same");
		expect(bevoegdheidKnop().getAttribute("cross-device-ul")).toBe("walletdebuginteraction://blend/cross");
		expect(bevoegdheidKnop().getAttribute("text")).toContain("NL Wallet");
		expect(document.querySelector("[data-nl-wallet-titel-onderneming]").textContent).toBe("Koffiebranderij Blend");
		expect([...document.querySelectorAll("[data-nl-wallet-overlay]")].every((el) => el.hidden)).toBe(true);
	});

	it("gaat met de link onder het bevoegdheid-venster terug naar het inlogvenster", async () => {
		pagina();
		klikKaart();
		await klikLink("noon");
		await vi.waitFor(() => expect(bevoegdheidKnop()).not.toBeNull());
		document.querySelector("[data-nl-wallet-naar-inloggen]").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		expect(bevoegdheidKnop()).toBeNull();
		expect(loginKnop()).not.toBeNull();
	});

	it("rekent niet op een success van het bevoegdheid-venster, want dat meldt wallet_web daar niet", async () => {
		pagina();
		klikKaart();
		await klikLink("noon");
		await vi.waitFor(() => expect(bevoegdheidKnop()).not.toBeNull());
		bevoegdheidKnop().dispatchEvent(new CustomEvent("success", { detail: [] }));
		expect(bevoegdheidKnop()).not.toBeNull();
	});

	it("gebruikt de links van het moment van klikken, niet die van het laden van de pagina", async () => {
		pagina();
		klikKaart();
		await vi.waitFor(() => expect(document.querySelector('[data-nl-wallet-bevoegdheid-toevoegen="noon"]')).not.toBeNull());
		const vers = { ...CONFIG, bevoegdheden: CONFIG.bevoegdheden.map((o) => (o.id === "noon" ? { ...o, cross_device_ul: "walletdebuginteraction://noon/nieuw-certificaat" } : o)) };
		vi.stubGlobal("fetch", nepFetch({ config: vers }));
		document.querySelector('[data-nl-wallet-bevoegdheid-toevoegen="noon"]').dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		await vi.waitFor(() => expect(bevoegdheidKnop()).not.toBeNull());
		expect(bevoegdheidKnop().getAttribute("cross-device-ul")).toBe("walletdebuginteraction://noon/nieuw-certificaat");
	});

	it("laat de regel weg als de omgeving geen bevoegdheden kent", async () => {
		pagina({ config: null });
		await new Promise((klaar) => setTimeout(klaar, 20));
		expect(document.querySelector("[data-nl-wallet-bevoegdheden]").hidden).toBe(true);
		expect(document.querySelectorAll("[data-nl-wallet-bevoegdheid-links] a")).toHaveLength(0);
	});
});
