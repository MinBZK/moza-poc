import { defineConfig } from "vitest/config";

// Apart van npm test: deze tests hebben de draaiende demo-stack van het Federatief
// Berichtenstelsel nodig. Zie README.md in deze map.
export default defineConfig({
	test: {
		environment: "jsdom",
		include: ["tests-integratie/**/*.test.js"],
		testTimeout: 40000,
		hookTimeout: 20000,
		fileParallelism: false,
	},
});
