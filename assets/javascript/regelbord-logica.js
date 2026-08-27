/**
 * regelbord-logica.js
 *
 * Alles wat het bord "Wetten en regels" beslist zonder DOM: welke kaarten een
 * persona krijgt, in welke kolom de assistent ze voorstelt, hoe de stand per
 * persona wordt bewaard, en hoe de zoekbalk zoekt. Eén bron voor de browser
 * (regelbord.js) en voor de tests (node --test).
 */
(function (root, maak) {
	var api = maak();
	if (typeof module === "object" && module.exports) module.exports = api;
	else root.MozaRegelbord = api;
})(typeof self !== "undefined" ? self : this, function () {
	"use strict";

	var KOLOMMEN = [
		{ id: "te-doen", label: "Te doen" },
		{ id: "mee-bezig", label: "Mee bezig" },
		{ id: "komt-eraan", label: "Komt eraan" },
		{ id: "niet-beoordelen", label: "Niet beoordelen" },
		{ id: "afgerond", label: "Afgerond" },
	];

	var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

	// "1 juli 2026" -> Date; alles wat niet die vorm heeft -> null. Datums in
	// _data/ staan uitgeschreven (schrijfwijzer), dus dit is de enige vorm.
	function parseDatum(tekst) {
		var m = /^\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})\s*$/i.exec(String(tekst || ""));
		if (!m) return null;
		var maand = MAANDEN.indexOf(m[2].toLowerCase());
		if (maand < 0) return null;
		return new Date(Date.UTC(Number(m[3]), maand, Number(m[1])));
	}

	function vind(lijst, id) {
		for (var i = 0; i < lijst.length; i++) if (lijst[i].id === id) return lijst[i];
		return null;
	}

	function kaartenVoor(persona, regelgeving, subsidies) {
		var kaarten = [];
		((persona && persona.regelgeving) || []).forEach(function (id) {
			var item = vind(regelgeving || [], id);
			if (item) kaarten.push({ id: id, soort: "regeling", item: item });
		});
		((persona && persona.subsidies) || []).forEach(function (id) {
			var item = vind(subsidies || [], id);
			if (item) kaarten.push({ id: id, soort: "subsidie", item: item });
		});
		return kaarten;
	}

	// Een zaak hoort bij een kaart als de zaak de regel-id draagt, of als het
	// onderwerp de titel raakt (de assistent zet nog geen regel-id op een zaak).
	function zaakVoor(kaart, zaken) {
		var titel = String(kaart.item.titel || "").toLowerCase();
		for (var i = 0; i < (zaken || []).length; i++) {
			var z = zaken[i];
			if (z.regelId === kaart.id) return z;
			var onderwerp = String(z.onderwerp || z.titel || "").toLowerCase();
			if (kaart.id === "milieubeheer" && /energiebespar|informatieplicht/.test(onderwerp)) return z;
			if (onderwerp && titel.indexOf(onderwerp) >= 0) return z;
		}
		return null;
	}

	function isAfgerond(zaak) {
		return /ingediend|afgehandeld|afgerond|toegekend/i.test(String(zaak.status || ""));
	}

	function voorstelKolom(kaart, context) {
		var vandaag = context.vandaag || new Date();
		var zaak = zaakVoor(kaart, context.zaken);
		if (zaak) return isAfgerond(zaak) ? "afgerond" : "mee-bezig";
		if (context.verborgenTitels && context.verborgenTitels.has(kaart.item.titel)) return "niet-beoordelen";
		var start = parseDatum(kaart.item.inwerkingtreding);
		if (start && start.getTime() > vandaag.getTime()) return "komt-eraan";
		return "te-doen";
	}

	function sleutel(kvk) {
		return "bord:" + String(kvk || "");
	}

	function leesBord(storage, kvk) {
		try {
			var ruw = storage.getItem(sleutel(kvk));
			var data = ruw ? JSON.parse(ruw) : null;
			return data && typeof data === "object" ? data : {};
		} catch (e) {
			return {};
		}
	}

	function schrijfBord(storage, kvk, bord) {
		try {
			storage.setItem(sleutel(kvk), JSON.stringify(bord || {}));
		} catch (e) {
			/* opslag vol of geblokkeerd: het bord werkt dan alleen deze sessie */
		}
	}

	function plaatsing(kaart, bord, context) {
		var eigen = bord && bord[kaart.id];
		if (eigen && eigen.door === "ondernemer") return eigen;
		return { kolom: voorstelKolom(kaart, context), door: "assistent" };
	}

	function normaliseer(tekst) {
		return String(tekst || "")
			.toLowerCase()
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.replace(/[^a-z0-9&+ ]+/g, " ");
	}

	function woorden(tekst) {
		return normaliseer(tekst)
			.split(/\s+/)
			.filter(function (w) {
				return w.length >= 2;
			});
	}

	// Gewogen woordmatch: titel > geldtVoor > beschrijving > inhoud. Een woord
	// raakt ook als het als deel van een langer woord voorkomt
	// (energiebesparing ⊂ energiebesparingsplicht).
	function scoreVoor(termen, item) {
		var velden = [
			[item.titel, 5],
			[item.geldtVoor, 3],
			[item.beschrijving, 2],
			[(item.inhoud || []).join(" "), 1],
		];
		var score = 0;
		var titel = " " + normaliseer(item.titel) + " ";
		termen.forEach(function (term) {
			velden.forEach(function (veld) {
				if (normaliseer(veld[0]).indexOf(term) >= 0) score += veld[1];
			});
			// Een heel woord in de titel telt extra: "energie" in "Duurzame
			// Energie" boven "energie" als deel van "energiebesparing".
			if (titel.indexOf(" " + term + " ") >= 0) score += 4;
		});
		return score;
	}

	function zoek(vraag, regelgeving, subsidies, extraTermen) {
		var termen = woorden(vraag).concat((extraTermen || []).map(normaliseer).filter(Boolean));
		if (!termen.length) return [];
		var alles = (regelgeving || [])
			.map(function (r) {
				return { id: r.id, soort: "regeling", item: r };
			})
			.concat(
				(subsidies || []).map(function (s) {
					return { id: s.id, soort: "subsidie", item: s };
				})
			);
		return alles
			.map(function (k) {
				k.score = scoreVoor(termen, k.item);
				return k;
			})
			.filter(function (k) {
				return k.score > 0;
			})
			.sort(function (a, b) {
				return b.score - a.score;
			});
	}

	return {
		KOLOMMEN: KOLOMMEN,
		parseDatum: parseDatum,
		kaartenVoor: kaartenVoor,
		voorstelKolom: voorstelKolom,
		leesBord: leesBord,
		schrijfBord: schrijfBord,
		plaatsing: plaatsing,
		zoek: zoek,
	};
});
