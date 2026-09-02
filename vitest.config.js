import { defineConfig } from "vitest/config";

// De tests staan in tests/ en niet naast de bron, omdat .eleventy.js de hele assets-map
// ongefilterd naar _site kopieert: een testbestand daar zou meegedeployed worden.
export default defineConfig({
	test: {
		include: ["tests/**/*.test.js"],
		exclude: ["node_modules/**", "_site/**", ".claude/**"],
	},
});
