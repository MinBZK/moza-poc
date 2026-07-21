import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
	plugins: [react()],
	build: {
		outDir: "react-islands/dist",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				islands: "react-islands/src/index.jsx",
			},
			output: {
				entryFileNames: "[name].js",
				chunkFileNames: "[name].[hash].js",
				assetFileNames: "[name].[hash][extname]",
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "react-islands/src"),
		},
	},
});
