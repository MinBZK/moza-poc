const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

module.exports = function (eleventyConfig) {

    // Laatste wijzigingsdatum van het hele project: meest recente git-commit.
    // Fallback: huidige datum als git niet beschikbaar is.
    eleventyConfig.addGlobalData('laatsteWijziging', () => {
        try {
            const iso = execSync('git log -1 --format=%cI', { encoding: 'utf8' }).trim();
            return new Date(iso);
        } catch (e) {
            return new Date();
        }
    });

    // Inline SVG shortcode
    eleventyConfig.addShortcode('icon', function(iconPath) {
        if (!iconPath) return '';
        const filePath = path.join('.', iconPath);
        return fs.readFileSync(filePath, 'utf8');
    });

    // Nederlandse datum-notatie: "19 februari 2026".
    // Parse "YYYY-MM-DD" direct om timezone-drift te vermijden (new Date() interpreteert UTC).
    eleventyConfig.addFilter('datumNL', function(datum) {
        if (!datum) return '';
        const MAANDEN = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
        if (datum instanceof Date) {
            return datum.getDate() + ' ' + MAANDEN[datum.getMonth()] + ' ' + datum.getFullYear();
        }
        const m = String(datum).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return 'Onbekende datum';
        const mnd = parseInt(m[2], 10);
        if (mnd < 1 || mnd > 12) return 'Onbekende datum';
        return parseInt(m[3], 10) + ' ' + MAANDEN[mnd - 1] + ' ' + parseInt(m[1], 10);
    });

    // Datum + tijd: "19 mei 2026 om 14:32"
    eleventyConfig.addFilter('datumtijdNL', function(datum) {
        if (!datum) return '';
        const MAANDEN = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
        const d = datum instanceof Date ? datum : new Date(datum);
        if (isNaN(d.getTime())) return 'Onbekende datum';
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return d.getDate() + ' ' + MAANDEN[d.getMonth()] + ' ' + d.getFullYear() + ' om ' + hh + ':' + mm;
    });

    // Statische bestanden kopiëren naar _site
    eleventyConfig.addPassthroughCopy("assets");
    eleventyConfig.addPassthroughCopy("style");
    eleventyConfig.addPassthroughCopy("moza/ondernemersplein/*.png");
    eleventyConfig.addPassthroughCopy("mailbox/favicon");
    eleventyConfig.addPassthroughCopy("mailbox/styles.css");

    return {
        pathPrefix: "/",
        dir: {
            input: ".",
            includes: "_includes",
            output: "_site"
        },
        templateFormats: ["njk", "html", "md"],
        htmlTemplateEngine: "njk",
        cleanOutput: true
    };
};
