import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
	integrations: [react()],
	outDir: './_site',
	build: {
		assets: 'assets'
	},
	vite: {
		build: {
			rollupOptions: {
				external: []
			}
		}
	},
	// Copy these directories to output
	publicDir: './public'
});
