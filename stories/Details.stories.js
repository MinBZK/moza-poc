export default {
	title: "Componenten/Details",
	argTypes: {
		samenvatting: { control: "text" },
		inhoud: { control: "text" },
		geopend: { control: "boolean" },
	},
};

export const Speeltuin = {
	args: {
		samenvatting: "Klik hier voor meer informatie",
		inhoud: "Dit is de verborgen inhoud die zichtbaar wordt na het klikken.",
		geopend: false,
	},
	render: ({ samenvatting, inhoud, geopend }) => {
		const openAttr = geopend ? " open" : "";
		return `
			<details${openAttr}>
				<summary>${samenvatting}</summary>
				<p>${inhoud}</p>
			</details>
		`;
	},
};

export const Standaard = () => `
	<details>
		<summary>Klik hier voor meer informatie</summary>
		<p>Dit is de verborgen inhoud die zichtbaar wordt na het klikken.</p>
	</details>
`;

export const Geopend = () => `
	<details open>
		<summary>Klik hier voor meer informatie</summary>
		<p>Dit is de verborgen inhoud die zichtbaar wordt na het klikken.</p>
	</details>
`;
