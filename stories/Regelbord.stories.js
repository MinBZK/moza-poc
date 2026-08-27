export default {
	title: "Patronen/Wetten en regels (bord)",
	tags: ["autodocs"],
};

const kaart = (id, titel, feiten, herkomst, toetsbaar) => `
<li>
	<article class="regelkaart" aria-labelledby="kaart-${id}">
		<p class="regelkaart-label">Wet · Rijksoverheid</p>
		<h3 id="kaart-${id}">${titel}</h3>
		<p>Korte omschrijving van de regel in één zin.</p>
		<dl class="regelkaart-feiten">${feiten.map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`).join("")}</dl>
		<p class="regelkaart-herkomst">${herkomst}</p>
		<div class="regelkaart-acties">
			${toetsbaar ? '<button type="button">Geldt dit voor mij?</button>' : ""}
			<button type="button" class="secondary">Vraag de assistent</button>
			<div class="regelkaart-menu"><button type="button" class="secondary" aria-haspopup="true" aria-expanded="false">Verplaats naar…</button></div>
			<a class="link-button" href="#">Lees de regel</a>
		</div>
	</article>
</li>`;

export const Kaart = {
	parameters: {
		docs: {
			description: {
				story: "Eén regel of subsidie. De strook “Wat we weten” bevat alleen feiten met een bron; de herkomstregel zegt of de assistent de kaart plaatste of de ondernemer.",
			},
		},
	},
	render: () => `
<section class="regelbord-kolom" style="max-inline-size: 24rem">
	<ul>${kaart(
		"milieubeheer",
		"Wet milieubeheer: rapportageplicht energiebesparing",
		[
			["Geldt sinds", "1 juli 2023"],
			["Toets", "Automatisch te toetsen (RegelRecht)"],
		],
		"Voorgesteld door de assistent",
		true
	)}</ul>
</section>`,
};

export const Bord = {
	parameters: {
		docs: {
			description: {
				story: "Vijf kolommen: Te doen, Mee bezig, Komt eraan, Niet beoordelen, Afgerond. Verplaatsen gaat via een knopmenu, niet via slepen, zodat toetsenbord en screenreader hetzelfde kunnen.",
			},
		},
	},
	render: () => `
<section class="regelbord" aria-label="Uw wetten, regels en subsidies">
	<section class="regelbord-kolom"><h2>Te doen</h2><ul>${kaart(
		"arbowet",
		"Arbowet: RI&E",
		[
			["Geldt sinds", "1 januari 2020"],
			["Toets", "Niet automatisch te toetsen"],
		],
		"Voorgesteld door de assistent",
		false
	)}</ul></section>
	<section class="regelbord-kolom"><h2>Mee bezig</h2><ul>${kaart(
		"milieubeheer",
		"Wet milieubeheer: rapportageplicht energiebesparing",
		[
			["Zaak", "In behandeling, referentie RVO-EBR-2026-62345681-001"],
			["Toets", "Automatisch te toetsen (RegelRecht)"],
		],
		"Voorgesteld door de assistent",
		true
	)}</ul></section>
	<section class="regelbord-kolom"><h2>Komt eraan</h2><ul>${kaart(
		"upv",
		"Uitgebreide producentenverantwoordelijkheid verpakkingen",
		[
			["Geldt vanaf", "1 juli 2027"],
			["Toets", "Niet automatisch te toetsen"],
		],
		"Voorgesteld door de assistent",
		false
	)}</ul></section>
	<section class="regelbord-kolom"><h2>Niet beoordelen</h2><ul>${kaart(
		"dienstenwet",
		"Wijziging Dienstenwet: informatieplicht online platforms",
		[
			["Geldt sinds", "1 januari 2026"],
			["Toets", "Niet automatisch te toetsen"],
		],
		"Door u geplaatst op 27 augustus 2026 · Reden: geen online platform",
		false
	)}</ul></section>
	<section class="regelbord-kolom"><h2>Afgerond</h2><ul></ul></section>
</section>`,
};
