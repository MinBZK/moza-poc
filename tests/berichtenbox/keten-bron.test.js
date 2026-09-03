import { describe, it, expect, vi, afterEach } from "vitest";
import { ketenBron } from "../../assets/javascript/berichtenbox/keten-bron.js";
import { maakRegister } from "../../assets/javascript/berichtenbox/bron.js";

/** Een dubbel voor berichtenbox-keten.js: dezelfde vorm, zonder netwerk. */
function nepKeten({ bezig = false, aangesloten = false, uitkomst = null, melding = null, faalt = false } = {}) {
	const kijkers = [];
	return {
		bezig,
		aangesloten,
		melding,
		voortgang: null,
		berichten: async () => {
			if (faalt) return null;
			return uitkomst;
		},
		opWijziging: (kijker) => kijkers.push(kijker),
		meldVerwerkingsfout: vi.fn(),
		_meld: (toestand) => kijkers.forEach((k) => k(toestand)),
		_kijkers: kijkers,
	};
}

const UITKOMST = {
	berichten: [{ id: "b-1", magazijnId: "kvk", afzender: "KVK", onderwerp: "Uittreksel", uitKeten: true }],
	magazijnen: [{ id: "kvk", naam: "KVK" }],
};

afterEach(() => vi.restoreAllMocks());

describe("ketenBron — is deze bron van toepassing", () => {
	it("niet als er geen keten-script op de pagina staat", async () => {
		expect(await ketenBron(undefined).geldtVoor()).toBe(false);
	});

	it("niet als er geen ronde loopt en de persona niet aangesloten is", async () => {
		expect(await ketenBron(nepKeten()).geldtVoor()).toBe(false);
	});

	it("wacht de lopende ronde af voordat hij antwoordt", async () => {
		// Zou hij meteen false zeggen, dan eist de dataset-bron de aangesloten persona op en ziet
		// die verzonnen berichten in plaats van zijn eigen post.
		let losmaken;
		const keten = nepKeten({ bezig: true });
		keten.berichten = () =>
			new Promise((klaar) => {
				losmaken = () => klaar(UITKOMST);
			});

		const bron = ketenBron(keten);
		let beantwoord = false;
		const vraag = bron.geldtVoor().then((antwoord) => {
			beantwoord = true;
			return antwoord;
		});

		await Promise.resolve();
		expect(beantwoord).toBe(false);

		losmaken();
		expect(await vraag).toBe(true);
	});

	it("blijft van toepassing als de ronde mislukt voor een aangesloten persona", async () => {
		// Geen stille terugval: de dataset is voor deze persona aantoonbaar niet zijn post.
		const bron = ketenBron(nepKeten({ bezig: true, aangesloten: true, faalt: true }));
		expect(await bron.geldtVoor()).toBe(true);
		await expect(bron.laad()).rejects.toThrow(/mislukt/);
	});

	it("laat een niet-aangesloten persona door naar de dataset", async () => {
		const bron = ketenBron(nepKeten({ bezig: true, faalt: true }));
		expect(await bron.geldtVoor()).toBe(false);
	});

	it("levert de berichten van een geslaagde ronde", async () => {
		const bron = ketenBron(nepKeten({ bezig: true, uitkomst: UITKOMST }));
		await bron.geldtVoor();
		const inhoud = await bron.laad();

		expect(inhoud.berichten).toEqual(UITKOMST.berichten);
		expect(inhoud.magazijnen).toEqual(UITKOMST.magazijnen);
		// De keten kent geen mappen; die zijn van de bezoeker en staan in de bewaarde staat.
		expect(inhoud.mappen).toEqual([]);
	});
});

describe("ketenBron — meldingen", () => {
	it("geeft een storing van de keten door als storing", async () => {
		const meldStoring = vi.fn();
		const keten = nepKeten({ bezig: true, aangesloten: true, faalt: true, melding: { soort: "storing", tekst: "Bronnen onbereikbaar." } });
		await ketenBron(keten, { meldStoring }).geldtVoor();

		expect(meldStoring).toHaveBeenCalledWith("Bronnen onbereikbaar.", "storing");
	});

	it("geeft een onvolledige lijst door als mededeling, niet als storing", async () => {
		// Er staat wél een lijst; die is alleen niet volledig. Dat is geen alarm.
		const meldStoring = vi.fn();
		const keten = nepKeten({ bezig: true, uitkomst: UITKOMST, melding: { soort: "mededeling", tekst: "Eén organisatie antwoordde niet." } });
		await ketenBron(keten, { meldStoring }).geldtVoor();

		expect(meldStoring).toHaveBeenCalledWith("Eén organisatie antwoordde niet.", "info");
	});

	it("meldt niets als er niets te melden is", async () => {
		const meldStoring = vi.fn();
		await ketenBron(nepKeten({ bezig: true, uitkomst: UITKOMST }), { meldStoring }).geldtVoor();

		expect(meldStoring).not.toHaveBeenCalled();
	});
});

describe("ketenBron — een volgende ronde", () => {
	it("meldt een nieuwe lijst als een bronwijziging", async () => {
		const keten = nepKeten({ bezig: true, uitkomst: UITKOMST });
		const bron = ketenBron(keten);
		await bron.geldtVoor();

		const meld = vi.fn(() => []);
		bron.start(meld);

		const tweede = { berichten: [{ id: "b-2", magazijnId: "kvk" }], magazijnen: UITKOMST.magazijnen };
		keten._meld({ melding: null, uitkomst: tweede });

		expect(meld).toHaveBeenCalledWith({ berichten: tweede.berichten, magazijnen: tweede.magazijnen, mappen: [] });
	});

	it("meldt dezelfde uitkomst niet nog een keer", async () => {
		const keten = nepKeten({ bezig: true, uitkomst: UITKOMST });
		const bron = ketenBron(keten);
		await bron.geldtVoor();

		const meld = vi.fn(() => []);
		bron.start(meld);
		keten._meld({ melding: null, uitkomst: UITKOMST });

		expect(meld).not.toHaveBeenCalled();
	});

	it("zegt het tegen de keten als de nieuwe lijst niet te tonen was", async () => {
		// De keten heeft zojuist gemeld dat het ophalen lukte. Blijft het scherm leeg, dan klopt
		// die melding niet meer.
		const keten = nepKeten({ bezig: true, uitkomst: UITKOMST });
		const bron = ketenBron(keten);
		await bron.geldtVoor();

		bron.start(() => [new Error("rij niet te bouwen")]);
		keten._meld({ melding: null, uitkomst: { berichten: [], magazijnen: [] } });

		expect(keten.meldVerwerkingsfout).toHaveBeenCalled();
	});

	it("overleeft een keten zonder opWijziging", async () => {
		const bron = ketenBron({ bezig: false, aangesloten: false });
		expect(() => bron.start(() => [])).not.toThrow();
	});
});

describe("ketenBron in het register", () => {
	it("wint van de dataset als de persona aangesloten is", async () => {
		const register = maakRegister();
		register.registreer(ketenBron(nepKeten({ bezig: true, aangesloten: true, uitkomst: UITKOMST })));
		register.registreer({ naam: "dataset", geldtVoor: async () => true, laad: async () => ({ berichten: [] }) });

		expect((await register.kies("proeftuin-een")).naam).toBe("keten");
	});

	it("laat de dataset winnen als de persona niet aangesloten is", async () => {
		const register = maakRegister();
		register.registreer(ketenBron(nepKeten()));
		register.registreer({ naam: "dataset", geldtVoor: async () => true, laad: async () => ({ berichten: [] }) });

		expect((await register.kies("koffiezaak")).naam).toBe("dataset");
	});
});

describe("ketenBron — berichten die tijdens het kijken binnenkomen", () => {
	/** De vorige lijst plus wat er bij kwam, in de volgorde die het stelsel teruggeeft: nieuwste eerst. */
	function metAanwas(...nieuw) {
		return { berichten: [...nieuw, ...UITKOMST.berichten], magazijnen: UITKOMST.magazijnen };
	}

	const B2 = { id: "b-2", magazijnId: "kvk", afzender: "KVK", onderwerp: "Aanslag", uitKeten: true };
	const B3 = { id: "b-3", magazijnId: "kvk", afzender: "KVK", onderwerp: "Herinnering", uitKeten: true };

	async function gestarteBron(opties) {
		const keten = nepKeten({ bezig: true, uitkomst: UITKOMST });
		const bron = ketenBron(keten, opties);
		await bron.geldtVoor();
		const meld = vi.fn(() => []);
		bron.start(meld);
		return { keten, meld };
	}

	it("meldt aanwas als los binnengekomen bericht, niet als nieuwe lijst", async () => {
		// Zelfde weg als de dataset-bron: de render-laag zet een `nieuwBericht` bovenaan met een
		// fade-in en meldt het in het live-gebied. Een hele lijst zou de rijen stil vervangen.
		const { keten, meld } = await gestarteBron();

		keten._meld({ melding: null, uitkomst: metAanwas(B2) });

		expect(meld).toHaveBeenCalledTimes(1);
		expect(meld).toHaveBeenCalledWith({ nieuwBericht: B2 });
	});

	it("meldt meerdere binnenkomers oudste eerst, zodat de nieuwste bovenaan eindigt", async () => {
		// Elk gemeld bericht komt bovenop het vorige. Zouden we de lijstvolgorde volgen — nieuwste
		// eerst — dan staat de oudste binnenkomer straks bovenaan.
		const { keten, meld } = await gestarteBron();

		keten._meld({ melding: null, uitkomst: metAanwas(B3, B2) });

		expect(meld.mock.calls.map((aanroep) => aanroep[0].nieuwBericht.id)).toEqual(["b-2", "b-3"]);
	});

	it("meldt de hele lijst als er ook een bericht verdwenen is", async () => {
		// Dan is het geen aanwas maar een andere lijst, en die hoort in één keer op het scherm.
		const { keten, meld } = await gestarteBron();
		const anders = { berichten: [B2], magazijnen: UITKOMST.magazijnen };

		keten._meld({ melding: null, uitkomst: anders });

		expect(meld).toHaveBeenCalledWith({ berichten: anders.berichten, magazijnen: anders.magazijnen, mappen: [] });
	});

	it("meldt de hele lijst waar een binnenkomer niet te zien zou zijn", async () => {
		// Buiten de inbox, of op pagina 2: daar landt een `nieuwBericht` bovenaan een lijst die de
		// bezoeker niet voor zich heeft. Dan liever de lijst zelf bijwerken.
		const { keten, meld } = await gestarteBron({ magDruppelen: () => false });

		keten._meld({ melding: null, uitkomst: metAanwas(B2) });

		expect(meld).toHaveBeenCalledWith({ berichten: [B2, ...UITKOMST.berichten], magazijnen: UITKOMST.magazijnen, mappen: [] });
	});

	it("meldt niets als dezelfde berichten opnieuw langskomen", async () => {
		// Elke pollronde levert een nieuw object met dezelfde inhoud. Dat is geen wijziging, en een
		// melding zou de lijst laten knipperen zonder dat er iets veranderd is.
		const { keten, meld } = await gestarteBron();

		keten._meld({ melding: null, uitkomst: { berichten: [...UITKOMST.berichten], magazijnen: UITKOMST.magazijnen } });

		expect(meld).not.toHaveBeenCalled();
	});

	it("zegt het tegen de keten als een binnenkomer niet te tonen was", async () => {
		const keten = nepKeten({ bezig: true, uitkomst: UITKOMST });
		const bron = ketenBron(keten);
		await bron.geldtVoor();
		bron.start(() => [new Error("rij niet te bouwen")]);

		keten._meld({ melding: null, uitkomst: metAanwas(B2) });

		expect(keten.meldVerwerkingsfout).toHaveBeenCalled();
	});
});
