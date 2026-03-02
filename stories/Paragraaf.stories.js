export default {
	title: "Typografie/Paragraaf",
	argTypes: {
		tekst: { control: "text" },
		variant: {
			control: "select",
			options: ["standaard", "intro", "small"],
		},
	},
};

export const Speeltuin = {
	args: {
		tekst: "Dit is een voorbeeld alinea met lopende tekst.",
		variant: "standaard",
	},
	render: ({ tekst, variant }) => {
		const cls = variant === "intro" ? ' class="intro"' : "";
		if (variant === "small") return `<p><small>${tekst}</small></p>`;
		return `<p${cls}>${tekst}</p>`;
	},
};

export const Standaard = () => `
	<p>
		Dit is een standaard alinea met lopende tekst en
		<strong>tekst met sterke nadruk</strong>, <em>tekst met klemtoon</em> en
		<strong><em>tekst met sterke nadruk én klemtoon</em></strong>.
		Deze gebruiken hiervoor de semantische HTML elementen
		<code>&lt;strong&gt;</code> en <code>&lt;em&gt;</code>.
	</p>
`;

export const Introductie = () => `
	<p class="intro">
		Dit is een introductie alinea. Deze maakt het mogelijk om de introductie
		van de rest van de tekst te onderscheiden.
	</p>
`;

export const KleineTekst = () => `<p><small>Dit is kleine tekst.</small></p>`;
