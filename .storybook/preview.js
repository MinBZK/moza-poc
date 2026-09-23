import "../style/style.css";
import "../assets/javascript/aria-disabled.js";
import "../assets/javascript/indeterminate.js";

/** @type { import('@storybook/html-vite').Preview } */
const preview = {
	parameters: {
		a11y: {
			config: {
				rules: [
					{
						id: "region",
						enabled: false,
					},
				],
			},
		},
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		docs: {
			source: {
				format: true,
			},
		},
		options: {
			storySort: {
				order: [
					"Introductie",
					["Over dit prototype", "Ontwerpprincipes", "Ontwerpprincipes: Wat: Visie en principes", "Ontwerpprincipes: Hoe: Werkwijze en techniek", "Schrijfwijzer"],
					"Typografie",
					["Koppen", "Paragraaf", "Block-level tekst", "Inline tekst"],
					"Design tokens",
					["Kleurenpalet", "Ruimtelijk systeem", "Transities"],
					"Ontwerppatronen",
					["Interactie op inhoud", "Context wisselen", "E-mailverificatie", "Digitale assistent", "AI-statusindicator"],
					"Componenten",
					[
						"Navigatie",
						"Footer",
						"Feedback",
						"Tekstinvoer",
						"Selectie",
						"Knop",
						"Actiegroep",
						"Link",
						"Iconen",
						"Link met icoon",
						"Label met icoon",
						"Lijsten",
						"Tabel",
						"Card",
						"Tiles",
						"Accordeon",
						"Badge",
					]
				],
			},
		},
	},
};

export default preview;
