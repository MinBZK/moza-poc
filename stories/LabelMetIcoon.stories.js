const icons = {};
const iconNames = ["berichtenbox", "bewerken", "chevron", "financieen", "foutmelding", "gegevens", "gegevensdeling", "gezondheid", "home", "informatie", "instellingen", "link-extern", "link-intern", "lopende-zaken", "menu", "minus", "nieuws", "personeel", "persoon", "plus", "sluiten", "succes", "uitloggen", "vervoer", "vink", "waarschuwing"];

async function loadIcon(name) {
	if (!icons[name]) {
		const response = await fetch(`/assets/icons/icon-${name}.svg`);
		icons[name] = await response.text();
	}
	return icons[name];
}

export default {
	title: "Componenten/Label met icoon",
	tags: ["autodocs"],
};

export const Standaard = {
	parameters: {
		docs: {
			description: {
				story: "Een niet-klikbaar label met een icoon, bijvoorbeeld voor het tonen van een gebruikersnaam. Gebruik een icoon niet zonder begeleidend tekstlabel, tenzij het pictogram in het icoon universeel begrepen wordt, zoals een vergrootglas voor zoeken of een kruisje voor sluiten.",
			},
		},
	},
	argTypes: {
		label: { control: "text", name: "Label" },
		icoon: { control: "select", options: iconNames, name: "Icoon" },
	},
	args: {
		label: "Robin Vogel",
		icoon: "persoon",
	},
	render: ({ label, icoon }) => {
		const container = document.createElement("div");
		loadIcon(icoon).then((svg) => {
			container.innerHTML = `
<span class="icon-label">
	${svg}
	${label}
</span>`;
		});
		return container;
	},
};
