const fs = require('fs');
const path = require('path');

module.exports = function (eleventyConfig) {

    // Inline SVG shortcode
    eleventyConfig.addShortcode('icon', function(iconPath) {
        if (!iconPath) return '';
        const filePath = path.join('.', iconPath);
        return fs.readFileSync(filePath, 'utf8');
    });

    // Statische bestanden kopiëren naar _site
    eleventyConfig.addPassthroughCopy("assets");
    eleventyConfig.addPassthroughCopy("style");
    eleventyConfig.addPassthroughCopy("gebruikersonderzoek");

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