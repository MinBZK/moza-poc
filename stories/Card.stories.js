export default {
	title: "Componenten/Card",
	tags: ["autodocs"],
};

export const Standaard = {
	parameters: {
		docs: {
			description: {
				story: "Een card groepeert gerelateerde content met een visuele scheiding van de achtergrond. Geschikt voor secties met een heading, tekst en optioneel een actieknop.",
			},
		},
	},
	argTypes: {
		titel: { control: "text", name: "Titel" },
		inhoud: { control: "text", name: "Inhoud" },
		toonKnop: { control: "inline-radio", options: ["Aan", "Uit"], name: "Toon actieknop" },
	},
	args: {
		titel: "Bedrijfsactiviteiten",
		inhoud: "Bekijk de SBI-codes en omschrijvingen van de activiteiten die bij uw onderneming geregistreerd staan.",
		toonKnop: "Aan",
	},
	render: ({ titel, inhoud, toonKnop }) => `
<section class="card">
	<h2>${titel}</h2>
	<p>${inhoud}</p>
	${toonKnop === "Aan" ? '<a class="btn-cta" href="#">Ga naar Bedrijfsactiviteiten</a>' : ""}
</section>`,
};

export const MetSecties = {
	parameters: {
		docs: {
			description: {
				story: "Een card met meerdere secties, gescheiden door een horizontale lijn. Elke sectie heeft een eigen heading en content.",
			},
		},
	},
	render: () => `
<section class="card">
	<section>
		<h2>Berichten over uw buurt</h2>
		<p>Berichten die betrekking hebben op de omgeving van uw bedrijfsadres.</p>
		<a class="btn-cta" href="#">Naar Berichten over uw buurt</a>
	</section>
	<section>
		<h2>Subsidies en financiering</h2>
		<p>Subsidies en financiering waar u mogelijk voor in aanmerking komt.</p>
		<a class="btn-cta" href="#">Naar Subsidies en financiering</a>
	</section>
</section>`,
};

export const MetTabel = {
	parameters: {
		docs: {
			description: {
				story: "Een card met een data-overzicht in tabelvorm. Gebruikt de class data-overview voor label-waarde paren.",
			},
		},
	},
	render: () => `
<section class="card">
	<h2>Algemeen</h2>
	<p>Dit zijn de gegevens die bij de overheid bekend zijn over jouw organisatie.</p>
	<table class="data-overview">
		<caption>Bron: <a href="#">KVK</a> en <a href="#">Belastingdienst</a></caption>
		<tr>
			<th scope="row">Handelsnaam</th>
			<td>Bloom B.V.</td>
		</tr>
		<tr>
			<th scope="row">KVK-nummer</th>
			<td>12345678</td>
		</tr>
		<tr>
			<th scope="row">Rechtsvorm</th>
			<td>Besloten vennootschap</td>
		</tr>
	</table>
</section>`,
};

export const MetContentLinks = {
	parameters: {
		docs: {
			description: {
				story: "Een card met een lijst van content-links. Elke link is klikbaar over de volledige breedte via een onzichtbare card-link overlay. Ongelezen items worden visueel gemarkeerd.",
			},
		},
	},
	render: () => `
<section class="card">
	<h2>Berichten over uw buurt</h2>
	<p>Berichten die betrekking hebben op de omgeving van uw bedrijfsadres.</p>
	<ul class="list-content-links">
		<li>
			<a href="#" class="content-link is-unread">
				<h3>Wegafsluiting Stationsweg vanaf 10 maart</h3>
				<span class="card-link"></span>
			</a>
			<p>19 februari 2026. De Stationsweg is afgesloten vanwege werkzaamheden aan het riool.</p>
		</li>
		<li>
			<a href="#" class="content-link">
				<h3>Aanpassing parkeerregels en laad-/loszones</h3>
				<span class="card-link"></span>
			</a>
			<p>19 februari 2026. De gemeente past de parkeerregels aan in uw buurt.</p>
		</li>
	</ul>
	<a class="btn-cta" href="#">Meer Berichten over uw buurt</a>
</section>`,
};
