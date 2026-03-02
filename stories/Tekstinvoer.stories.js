export default {
	title: "Componenten/Tekstinvoer",
	argTypes: {
		label: { control: "text" },
		helptekst: { control: "text" },
		placeholder: { control: "text" },
		type: {
			control: "select",
			options: ["text", "email", "password", "tel", "url", "number", "search"],
		},
		ongeldig: { control: "boolean" },
		inactief: { control: "boolean" },
		isTextarea: { control: "boolean" },
	},
};

export const Speeltuin = {
	args: {
		label: "Labeltekst",
		helptekst: "Optionele ondersteunende help tekst.",
		placeholder: "",
		type: "text",
		ongeldig: false,
		inactief: false,
		isTextarea: false,
	},
	render: ({ label, helptekst, placeholder, type, ongeldig, inactief, isTextarea }) => {
		const invalidAttr = ongeldig ? " aria-invalid" : "";
		const disabledAttr = inactief ? " aria-disabled readonly" : "";
		const placeholderAttr = placeholder ? ` placeholder="${placeholder}"` : "";
		const helptekstHtml = helptekst
			? `<p class="form-field-helper-text" id="sb-input--helper-text">${helptekst}</p>`
			: "";

		if (isTextarea) {
			return `
				<label for="sb-textarea">${label}</label>
				${helptekstHtml}
				<textarea id="sb-textarea"${invalidAttr}${disabledAttr}${placeholderAttr}></textarea>
			`;
		}

		return `
			<label for="sb-input">${label}</label>
			${helptekstHtml}
			<input
				type="${type}"
				id="sb-input"
				aria-describedby="sb-input--helper-text"
				${placeholderAttr}${invalidAttr}${disabledAttr}
			/>
		`;
	},
};

export const Standaard = () => `
	<label for="input-text">Standaard tekstinvoerveld</label>
	<p class="form-field-helper-text" id="input-text--helper-text">
		Optionele ondersteunende help tekst indien nodig, bijvoorbeeld een hint
		over het verwachte formaat van invoer.
	</p>
	<input
		type="text"
		id="input-text"
		aria-describedby="input-text--helper-text"
	/>
`;

export const Email = () => `
	<label for="input-email">E-mailadres</label>
	<p class="form-field-helper-text" id="emailadress--helper-text">
		Optionele ondersteunende help tekst indien nodig, bijvoorbeeld een hint
		over het verwachte formaat van invoer.
	</p>
	<input
		type="email"
		id="input-email"
		aria-describedby="emailadress--helper-text"
		placeholder="voorbeeld@rijksoverheid.nl"
	/>
`;

export const FoutieveInvoer = () => `
	<label for="input-invalid">Foutieve invoer</label>
	<p class="form-field-helper-text" id="input-invalid--helper-text">
		Optionele ondersteunende help tekst indien nodig, bijvoorbeeld een hint
		over het verwachte formaat van invoer.
	</p>
	<input
		type="text"
		id="input-invalid"
		aria-describedby="input-invalid--helper-text"
		placeholder="voorbeeld@rijksoverheid.nl"
		aria-invalid
	/>
`;

export const Inactief = () => `
	<label for="input-disabled">Inactieve invoer</label>
	<p class="form-field-helper-text" id="input-disabled--helper-text">
		Optionele ondersteunende help tekst indien nodig, bijvoorbeeld een hint
		over het verwachte formaat van invoer.
	</p>
	<input
		type="text"
		id="input-disabled"
		aria-describedby="input-disabled--helper-text"
		aria-disabled
		readonly
	/>
`;

export const Zoekveld = () => `
	<div>
		<label class="input-search" for="input-search">Zoekveld</label>
		<input type="search" id="input-search" /><button type="submit">Zoeken</button>
	</div>
`;

export const Textarea = () => `
	<label for="textarea">Textarea</label>
	<textarea name="" id="textarea"></textarea>
`;

export const TextareaInactief = () => `
	<label for="textarea-disabled">Inactieve textarea</label>
	<textarea name="" id="textarea-disabled" aria-disabled readonly></textarea>
`;
