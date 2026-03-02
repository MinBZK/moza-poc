export default {
	title: "Componenten/Link",
	argTypes: {
		tekst: { control: "text" },
		href: { control: "text" },
		inZin: { control: "boolean" },
	},
};

export const Speeltuin = {
	args: {
		tekst: "Hyperlink",
		href: "#",
		inZin: true,
	},
	render: ({ tekst, href, inZin }) => {
		const link = `<a href="${href}">${tekst}</a>`;
		return inZin ? `<p>Dit is een ${link} in een zin.</p>` : link;
	},
};

export const Standaard = () =>
	`<p>Dit is een <a href="#">hyperlink</a> in een zin.</p>`;

export const Alleenstaand = () => `<a href="#">Hyperlink</a>`;
