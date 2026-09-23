import remarkGfm from "remark-gfm";

/** @type { import('@storybook/html-vite').StorybookConfig } */
const config = {
	stories: ["../stories/**/*.stories.@(js|ts)", "../stories/**/*.mdx"],
	addons: [
		"@storybook/addon-a11y",
		// MDX 3 kent geen GitHub-Markdown: zonder remark-gfm verschijnt een takenlijst (- [ ]) als
		// letterlijke tekst. Nodig voor de Definition of Done in stories/UXOpleveringen.mdx.
		{
			name: "@storybook/addon-docs",
			options: {
				mdxPluginOptions: {
					mdxCompileOptions: {
						remarkPlugins: [remarkGfm],
					},
				},
			},
		},
	],
	framework: {
		name: "@storybook/html-vite",
		options: {},
	},
};

export default config;
