// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { antwoord, personasVoor, rondeMetLijst, sseVan, startKeten, ruimKetenOp } from "./keten-harnas.js";

/**
 * Mappen in het Federatief Berichtenstelsel, aan de kant van het transport.
 *
 * Een map is daar geen ding op zich maar een eigenschap van een bericht, opgeslagen bij de
 * organisatie die het stuurde. Drie dingen volgen daaruit, en die toetst dit bestand:
 *
 * - Tijdens de ophaalronde is de lijst niet op te vragen, dus het mappenoverzicht komt dan uit de
 *   gebeurtenissen per organisatie, opgeteld terwijl ze binnenkomen.
 * - Levert een organisatie niet, dan kunnen haar mappen en berichten ontbreken. De lijst zegt dat
 *   (`aantalNietGeleverd`, `nietGeleverd`) op elke pagina en ook na verversen, en de melding volgt.
 * - Een bericht uit zijn map halen gaat naar het stelsel, met `{"map": ""}`.
 */

const RVO = "00000001003214345000";
const BD = "00000001823288444000";

let bezoeker = 90000200;

/** Een eigen kvk-nummer per test: elk vorig exemplaar van het script blijft in het document bestaan. */
async function start(perAdres, pad) {
	bezoeker += 1;
	const kvkNummer = String(bezoeker);
	const gestart = await startKeten([["/api/demo/personas", personasVoor(kvkNummer)], ...perAdres], pad, kvkNummer);
	return { ...gestart, ontvanger: "KVK:" + kvkNummer };
}

function bericht(id, magazijnId, map) {
	return { berichtId: id, onderwerp: "Onderwerp " + id, publicatietijdstip: "2026-09-21T10:00:00Z", magazijnId: magazijnId, afzenderNaam: magazijnId === RVO ? "RVO" : "Belastingdienst", map: map };
}

const BERICHTEN = [bericht("r1", RVO, "Subsidies"), bericht("r2", RVO, "Boekhouding 2026"), bericht("b1", BD, "Boekhouding 2026"), bericht("b2", BD, "Te bespreken met adviseur"), bericht("b3", BD, null)];

function lijstMet(extra, berichten = BERICHTEN) {
	return antwoord(200, { berichten: berichten, _links: {}, ...extra });
}

function voltooid(magazijnId, naam, status, mappen) {
	const gebeurtenis = { event: "magazijn-bevraging-voltooid", magazijnId: magazijnId, naam: naam, status: status, aantalBerichten: 0, afgekapt: false };
	if (mappen) gebeurtenis.mappen = mappen;
	return gebeurtenis;
}

/**
 * Hangt een kijker aan het script zodra het zich op `window` zet. Het script begint bij het laden
 * meteen aan de ronde; wie pas daarna kijkt, heeft de voortgang gemist.
 */
function kijkVanafStart(kijker) {
	Object.defineProperty(window, "BerichtenboxKeten", {
		configurable: true,
		get: () => undefined,
		set: (keten) => {
			keten.opWijziging(kijker);
			Object.defineProperty(window, "BerichtenboxKeten", { configurable: true, writable: true, value: keten });
		},
	});
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
	window.dispatchEvent(new Event("pagehide"));
	ruimKetenOp();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("het mappenoverzicht tijdens de ophaalronde", () => {
	it("telt de mappen per organisatie op terwijl ze leveren", async () => {
		const gezien = [];
		const stroom = () =>
			sseVan([
				voltooid(RVO, "RVO", "OK", [
					{ naam: "Boekhouding 2026", aantalBerichten: 1 },
					{ naam: "Subsidies", aantalBerichten: 3 },
				]),
				voltooid(BD, "Belastingdienst", "OK", [
					{ naam: "Belasting", aantalBerichten: 3 },
					{ naam: "Boekhouding 2026", aantalBerichten: 1 },
					{ naam: "Te bespreken met adviseur", aantalBerichten: 1 },
				]),
				{ event: "ophalen-gereed" },
			]);

		kijkVanafStart((toestand) => toestand.voortgang && gezien.push(toestand.voortgang.mappen));

		await start(rondeMetLijst(lijstMet({ aantalNietGeleverd: 0, nietGeleverd: [] }), stroom));

		expect(gezien[0]).toEqual([
			{ naam: "Boekhouding 2026", aantalBerichten: 1 },
			{ naam: "Subsidies", aantalBerichten: 3 },
		]);
		expect(gezien[1]).toEqual([
			{ naam: "Belasting", aantalBerichten: 3 },
			{ naam: "Boekhouding 2026", aantalBerichten: 2 },
			{ naam: "Subsidies", aantalBerichten: 3 },
			{ naam: "Te bespreken met adviseur", aantalBerichten: 1 },
		]);
	});

	it("zegt niets over mappen als het stelsel ze niet meestuurt", async () => {
		// Een keten van vóór dit veld. Een lege lijst zou beweren dat er geen mappen zijn.
		const gezien = [];
		kijkVanafStart((toestand) => toestand.voortgang && gezien.push(toestand.voortgang));

		await start(rondeMetLijst(lijstMet({}), () => sseVan([voltooid(RVO, "RVO", "OK"), { event: "ophalen-gereed" }])));

		expect(gezien.length).toBeGreaterThan(0);
		gezien.forEach((voortgang) => expect("mappen" in voortgang).toBe(false));
	});

	it("neemt geen mappen mee van een organisatie die niet leverde", async () => {
		const gezien = [];
		kijkVanafStart((toestand) => toestand.voortgang && gezien.push(toestand.voortgang.mappen));

		await start(rondeMetLijst(lijstMet({}), () => sseVan([voltooid(RVO, "RVO", "OK", [{ naam: "Subsidies", aantalBerichten: 3 }]), voltooid(BD, "Belastingdienst", "FOUT", [{ naam: "Belasting", aantalBerichten: 3 }]), { event: "ophalen-gereed" }])));

		expect(gezien[gezien.length - 1]).toEqual([{ naam: "Subsidies", aantalBerichten: 3 }]);
	});
});

describe("een organisatie die niet leverde", () => {
	it("staat in de melding, met haar naam", async () => {
		await start(rondeMetLijst(lijstMet({ aantalNietGeleverd: 1, nietGeleverd: [{ magazijnId: BD, naam: "Belastingdienst", status: "FOUT" }] })));

		const melding = window.BerichtenboxKeten.melding;
		expect(melding.soort).toBe("mededeling");
		expect(melding.tekst).toContain("Belastingdienst");
		expect(melding.tekst).toContain("mappen");
	});

	it("blijft gemeld na verversen, als de lijst uit de sessie komt en er geen ronde draait", async () => {
		// Verversen draait geen ronde: de sessie staat er nog, en de lijst antwoordt meteen. Wie er
		// niet leverde, weet dan alleen de lijst.
		const { aanroepen } = await start([["/api/v1/berichten?", lijstMet({ aantalNietGeleverd: 1, nietGeleverd: [{ magazijnId: BD, naam: "Belastingdienst", status: "TIMEOUT" }] })]]);

		expect(aanroepen.some((a) => a.pad.indexOf("_ophalen") !== -1)).toBe(false);
		expect(window.BerichtenboxKeten.melding.tekst).toContain("Belastingdienst");
	});

	it("blijft gemeld bij doorbladeren naar een volgende pagina van de berichtenbox", async () => {
		// Een andere pagina van de berichtenbox is een nieuwe paginalading met dezelfde sessie.
		await start([["/api/v1/berichten?", lijstMet({ aantalNietGeleverd: 1, nietGeleverd: [{ magazijnId: BD, naam: "Belastingdienst", status: "FOUT" }] })]], "/moza/berichtenbox/?pagina=2");

		expect(window.BerichtenboxKeten.melding.tekst).toContain("Belastingdienst");
	});

	it("leest het ook als het stelsel de lijst over meer pagina's verdeelt", async () => {
		const paginas = [BERICHTEN.slice(0, 3), BERICHTEN.slice(3)];
		const lijst = (pad) => {
			const nummer = Number(new URLSearchParams(pad.slice(pad.indexOf("?"))).get("pagina"));
			const laatste = nummer >= paginas.length - 1;
			return antwoord(200, {
				berichten: paginas[nummer] || [],
				aantalNietGeleverd: 1,
				nietGeleverd: [{ magazijnId: BD, naam: "Belastingdienst", status: "FOUT" }],
				_links: laatste ? {} : { next: { href: "/api/v1/berichten?pagina=" + (nummer + 1) } },
			});
		};
		await start([["/api/v1/berichten?", lijst]]);

		expect((await window.BerichtenboxKeten.berichten()).berichten).toHaveLength(5);
		expect(window.BerichtenboxKeten.melding.tekst).toContain("Belastingdienst");
	});

	it("meldt het zonder namen als het stelsel alleen het aantal kent", async () => {
		// Een sessie die over een uitrol heen loopt. Volledig is aantalNietGeleverd == 0, niet een lege lijst.
		await start([["/api/v1/berichten?", lijstMet({ aantalNietGeleverd: 1, nietGeleverd: [] })]]);

		const melding = window.BerichtenboxKeten.melding;
		expect(melding).not.toBeNull();
		expect(melding.tekst).toMatch(/^Eén organisatie heeft uw berichten niet geleverd/);
	});

	it("noemt wie het kent en telt de rest", async () => {
		await start([["/api/v1/berichten?", lijstMet({ aantalNietGeleverd: 3, nietGeleverd: [{ magazijnId: BD, naam: "Belastingdienst", status: "FOUT" }] })]]);

		expect(window.BerichtenboxKeten.melding.tekst).toMatch(/^Belastingdienst en nog 2 organisaties hebben/);
	});

	it("breekt niet op een status die het niet kent, en leest die als niet geleverd", async () => {
		await start([["/api/v1/berichten?", lijstMet({ aantalNietGeleverd: 1, nietGeleverd: [{ magazijnId: BD, naam: "Belastingdienst", status: "ONBEKEND_NIEUW" }] })]]);

		const uitkomst = await window.BerichtenboxKeten.berichten();
		expect(uitkomst.berichten).toHaveLength(5);
		expect(window.BerichtenboxKeten.melding.tekst).toContain("Belastingdienst");
	});

	it("meldt niets als iedereen leverde", async () => {
		await start([["/api/v1/berichten?", lijstMet({ aantalNietGeleverd: 0, nietGeleverd: [] })]]);

		expect(window.BerichtenboxKeten.melding).toBeNull();
	});

	it("gaat voor op wat de ronde zag, want de lijst is wat blijft", async () => {
		const stroom = () => sseVan([voltooid(RVO, "RVO", "OK", []), voltooid(BD, "Belastingdienst", "FOUT"), { event: "ophalen-gereed" }]);
		await start(rondeMetLijst(lijstMet({ aantalNietGeleverd: 1, nietGeleverd: [{ magazijnId: BD, naam: "Belastingdienst", status: "FOUT" }] }), stroom));

		expect(window.BerichtenboxKeten.melding.tekst).toMatch(/^Belastingdienst heeft uw berichten niet geleverd/);
	});

	it("verdwijnt zodra het aantal nul is, en komt terug als het weer oploopt", async () => {
		vi.useFakeTimers();
		const antwoorden = [
			{ aantalNietGeleverd: 1, nietGeleverd: [{ magazijnId: BD, naam: "Belastingdienst", status: "FOUT" }] },
			{ aantalNietGeleverd: 0, nietGeleverd: [] },
			{ aantalNietGeleverd: 1, nietGeleverd: [] },
		];
		let tik = 0;
		await start([["/api/v1/berichten?", () => lijstMet(antwoorden[Math.min(tik++, antwoorden.length - 1)])]]);
		expect(window.BerichtenboxKeten.melding).not.toBeNull();

		await vi.advanceTimersByTimeAsync(15000);
		expect(window.BerichtenboxKeten.melding).toBeNull();

		await vi.advanceTimersByTimeAsync(15000);
		expect(window.BerichtenboxKeten.melding.tekst).toMatch(/^Eén organisatie/);
	});
});

describe("een bericht uit zijn map halen", () => {
	it("stuurt een merge-patch met een lege map naar de organisatie van het bericht", async () => {
		const { aanroepen, ontvanger } = await start([
			["/api/v1/berichten?", lijstMet({ aantalNietGeleverd: 0, nietGeleverd: [] })],
			["?magazijnId=", antwoord(200, {})],
		]);

		const uitkomst = await window.BerichtenboxKeten.haalUitMap("b2");

		expect(uitkomst).toEqual({});
		const patch = aanroepen.find((a) => a.methode === "PATCH");
		expect(patch.pad).toBe("/api/v1/berichten/b2?magazijnId=" + BD);
		expect(patch.headers["X-Ontvanger"]).toBe(ontvanger);
		expect(patch.headers["Content-Type"]).toBe("application/merge-patch+json");
		// Niet `null`: in een merge-patch is dat "niet wijzigen".
		expect(JSON.parse(patch.body)).toEqual({ map: "" });
	});

	it("zet het bericht meteen zonder map in de lijst, zodat de map met zijn laatste bericht verdwijnt", async () => {
		await start([
			["/api/v1/berichten?", lijstMet({})],
			["?magazijnId=", antwoord(200, {})],
		]);
		const gemeld = [];
		window.BerichtenboxKeten.opWijziging((toestand) => gemeld.push(toestand.uitkomst));

		await window.BerichtenboxKeten.haalUitMap("b2");

		const laatste = gemeld[gemeld.length - 1];
		expect(laatste.berichten.find((b) => b.id === "b2").map).toBeNull();
		expect(laatste.berichten.some((b) => b.map === "Te bespreken met adviseur")).toBe(false);
	});

	it("laat het bericht in zijn map en zegt dat, als het stelsel weigert", async () => {
		await start([
			["/api/v1/berichten?", lijstMet({})],
			["?magazijnId=", antwoord(400, { title: "Bad Request" }, "application/problem+json")],
		]);

		const uitkomst = await window.BerichtenboxKeten.haalUitMap("b2");

		expect(uitkomst.fout).toMatch(/niet uit de map halen/);
		expect(window.BerichtenboxKeten.huidigeUitkomst.berichten.find((b) => b.id === "b2").map).toBe("Te bespreken met adviseur");
	});

	it("vraagt niets als het bericht niet in een map staat", async () => {
		const { aanroepen } = await start([["/api/v1/berichten?", lijstMet({})]]);

		expect(await window.BerichtenboxKeten.haalUitMap("b3")).toEqual({});
		expect(aanroepen.some((a) => a.methode === "PATCH")).toBe(false);
	});

	it("laat een tik die de lijst van vóór de wijziging ophaalde het bericht niet terugzetten", async () => {
		vi.useFakeTimers();
		let losmaken;
		let tik = 0;
		await start([
			[
				"/api/v1/berichten?",
				() => {
					if (tik++ === 0) return lijstMet({});
					// De tik vraagt de lijst op vóór de PATCH, en het antwoord komt erna binnen.
					return new Promise((klaar) => {
						losmaken = () => klaar(lijstMet({}));
					});
				},
			],
			["?magazijnId=", antwoord(200, {})],
		]);

		await vi.advanceTimersByTimeAsync(15000);
		expect(losmaken).toBeTypeOf("function");
		await window.BerichtenboxKeten.haalUitMap("b2");
		losmaken();
		await vi.advanceTimersByTimeAsync(0);

		expect(window.BerichtenboxKeten.huidigeUitkomst.berichten.find((b) => b.id === "b2").map).toBeNull();
	});

	it("zegt niet dat het bericht nog in de map staat als het antwoord te lang uitbleef", async () => {
		await start([
			["/api/v1/berichten?", lijstMet({})],
			[
				"?magazijnId=",
				() => {
					throw new DOMException("te laat", "TimeoutError");
				},
			],
		]);

		const uitkomst = await window.BerichtenboxKeten.haalUitMap("b2");

		expect(uitkomst.fout).toMatch(/weten niet of het gelukt is/);
	});

	it("ziet een map die elders verdween bij de volgende tik", async () => {
		// Een ander tabblad, of de organisatie zelf. Dezelfde berichten in een andere map zijn een wijziging.
		vi.useFakeTimers();
		const zonderMap = BERICHTEN.map((b) => (b.berichtId === "b2" ? { ...b, map: "" } : b));
		let tik = 0;
		await start([["/api/v1/berichten?", () => lijstMet({}, tik++ === 0 ? BERICHTEN : zonderMap)]]);
		const gemeld = [];
		window.BerichtenboxKeten.opWijziging((toestand) => gemeld.push(toestand.uitkomst));

		await vi.advanceTimersByTimeAsync(15000);

		expect(gemeld.length).toBeGreaterThan(0);
		expect(gemeld[gemeld.length - 1].berichten.find((b) => b.id === "b2").map).toBeNull();
	});
});
