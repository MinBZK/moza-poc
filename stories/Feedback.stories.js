const feedbackIconInfo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
		<path d="M22.04 3.78c-.16-.95-.88-1.67-1.83-1.83-2.73-.45-7.3-.45-8.21-.45-.91 0-5.48 0-8.22.46-.94.15-1.67.88-1.82 1.82C1.5 6.52 1.5 11.09 1.5 12s0 5.48.46 8.22c.16.95.88 1.67 1.83 1.83 2.74.46 7.3.46 8.22.46.91 0 5.48 0 8.22-.46.95-.16 1.67-.88 1.83-1.83.46-2.74.46-7.3.46-8.22-.02-2.74-.02-5.48-.48-8.22z"/>
		<path class="icon-color-inverse" d="M10.71 6.93c0-.34.11-.63.33-.88.22-.25.54-.38.95-.38.41 0 .72.12.94.36.22.24.33.54.33.9 0 .32-.11.61-.33.86s-.54.37-.94.37c-.41 0-.72-.12-.95-.35-.22-.24-.33-.53-.33-.88zm2.4 2.39v8.96H10.9V9.41l2.21-.09z"/>
	</svg>`;

const feedbackIconSucces = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
		<path d="M22.04 3.78c-.16-.95-.88-1.67-1.83-1.83-2.73-.45-7.3-.45-8.21-.45-.91 0-5.48 0-8.22.46-.95.15-1.67.87-1.82 1.82C1.5 6.52 1.5 11.09 1.5 12s0 5.48.46 8.22c.16.95.88 1.67 1.83 1.83 2.74.46 7.3.46 8.22.46.91 0 5.48 0 8.22-.46.95-.16 1.67-.88 1.83-1.83.46-2.74.46-7.3.46-8.22-.02-2.74-.02-5.48-.48-8.22z"/>
		<path class="icon-color-inverse" d="M16.5 7.35a.755.755 0 0 0-1.01.1l-4.4 4.95-2.65-2.3a.743.743 0 0 0-.97 0c-.28.24-.35.65-.16.97l3.2 5.38c.14.23.38.37.64.37s.51-.14.64-.36l4.89-8.09c.21-.35.13-.78-.18-1.02z"/>
	</svg>`;

const feedbackIconWaarschuwing = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
		<path d="M23.38 19.64 13.67 2.47c-.73-1.3-2.6-1.3-3.34 0L.62 19.64c-.72 1.28.2 2.86 1.67 2.86h19.43c1.46 0 2.38-1.58 1.66-2.86z"/>
		<path fill="none" class="icon-color-inverse" d="M10.54 17.45c0-.44.12-.82.36-1.12.24-.31.6-.46 1.09-.46.48 0 .85.14 1.1.4.25.27.38.66.38 1.18 0 .43-.12.8-.36 1.09-.24.29-.6.44-1.09.44-.48 0-.85-.13-1.1-.39-.25-.25-.38-.63-.38-1.14zm.31-10.27 2.48-.2-.22 5.51v2.63l-2.27.05V7.18z"/>
	</svg>`;

const feedbackIconFout = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
		<circle cx="12" cy="12" r="10.5" fill="currentColor"/>
		<path class="icon-color-inverse" d="M15.12 7.71 12 10.48 8.88 7.71a.858.858 0 0 0-1.15.02c-.3.32-.31.81-.02 1.14L10.48 12l-2.77 3.12c-.29.33-.29.83.02 1.14.32.3.81.31 1.14.02L12 13.52l3.12 2.77c.33.29.83.28 1.14-.02.3-.32.31-.81.02-1.14L13.52 12l2.77-3.12c.29-.33.29-.83-.02-1.14a.848.848 0 0 0-1.15-.03M12 12.01l-.01-.01.01-.01.01-.01.01.01.01.01-.03.01z"/>
	</svg>`;

export default {
	title: "Componenten/Feedback",
	tags: ["autodocs"],
	parameters: {
		docs: {
			description: {
				component: `Feedbackmeldingen informeren de gebruiker over de uitkomst van een actie of over een situatie die aandacht vraagt. Elke variant heeft een eigen kleur en icoon die de urgentie communiceert.

**Heading-niveau en visuele stijl**

De titel van een feedbackmelding is een heading (\`<h2>\`–\`<h6>\`). Het juiste heading-niveau wordt bepaald door de positie in de pagina-structuur, niet door de gewenste visuele grootte. Een feedbackmelding binnen een \`<section>\` met een \`<h2>\` gebruikt \`<h3>\` als titel.`,
			},
		},
	},
	argTypes: {
		toonTitel: { control: "inline-radio", options: ["Aan", "Uit"], name: "Titel" },
		titel: { control: "text", name: "Titel", if: { arg: "toonTitel", eq: "Aan" } },
		headingNiveau: {
			control: "select",
			options: ["h2", "h3", "h4", "h5", "h6"],
			name: "Heading-niveau",
			if: { arg: "toonTitel", eq: "Aan" },
		},
		inhoud: { control: "text", name: "Inhoud" },
	},
	args: {
		toonTitel: "Aan",
		headingNiveau: "h3",
		inhoud: "Lorem ipsum dolor sit amet consectetur adipisicing elit.",
	},
};

function renderContent({ toonTitel, titel, headingNiveau, inhoud }) {
	if (toonTitel === "Aan" && titel) {
		return `<div><${headingNiveau}>${titel}</${headingNiveau}><p>${inhoud}</p></div>`;
	}
	return `<div><p>${inhoud}</p></div>`;
}

export const Neutraal = {
	parameters: {
		docs: {
			description: {
				story: "Neutrale feedback zonder icoon. Geschikt voor algemene meldingen zonder specifieke urgentie.",
			},
		},
	},
	args: {
		titel: "Neutrale feedback",
	},
	render: (args) => `
<div class="feedback">
	${renderContent(args)}
	<button class="btn-close link-button">
		<i>Sluit notificatie</i>
	</button>
</div>
`,
};

export const Informatie = {
	parameters: {
		docs: {
			description: {
				story: "Informatieve feedback. Gebruik dit voor het tonen van aanvullende of verduidelijkende informatie.",
			},
		},
	},
	args: {
		titel: "Informatie",
	},
	render: (args) => `
<div class="feedback feedback-info">
	${feedbackIconInfo}
	${renderContent(args)}
	<button class="btn-close link-button">
		<i>Sluit notificatie</i>
	</button>
</div>
`,
};

export const Succes = {
	parameters: {
		docs: {
			description: {
				story: "Succesfeedback. Gebruik dit om te bevestigen dat een gebruikersactie of een actie vanuit het systeem geslaagd is.",
			},
		},
	},
	args: {
		titel: "Succes",
	},
	render: (args) => `
<div class="feedback feedback-success">
	${feedbackIconSucces}
	${renderContent(args)}
	<button class="btn-close link-button">
		<i>Sluit notificatie</i>
	</button>
</div>
`,
};

export const Waarschuwing = {
	parameters: {
		docs: {
			description: {
				story: "Waarschuwingsfeedback. Gebruik dit om de gebruiker te attenderen op een mogelijke aandachtspunt.",
			},
		},
	},
	args: {
		titel: "Waarschuwing",
	},
	render: (args) => `
<div class="feedback feedback-warning">
	${feedbackIconWaarschuwing}
	${renderContent(args)}
	<button class="btn-close link-button">
		<i>Sluit notificatie</i>
	</button>
</div>
`,
};

export const Foutmelding = {
	parameters: {
		docs: {
			description: {
				story: "Foutmelding. Gebruik dit bij validatiefouten of mislukte acties. Heeft geen sluit-knop omdat de fout door de gebruiker opgelost moet worden om verder te kunnen.",
			},
		},
	},
	args: {
		titel: "Foutmelding",
	},
	render: (args) => `
<div class="feedback feedback-error">
	${feedbackIconFout}
	${renderContent(args)}
</div>
`,
};

export const AlleVarianten = {
	parameters: {
		docs: {
			description: {
				story: "Overzicht van alle feedbackvarianten naast elkaar ter vergelijking.",
			},
		},
	},
	render: () => `
<div style="display: flex; flex-direction: column; gap: 1rem;">
	<div class="feedback">
		<div>
			<p>Neutrale feedback</p>
			<p>Bericht tekst.</p>
		</div>
		<button class="btn-close link-button">
			<i>Sluit notificatie</i>
		</button>
	</div>
	<div class="feedback feedback-info">
		${feedbackIconInfo}
		<div>
			<p>Informatie</p>
			<p>Bericht tekst.</p>
		</div>
		<button class="btn-close link-button">
			<i>Sluit notificatie</i>
		</button>
	</div>
	<div class="feedback feedback-success">
		${feedbackIconSucces}
		<div>
			<p>Succes</p>
			<p>Bericht tekst.</p>
		</div>
		<button class="btn-close link-button">
			<i>Sluit notificatie</i>
		</button>
	</div>
	<div class="feedback feedback-warning">
		${feedbackIconWaarschuwing}
		<div>
			<p>Waarschuwing</p>
			<p>Bericht tekst.</p>
		</div>
		<button class="btn-close link-button">
			<i>Sluit notificatie</i>
		</button>
	</div>
	<div class="feedback feedback-error">
		${feedbackIconFout}
		<div>
			<p>Foutmelding</p>
			<p>Bericht tekst.</p>
		</div>
	</div>
</div>
`,
};

// Losse feedbackvarianten voor gebruik in andere stories (niet als component gerenderd)

export const VerificatiemailFormatIssue = {
	tags: ["!autodocs", "!dev"],
	args: {
		toonTitel: "Uit",
		inhoud: 'Vul een geldig e-mailadres in, bijvoorbeeld email@voorbeeld.nl.',
	},
	render: (args) => `
<div class="feedback feedback-error">
	${feedbackIconFout}
	${renderContent(args)}
</div>
`,
};

export const VerificatiemailVerstuurd = {
	tags: ["!autodocs", "!dev"],
	args: {
		toonTitel: "Uit",
		inhoud: 'Vul de verificatiecode in die is verzonden naar <strong>email@voorbeeld.nl</strong> om uw e-mailadres te verifiëren. Geen e-mail ontvangen? Controleer uw spam-folder of <a href="#">gebruik deze link om een nieuwe code aan te vragen</a>.',
	},
	render: (args) => `
<div class="feedback feedback-info">
	${feedbackIconInfo}
	${renderContent(args)}
</div>
`,
};

export const VerificatiemailGewijzigd = {
	tags: ["!autodocs", "!dev"],
	args: {
		toonTitel: "Uit",
		inhoud: 'Uw e-mailadres is gewijzigd naar <strong>nieuw@voorbeeld.nl</strong>. Alle toekomstige berichten worden naar dit adres gestuurd.',
	},
	render: (args) => `
<div class="feedback feedback-success">
	${feedbackIconSucces}
	${renderContent(args)}
</div>
`,
};

export const VerificatiemailVerlopen = {
	tags: ["!autodocs", "!dev"],
	args: {
		toonTitel: "Uit",
		inhoud: 'Deze verificatiecode is verlopen. <a href="#">Gebruik deze link om een nieuwe verificatiemail te ontvangen</a>.',
	},
	render: (args) => `
<div class="feedback feedback-warning">
	${feedbackIconWaarschuwing}
	${renderContent(args)}
</div>
`,
};

export const VerificatiemailAlGeverifieerd = {
	tags: ["!autodocs", "!dev"],
	args: {
		toonTitel: "Uit",
		inhoud: 'Dit e-mailadres is al geverifieerd. U hoeft verder niets te doen.',
	},
	render: (args) => `
<div class="feedback feedback-info">
	${feedbackIconInfo}
	${renderContent(args)}
</div>
`,
};

export const VerificatiemailBounce = {
	tags: ["!autodocs", "!dev"],
	args: {
		toonTitel: "Uit",
		inhoud: 'De verificatiemail naar nieuw@voorbeeld.nl kon niet worden bezorgd. Controleer het e-mailadres en probeer het opnieuw.',
	},
	render: (args) => `
<div class="feedback feedback-error">
	${feedbackIconFout}
	${renderContent(args)}
</div>
`,
};
