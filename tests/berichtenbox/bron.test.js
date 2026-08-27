import { describe, it, expect, vi, afterEach } from "vitest";
import { maakRegister } from "../../assets/javascript/berichtenbox/bron.js";

const LEEG = { berichten: [], magazijnen: [], mappen: [] };

function nepBron(naam, geldt, inhoud = LEEG) {
	return { naam, geldtVoor: async () => geldt, laad: async () => inhoud };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("maakRegister — kiezen", () => {
	it("kiest de eerste bron die van toepassing is", async () => {
		const register = maakRegister();
		register.registreer(nepBron("keten", true));
		register.registreer(nepBron("dataset", true));
		expect((await register.kies({ id: "koffiezaak" })).naam).toBe("keten");
	});

	it("slaat een bron over die niet van toepassing is", async () => {
		const register = maakRegister();
		register.registreer(nepBron("keten", false));
		register.registreer(nepBron("dataset", true));
		expect((await register.kies({ id: "x" })).naam).toBe("dataset");
	});

	it("laat een bron die gooit de volgende niet blokkeren, en meldt dat", async () => {
		const fout = vi.spyOn(console, "error").mockImplementation(() => {});
		const register = maakRegister();
		register.registreer({ naam: "stuk", geldtVoor: async () => { throw new Error("plat"); }, laad: async () => LEEG });
		register.registreer(nepBron("dataset", true));
		expect((await register.kies({ id: "x" })).naam).toBe("dataset");
		expect(fout).toHaveBeenCalled();
	});

	it("geeft null als geen enkele bron van toepassing is", async () => {
		const register = maakRegister();
		register.registreer(nepBron("keten", false));
		expect(await register.kies({ id: "x" })).toBe(null);
	});

	it("geeft null zonder geregistreerde bronnen", async () => {
		expect(await maakRegister().kies(null)).toBe(null);
	});

	it("onthoudt de gekozen bron", async () => {
		const register = maakRegister();
		register.registreer(nepBron("dataset", true));
		expect(register.actief()).toBe(null);
		await register.kies(null);
		expect(register.actief().naam).toBe("dataset");
	});

	it("wist de gekozen bron als een tweede keuze niets oplevert", async () => {
		const register = maakRegister();
		let geldt = true;
		register.registreer({ naam: "wisselend", geldtVoor: async () => geldt, laad: async () => LEEG });
		await register.kies(null);
		geldt = false;
		await register.kies(null);
		expect(register.actief()).toBe(null);
	});

	it("geeft de persona door aan geldtVoor", async () => {
		const gezien = [];
		const register = maakRegister();
		register.registreer({ naam: "x", geldtVoor: async (p) => { gezien.push(p); return true; }, laad: async () => LEEG });
		await register.kies({ id: "koffiezaak" });
		expect(gezien).toEqual([{ id: "koffiezaak" }]);
	});
});

describe("maakRegister — wijzigingen melden", () => {
	it("meldt een wijziging aan alle luisteraars", () => {
		const register = maakRegister();
		const een = vi.fn();
		const twee = vi.fn();
		register.opWijziging(een);
		register.opWijziging(twee);
		register.meld({ berichten: [{ id: "a" }], magazijnen: [], mappen: [] });
		expect(een).toHaveBeenCalledOnce();
		expect(twee).toHaveBeenCalledOnce();
		expect(een.mock.calls[0][0].berichten).toHaveLength(1);
	});

	it("laat een luisteraar die gooit de rest niet blokkeren", () => {
		const fout = vi.spyOn(console, "error").mockImplementation(() => {});
		const register = maakRegister();
		const daarna = vi.fn();
		register.opWijziging(() => { throw new Error("plat"); });
		register.opWijziging(daarna);
		register.meld(LEEG);
		expect(daarna).toHaveBeenCalledOnce();
		expect(fout).toHaveBeenCalled();
	});

	it("doet niets zonder luisteraars", () => {
		expect(() => maakRegister().meld(LEEG)).not.toThrow();
	});
});
