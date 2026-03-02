/** @type { import('@storybook/html-vite').StorybookConfig } */
const config = {
	stories: ["../stories/**/*.stories.@(js|ts)"],
	addons: ["@storybook/addon-a11y"],
	framework: {
		name: "@storybook/html-vite",
		options: {},
	},
};

export default config;
