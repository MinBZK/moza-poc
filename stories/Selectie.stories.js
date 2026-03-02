export default {
	title: "Componenten/Selectie",
	argTypes: {
		type: {
			control: "select",
			options: ["checkbox", "radio"],
		},
		aantalOpties: {
			control: { type: "range", min: 3, max: 7, step: 1 },
		},
	},
};

export const Speeltuin = {
	args: {
		type: "checkbox",
		aantalOpties: 3,
	},
	render: ({ type, aantalOpties }) => {
		const name = type === "radio" ? ` name="sb-${type}"` : "";
		const items = Array.from({ length: aantalOpties }, (_, i) => {
			const checked = i === 0 ? " checked" : "";
			return `<li>
			<input type="${type}"${name} id="sb-${type}-${i}"${checked} />
			<label for="sb-${type}-${i}">${type === "checkbox" ? "Checkbox" : "Radio button"} optie ${i + 1}</label>
		</li>`;
		}).join("\n\t\t");
		return `<ul class="selection">\n\t\t${items}\n\t</ul>`;
	},
};

export const Checkboxes = () => `
	<ul class="selection">
		<li>
			<input type="checkbox" id="sb-checkbox-1" checked />
			<label for="sb-checkbox-1">Checkbox optie 1</label>
		</li>
		<li>
			<input type="checkbox" id="sb-checkbox-2" />
			<label for="sb-checkbox-2">Checkbox optie 2</label>
			<ul class="selection">
				<li>
					<input type="checkbox" id="sb-checkbox-nested-1" />
					<label for="sb-checkbox-nested-1">Geneste checkbox optie 1</label>
				</li>
				<li>
					<input type="checkbox" id="sb-checkbox-nested-2" />
					<label for="sb-checkbox-nested-2">Geneste checkbox optie 2</label>
				</li>
				<li>
					<input type="checkbox" id="sb-checkbox-nested-3" />
					<label for="sb-checkbox-nested-3">Geneste checkbox optie 3</label>
				</li>
			</ul>
		</li>
		<li>
			<input type="checkbox" id="sb-checkbox-3" disabled />
			<label for="sb-checkbox-3">Checkbox optie 3</label>
		</li>
	</ul>
`;

export const RadioButtons = () => `
	<ul class="selection">
		<li>
			<input type="radio" name="sb-radio" id="sb-radio-1" checked />
			<label for="sb-radio-1">Radio button optie 1</label>
		</li>
		<li>
			<input type="radio" name="sb-radio" id="sb-radio-2" />
			<label for="sb-radio-2">Radio button optie 2</label>
		</li>
		<li>
			<input type="radio" name="sb-radio" id="sb-radio-3" disabled />
			<label for="sb-radio-3">Radio button optie 3</label>
		</li>
	</ul>
`;

export const Keuzelijst = () => `
	<label for="sb-select">Keuzelijst</label>
	<select id="sb-select">
		<optgroup label="Groep met opties">
			<option value="Optie 1">Optie 1</option>
			<option value="Optie 2">Optie 2</option>
			<option value="Optie 3" disabled>Optie 3 (inactief)</option>
		</optgroup>
		<option value="Optie 4">Optie 4</option>
		<option value="Optie 5">Optie 5</option>
		<option value="Optie 6">Optie 6</option>
	</select>
`;

export const KeuzelijstMeervoudig = () => `
	<label for="sb-select-multiple">Keuzelijst met meervoudige selectie</label>
	<select id="sb-select-multiple" multiple>
		<optgroup label="Groep met opties">
			<option value="Optie 1">Optie 1</option>
			<option value="Optie 2">Optie 2</option>
			<option value="Optie 3" disabled>Optie 3 (inactief)</option>
		</optgroup>
		<option value="Optie 4">Optie 4</option>
		<option value="Optie 5">Optie 5</option>
		<option value="Optie 6">Optie 6</option>
	</select>
`;
