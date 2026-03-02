import "../style/style.css";

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
	},
};

export default preview;
