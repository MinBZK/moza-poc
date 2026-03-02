export default {
	title: "Componenten/Lijsten",
	argTypes: {
		type: {
			control: "select",
			options: ["ul", "ol", "dl"],
		},
		aantalItems: {
			control: { type: "range", min: 1, max: 10, step: 1 },
		},
	},
};

export const Speeltuin = {
	args: {
		type: "ul",
		aantalItems: 3,
	},
	render: ({ type, aantalItems }) => {
		if (type === "dl") {
			const items = Array.from({ length: aantalItems }, (_, i) =>
				`<dt>Term ${i + 1}</dt><dd>Beschrijving van term ${i + 1}.</dd>`
			).join("\n\t\t");
			return `<dl>\n\t\t${items}\n\t</dl>`;
		}
		const items = Array.from({ length: aantalItems }, (_, i) =>
			`<li>Item ${i + 1} in de lijst</li>`
		).join("\n\t\t");
		return `<${type}>\n\t\t${items}\n\t</${type}>`;
	},
};

export const OngeordendeLijst = () => `
	<ul>
		<li>Eerste item in een ongeordende lijst</li>
		<li>Tweede item in een ongeordende lijst</li>
		<li>Derde item in een ongeordende lijst</li>
	</ul>
`;

export const GeordendeLijst = () => `
	<ol>
		<li>Eerste item in een geordende lijst</li>
		<li>Tweede item in een geordende lijst</li>
		<li>Derde item in een geordende lijst</li>
	</ol>
`;

export const Definitielijst = () => `
	<dl>
		<dt>Definitieterm</dt>
		<dd>Dit is de beschrijving van de definitieterm.</dd>
		<dt>Tweede term</dt>
		<dd>Dit is de beschrijving van de tweede term.</dd>
	</dl>
`;
