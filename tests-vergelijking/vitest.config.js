import { defineConfig } from "vitest/config";

// Apart van vitest.config.js in de wortel: deze vergelijking hoort niet bij `npm test`.
// Zij heeft een tweede, gebouwde werkmap van main nodig en duurt daardoor een minuut.
export default defineConfig({
	test: {
		environment: "jsdom",
		include: ["tests-vergelijking/**/*.test.js"],
		testTimeout: 30000,
	},
});
