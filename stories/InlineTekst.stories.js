export default {
	title: "Typografie/Inline tekst",
	argTypes: {
		tekst: { control: "text" },
		element: {
			control: "select",
			options: ["mark", "del", "ins", "code", "kbd", "samp", "var", "abbr"],
		},
	},
};

export const Speeltuin = {
	args: {
		tekst: "Voorbeeld tekst",
		element: "mark",
	},
	render: ({ tekst, element }) =>
		`<p><${element}>${tekst}</${element}></p>`,
};

export const Gemarkeerd = () => `<p><mark>Dit is gemarkeerde tekst.</mark></p>`;

export const Doorgestreept = () =>
	`<p><del>Dit is doorgestreepte tekst.</del></p>`;

export const Ingevoegd = () => `<p><ins>Dit is ingevoegde tekst.</ins></p>`;

export const SubscriptSuperscript = () => `
	<p>
		<sub>subscript</sub> en <sup>superscript</sup> voor bijvoorbeeld een
		wiskundige formule als x<sup>2</sup><sub>n</sub> + y<sup>2</sup><sub>n</sub> = r<sup>2</sup>
	</p>
`;

export const InlineCode = () =>
	`<p>Dit is <code>inline code</code> in een zin.</p>`;

export const Afkorting = () =>
	`<p>Dit is een <abbr title="afkorting">afk.</abbr> in een zin.</p>`;

export const Toetsenbord = () =>
	`<p><kbd>Ctrl</kbd> + <kbd>S</kbd> om op te slaan.</p>`;

export const Voorbeelduitvoer = () =>
	`<p>Het resultaat is <samp>voorbeelduitvoer</samp>.</p>`;

export const Variabele = () =>
	`<p>De variabele <var>x</var> staat voor een onbekende waarde.</p>`;
