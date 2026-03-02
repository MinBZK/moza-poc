export default {
	title: "Typografie/Koppen",
	argTypes: {
		tekst: { control: "text" },
		niveau: {
			control: "select",
			options: ["h1", "h2", "h3", "h4", "h5", "h6"],
		},
	},
};

export const Speeltuin = {
	args: {
		tekst: "Voorbeeld koptekst",
		niveau: "h1",
	},
	render: ({ tekst, niveau }) =>
		`<${niveau}>${tekst}</${niveau}>`,
};

export const AlleKoppen = () => `
	<h1>Koptekst niveau 1</h1>
	<h2>Koptekst niveau 2</h2>
	<h3>Koptekst niveau 3</h3>
	<h4>Koptekst niveau 4</h4>
	<h5>Koptekst niveau 5</h5>
	<h6>Koptekst niveau 6</h6>
`;

export const H1 = () => `<h1>Koptekst niveau 1</h1>`;
export const H2 = () => `<h2>Koptekst niveau 2</h2>`;
export const H3 = () => `<h3>Koptekst niveau 3</h3>`;
export const H4 = () => `<h4>Koptekst niveau 4</h4>`;
export const H5 = () => `<h5>Koptekst niveau 5</h5>`;
export const H6 = () => `<h6>Koptekst niveau 6</h6>`;
