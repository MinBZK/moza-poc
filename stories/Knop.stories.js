export default {
	title: "Componenten/Knop",
	argTypes: {
		label: { control: "text" },
		variant: {
			control: "select",
			options: ["primary", "secondary", "negative"],
		},
		type: {
			control: "select",
			options: ["button", "submit", "reset"],
		},
		inactief: { control: "boolean" },
	},
};

export const Speeltuin = {
	args: {
		label: "Knoptekst",
		variant: "primary",
		type: "button",
		inactief: false,
	},
	render: ({ label, variant, type, inactief }) => {
		const cls = variant === "primary" ? "" : variant;
		const attrs = inactief ? " aria-disabled" : "";
		return `<button type="${type}" class="${cls}"${attrs}>${label}</button>`;
	},
};

export const Primair = () =>
	`<button type="button">Standaard primaire knop</button>`;

export const Secundair = () =>
	`<button type="button" class="secondary">Secundaire knop</button>`;

export const Reset = () => `<button type="reset">Reset knop</button>`;

export const Submit = () => `<button type="submit">Submit knop</button>`;

export const Inactief = () =>
	`<button aria-disabled>Inactieve knop</button>`;

export const Destructief = () =>
	`<button class="negative">Destructieve actie</button>`;

export const MetTekststijlen = () =>
	`<button type="button">Knop met <b>tekst</b> <i>stijlen</i></button>`;

export const MetIcoon = () =>
	`<button type="button"><span>⚑</span> Knop met icoon voor tekst</button>`;

export const AlleVarianten = () => `
	<div style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-start;">
		<button type="button">Primaire knop</button>
		<button type="button" class="secondary">Secundaire knop</button>
		<button type="reset">Reset knop</button>
		<button type="submit">Submit knop</button>
		<button class="negative">Destructieve actie</button>
		<button aria-disabled>Inactieve knop</button>
	</div>
`;
