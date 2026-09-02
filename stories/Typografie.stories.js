export default {
	title: "Typografie/Koppen",
	tags: ["autodocs"],
	parameters: {
		docs: {
			description: {
				component: `Kopteksten (\`<h1>\`–\`<h6>\`) structureren de pagina-inhoud in een logische hiërarchie. Het heading-niveau wordt bepaald door de positie in de documentstructuur, niet door de gewenste visuele grootte.

**Semantiek boven vormgeving**

Gebruik altijd het juiste heading-niveau voor de context. Een \`<h3>\` volgt op een \`<h2>\`, niet op een \`<h1>\`. Sla geen niveaus over, dat verstoort de navigatie voor screenreaders en de inhoudsopgave.

**Visuele stijlklassen**

Wanneer het ontwerp een andere visuele grootte vraagt dan het semantische niveau, gebruik dan de stijlklassen \`.h1\` t/m \`.h6\`:

\`\`\`html
<h3 class="h2">Visueel als h2, semantisch een h3</h3>
\`\`\`

Zo blijft de heading-hiërarchie intact voor hulptechnologie, terwijl het ontwerp flexibel blijft. Dit is bijvoorbeeld nuttig bij componenten (zoals feedbackmeldingen of cards) die op verschillende plekken in de pagina geplaatst kunnen worden.`,
			},
		},
	},
};

export const AlleKoppen = {
	parameters: {
		docs: {
			description: {
				story: "Overzicht van alle zes kopniveaus naast elkaar ter vergelijking.",
			},
		},
	},
	argTypes: {
		h1: { name: "H1", control: "text" },
		h2: { name: "H2", control: "text" },
		h3: { name: "H3", control: "text" },
		h4: { name: "H4", control: "text" },
		h5: { name: "H5", control: "text" },
		h6: { name: "H6", control: "text" },
	},
	args: {
		h1: "Koptekst niveau 1",
		h2: "Koptekst niveau 2",
		h3: "Koptekst niveau 3",
		h4: "Koptekst niveau 4",
		h5: "Koptekst niveau 5",
		h6: "Koptekst niveau 6",
	},
	render: ({ h1, h2, h3, h4, h5, h6 }) => `
<h1>${h1}</h1>
<h2>${h2}</h2>
<h3>${h3}</h3>
<h4>${h4}</h4>
<h5>${h5}</h5>
<h6>${h6}</h6>
`,
};

export const H1 = {
	parameters: {
		docs: {
			description: {
				story: "Koptekst niveau 1. Gebruik voor de hoofdtitel van een pagina.",
			},
		},
	},
	argTypes: { tekst: { control: "text", name: "Tekst" } },
	args: { tekst: "Koptekst niveau 1" },
	render: ({ tekst }) => `<h1>${tekst}</h1>`,
};

export const H2 = {
	parameters: {
		docs: {
			description: {
				story: "Koptekst niveau 2. Gebruik voor hoofdsecties binnen een pagina.",
			},
		},
	},
	argTypes: { tekst: { control: "text", name: "Tekst" } },
	args: { tekst: "Koptekst niveau 2" },
	render: ({ tekst }) => `<h2>${tekst}</h2>`,
};

export const H3 = {
	parameters: {
		docs: {
			description: {
				story: "Koptekst niveau 3. Gebruik voor subsecties.",
			},
		},
	},
	argTypes: { tekst: { control: "text", name: "Tekst" } },
	args: { tekst: "Koptekst niveau 3" },
	render: ({ tekst }) => `<h3>${tekst}</h3>`,
};

export const H4 = {
	parameters: {
		docs: {
			description: {
				story: "Koptekst niveau 4.",
			},
		},
	},
	argTypes: { tekst: { control: "text", name: "Tekst" } },
	args: { tekst: "Koptekst niveau 4" },
	render: ({ tekst }) => `<h4>${tekst}</h4>`,
};

export const H5 = {
	parameters: {
		docs: {
			description: {
				story: "Koptekst niveau 5.",
			},
		},
	},
	argTypes: { tekst: { control: "text", name: "Tekst" } },
	args: { tekst: "Koptekst niveau 5" },
	render: ({ tekst }) => `<h5>${tekst}</h5>`,
};

export const H6 = {
	parameters: {
		docs: {
			description: {
				story: "Koptekst niveau 6.",
			},
		},
	},
	argTypes: { tekst: { control: "text", name: "Tekst" } },
	args: { tekst: "Koptekst niveau 6" },
	render: ({ tekst }) => `<h6>${tekst}</h6>`,
};
