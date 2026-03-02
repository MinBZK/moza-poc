export default {
	title: "Typografie/Block-level tekst",
	argTypes: {
		tekst: { control: "text" },
		type: {
			control: "select",
			options: ["blockquote", "pre", "code", "address"],
		},
	},
};

export const Speeltuin = {
	args: {
		tekst: "Dit is een voorbeeld van block-level tekst.",
		type: "blockquote",
	},
	render: ({ tekst, type }) => {
		if (type === "blockquote") return `<blockquote><p>${tekst}</p></blockquote>`;
		if (type === "code") return `<pre><code>${tekst}</code></pre>`;
		if (type === "address") return `<address>${tekst}</address>`;
		return `<pre>${tekst}</pre>`;
	},
};

export const Citaat = () => `
	<blockquote>
		<p>
			Dit is een citaat. De beste manier om de toekomst te voorspellen is om
			deze zelf te creëren.
		</p>
	</blockquote>
`;

export const VoorgeformatteerdeTekst = () => `
<pre>Dit is voorgeformatteerde tekst.
            Spaties en regelovergangen
            worden behouden.</pre>
`;

export const Codeblok = () => `
<pre><code>// Dit is een codeblok
function groet(naam) {
    return \`Hallo, \${naam}!\`;
}</code></pre>
`;

export const Adres = () => `
	<address>
		Contactgegevens<br />
		Voorbeeldstraat 1<br />
		1234 AB Den Haag
	</address>
`;
