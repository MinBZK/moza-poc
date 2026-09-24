export default {
	title: "Componenten/Actiegroep",
	tags: ["autodocs"],
};

export const Standaard = {
	parameters: {
		docs: {
			description: {
				story: "Een actiegroep groepeert gerelateerde acties (knoppen). Op mobiel worden ze verticaal gestapeld, op desktop naast elkaar getoond.",
			},
		},
	},
	argTypes: {
		primair: { control: "text", name: "Primaire actie" },
		secundair: { control: "text", name: "Secundaire actie" },
	},
	args: {
		primair: "Opslaan",
		secundair: "Annuleer",
	},
	render: ({ primair, secundair }) => `
<div class="action-group">
	<button type="submit">${primair}</button>
	<button class="secondary">${secundair}</button>
</div>`,
};

export const MetCTA = {
	parameters: {
		docs: {
			description: {
				story: "Een actiegroep met een primaire knop en een CTA-link.",
			},
		},
	},
	render: () => `
<div class="action-group">
	<button type="submit">Opslaan</button>
	<a class="btn-cta" href="#">Meer informatie</a>
</div>`,
};
