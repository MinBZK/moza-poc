export default {
	title: "Componenten/Navigatie",
	argTypes: {
		aantalItems: {
			control: { type: "range", min: 2, max: 8, step: 1 },
		},
		actievePagina: {
			control: { type: "number", min: 1, max: 8 },
		},
		type: {
			control: "select",
			options: ["hoofdnavigatie", "subnavigatie", "breadcrumb"],
		},
	},
};

export const Speeltuin = {
	args: {
		type: "hoofdnavigatie",
		aantalItems: 5,
		actievePagina: 1,
	},
	render: ({ type, aantalItems, actievePagina }) => {
		const labels =
			type === "breadcrumb"
				? ["Home", "Categorie", "Subcategorie", "Pagina", "Subpagina", "Detail", "Item", "Huidig"]
				: type === "hoofdnavigatie"
					? ["Home", "Pagina 1", "Pagina 2", "Pagina 3", "Pagina 4", "Pagina 5", "Pagina 6", "Pagina 7"]
					: ["Sectie 1", "Sectie 2", "Sectie 3", "Sectie 4", "Sectie 5", "Sectie 6", "Sectie 7", "Sectie 8"];

		if (type === "breadcrumb") {
			const items = labels.slice(0, aantalItems).map((label, i) => {
				if (i === aantalItems - 1) return `<li aria-current="page">${label}</li>`;
				return `<li><a href="#">${label}</a></li>`;
			}).join("\n\t\t\t");
			return `<nav class="breadcrumb"><ol>\n\t\t\t${items}\n\t\t</ol></nav>`;
		}

		const navClass = type === "hoofdnavigatie" ? "main-nav" : "side-nav";
		const items = labels.slice(0, aantalItems).map((label, i) => {
			const current = i + 1 === actievePagina ? ' aria-current="page"' : "";
			return `<li><a href="#"${current}>${label}</a></li>`;
		}).join("\n\t\t\t");
		return `<nav class="${navClass}"><ul>\n\t\t\t${items}\n\t\t</ul></nav>`;
	},
};

export const Hoofdnavigatie = () => `
	<nav class="main-nav">
		<ul>
			<li><a href="#" aria-current="page">Home</a></li>
			<li><a href="#">Pagina 1</a></li>
			<li><a href="#">Pagina 2</a></li>
			<li><a href="#">Pagina 3</a></li>
			<li><a href="#">Pagina 4</a></li>
		</ul>
	</nav>
`;

export const Subnavigatie = () => `
	<nav class="side-nav">
		<ul>
			<li><a href="#" aria-current="page">Sectie 1</a></li>
			<li><a href="#">Sectie 2</a></li>
			<li><a href="#">Sectie 3</a></li>
			<li><a href="#">Sectie 4</a></li>
			<li><a href="#">Sectie 5</a></li>
		</ul>
	</nav>
`;

export const Breadcrumb = () => `
	<nav class="breadcrumb">
		<ol>
			<li><a href="#">Home</a></li>
			<li><a href="#">Componenten</a></li>
			<li aria-current="page">Breadcrumb</li>
		</ol>
	</nav>
`;
