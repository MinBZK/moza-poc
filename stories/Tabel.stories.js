export default {
	title: "Componenten/Tabel",
	argTypes: {
		kolommen: {
			control: { type: "range", min: 2, max: 6, step: 1 },
		},
		rijen: {
			control: { type: "range", min: 1, max: 10, step: 1 },
		},
		bijschrift: { control: "text" },
	},
};

export const Speeltuin = {
	args: {
		kolommen: 5,
		rijen: 5,
		bijschrift: "Voorbeeld tabel met bijschrift",
	},
	render: ({ kolommen, rijen, bijschrift }) => {
		const headers = Array.from({ length: kolommen }, (_, i) =>
			`<th>Kolom ${i + 1}</th>`
		).join("");

		const body = Array.from({ length: rijen }, (_, r) => {
			const cells = Array.from({ length: kolommen }, (_, c) =>
				`<td>Rij ${r + 1}, cel ${c + 1}</td>`
			).join("");
			return `<tr>${cells}</tr>`;
		}).join("\n\t\t\t");

		const captionHtml = bijschrift ? `\n\t\t<caption>${bijschrift}</caption>` : "";

		return `
			<table>
				<thead><tr>${headers}</tr></thead>
				<tbody>${body}</tbody>${captionHtml}
			</table>
		`;
	},
};

export const Standaard = () => `
	<table>
		<thead>
			<tr>
				<th>Kolom 1</th>
				<th>Kolom 2</th>
				<th>Kolom 3</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td>Rij 1, cel 1</td>
				<td>Rij 1, cel 2</td>
				<td>Rij 1, cel 3</td>
			</tr>
			<tr>
				<td>Rij 2, cel 1</td>
				<td>Rij 2, cel 2</td>
				<td>Rij 2, cel 3</td>
			</tr>
			<tr>
				<td>Rij 3, cel 1</td>
				<td>Rij 3, cel 2</td>
				<td>Rij 3, cel 3</td>
			</tr>
		</tbody>
		<caption>Voorbeeld tabel met bijschrift</caption>
	</table>
`;
