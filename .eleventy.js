const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

module.exports = function (eleventyConfig) {
	// Laatste wijzigingsdatum van het hele project: meest recente git-commit.
	// Fallback: huidige datum als git niet beschikbaar is.
	eleventyConfig.addGlobalData("laatsteWijziging", () => {
		try {
			const iso = execSync("git log -1 --format=%cI", { encoding: "utf8" }).trim();
			return new Date(iso);
		} catch (e) {
			return new Date();
		}
	});

	// Inline SVG shortcode
	eleventyConfig.addShortcode("icon", function (iconPath) {
		if (!iconPath) return "";
		const filePath = path.join(".", iconPath);
		return fs.readFileSync(filePath, "utf8");
	});

	// React Island shortcode: {% island "component-name", { prop1: "value" } %}
	eleventyConfig.addShortcode("island", function (componentName, props = {}) {
		const propsJson = JSON.stringify(props).replace(/"/g, "&quot;");
		return `<div data-island="${componentName}" data-props="${propsJson}"></div>`;
	});

	// Nederlandse datum-notatie: "19 februari 2026".
	// Parse "YYYY-MM-DD" direct om timezone-drift te vermijden (new Date() interpreteert UTC).
	eleventyConfig.addFilter("datumNL", function (datum) {
		if (!datum) return "";
		const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
		if (datum instanceof Date) {
			return datum.getDate() + " " + MAANDEN[datum.getMonth()] + " " + datum.getFullYear();
		}
		const m = String(datum).match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (!m) return "Onbekende datum";
		const mnd = parseInt(m[2], 10);
		if (mnd < 1 || mnd > 12) return "Onbekende datum";
		return parseInt(m[3], 10) + " " + MAANDEN[mnd - 1] + " " + parseInt(m[1], 10);
	});

	// Datum + tijd: "19 mei 2026 om 14:32"
	eleventyConfig.addFilter("datumtijdNL", function (datum) {
		if (!datum) return "";
		const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
		const d = datum instanceof Date ? datum : new Date(datum);
		if (isNaN(d.getTime())) return "Onbekende datum";
		const hh = String(d.getHours()).padStart(2, "0");
		const mm = String(d.getMinutes()).padStart(2, "0");
		return d.getDate() + " " + MAANDEN[d.getMonth()] + " " + d.getFullYear() + " om " + hh + ":" + mm;
	});

	// Relative "time ago" in Dutch: "3 seconden geleden", "2 maanden geleden", "gisteren"
	eleventyConfig.addFilter("tijdgeledenNL", function (datum) {
		if (!datum) return "";
		const d = datum instanceof Date ? datum : new Date(datum);
		if (isNaN(d.getTime())) return "";
		const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
		if (seconds < 5) return "nu";
		if (seconds < 60) return seconds + " seconden geleden";
		if (seconds < 120) return "1 minuut geleden";
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return minutes + (minutes === 1 ? " minuut geleden" : " minuten geleden");
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return hours + (hours === 1 ? " uur geleden" : " uur geleden");
		const days = Math.floor(hours / 24);
		if (days === 1) return "gisteren";
		if (days < 30) return days + " dagen geleden";
		const months = Math.floor(days / 30);
		if (months < 12) return months + (months === 1 ? " maand geleden" : " maanden geleden");
		const years = Math.floor(months / 12);
		return years + (years === 1 ? " jaar geleden" : " jaar geleden");
	});

	// Statische bestanden kopiëren naar _site
	eleventyConfig.addPassthroughCopy("assets");
	eleventyConfig.addPassthroughCopy("style");
	eleventyConfig.addPassthroughCopy("mailbox/favicon");
	eleventyConfig.addPassthroughCopy("mailbox/styles.css");

	// React islands build output (Vite bouwt naar dist/js, buiten Eleventy's
	// cleanOutput-zone; hier gekopieerd naar _site/js).
	eleventyConfig.addPassthroughCopy({ "dist/js": "js" });

	// mox/ landingspagina: self-contained assets meekopiëren naar _site/mox/
	eleventyConfig.addPassthroughCopy("mox/css");
	eleventyConfig.addPassthroughCopy("mox/js");
	eleventyConfig.addPassthroughCopy("mox/fonts");
	eleventyConfig.addPassthroughCopy("mox/images");
	eleventyConfig.addPassthroughCopy("mox/packages");

	// mijn-belastingdienst/ snapshot: self-contained assets meekopiëren
	eleventyConfig.addPassthroughCopy("mijn-belastingdienst/assets");

	// Pagina-specifieke CSS voor de ux-onderzoeken-pagina's. addWatchTarget zodat
	// de dev-server deze losse-bestand-passthrough óók bij wijziging ververst
	// (directory-passthroughs worden automatisch gewatcht, losse bestanden niet).
	eleventyConfig.addPassthroughCopy("ux-onderzoeken/style.css");
	eleventyConfig.addWatchTarget("ux-onderzoeken/style.css");

	// Dev-server: nooit cachen, zodat de browser geen oude (gecachete)
	// pagina's blijft tonen. Voorkomt dat je handmatig de cache moet legen.
	eleventyConfig.setServerOptions({
		headers: {
			"Cache-Control": "no-store",
		},
	});

	return {
		pathPrefix: "/",
		dir: {
			input: ".",
			includes: "_includes",
			output: "_site",
		},
		templateFormats: ["njk", "html", "md"],
		htmlTemplateEngine: "njk",
		cleanOutput: true,
	};
};
