export default {
	title: "Design tokens/Ruimtelijk systeem",
	tags: ["autodocs"],
	parameters: {
		docs: {
			source: false,
		},
	},
};

function spaceSwatch(varName, label, description) {
	const desc = description ? `<span style="color: #696969;"> — ${description}</span>` : "";
	return `<div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.375rem 0;">
		<div style="block-size: 1.5rem; background: var(--toepassing-color-interactive-default-background); opacity: 0.7; flex-shrink: 0; border-radius: 2px; inline-size: var(${varName});"></div>
		<div style="font-size: 0.875rem; white-space: nowrap;">
			${label}
			<code style="font-size: 0.75rem; color: #696969; margin-inline-start: 0.5rem;" class="space-value" data-var="${varName}"></code>
			${desc}
		</div>
	</div>`;
}

function resolveValues(container) {
	requestAnimationFrame(() => {
		const codes = container.querySelectorAll(".space-value");
		const style = getComputedStyle(document.documentElement);
		codes.forEach((code) => {
			code.textContent = style.getPropertyValue(code.dataset.var).trim();
		});
	});
}

export const Layout = {
	parameters: {
		docs: {
			description: {
				story: "Layout-tokens voor spacing tussen elementen. Worden toegepast via <code>gap</code> op een flex- of grid-container, zodat het eerste kind geen onnodige marge krijgt en verborgen items geen lege gaten achterlaten.",
			},
		},
	},
	render: () => {
		const container = document.createElement("div");
		container.innerHTML = `
			<h3 style="margin-block-end: 0.75rem;">Layout spacing</h3>
			${spaceSwatch("--toepassing-space-layout-3xs", "3xs")}
			${spaceSwatch("--toepassing-space-layout-2xs", "2xs")}
			${spaceSwatch("--toepassing-space-layout-xs", "xs")}
			${spaceSwatch("--toepassing-space-layout-sm", "sm")}
			${spaceSwatch("--toepassing-space-layout-md", "md")}
			${spaceSwatch("--toepassing-space-layout-lg", "lg")}
		`;
		resolveValues(container);
		return container;
	},
};

export const Padding = {
	parameters: {
		docs: {
			description: {
				story: "Padding-tokens voor interne ruimte binnen elementen, zoals knoppen, cards en invoervelden.",
			},
		},
	},
	render: () => {
		const container = document.createElement("div");
		container.innerHTML = `
			<h3 style="margin-block-end: 0.75rem;">Padding</h3>
			${spaceSwatch("--toepassing-space-padding-2xs", "2xs")}
			${spaceSwatch("--toepassing-space-padding-xs", "xs")}
			${spaceSwatch("--toepassing-space-padding-sm", "sm")}
			${spaceSwatch("--toepassing-space-padding-md", "md")}
			${spaceSwatch("--toepassing-space-padding-lg", "lg")}
			${spaceSwatch("--toepassing-space-padding-xl", "xl")}
			${spaceSwatch("--toepassing-space-padding-2xl", "2xl")}

			<h3 style="margin-block-start: 1.5rem; margin-block-end: 0.75rem;">Voorbeeld</h3>
			<div style="display: flex; flex-wrap: wrap; gap: 1rem;">
				<div style="background: var(--toepassing-color-background-subtle); border: 1px dashed var(--toepassing-color-border-subtle); padding: var(--toepassing-space-padding-xs);">
					<div style="background: var(--toepassing-color-background-default); padding: 0.5rem;">padding-xs</div>
				</div>
				<div style="background: var(--toepassing-color-background-subtle); border: 1px dashed var(--toepassing-color-border-subtle); padding: var(--toepassing-space-padding-sm);">
					<div style="background: var(--toepassing-color-background-default); padding: 0.5rem;">padding-sm</div>
				</div>
				<div style="background: var(--toepassing-color-background-subtle); border: 1px dashed var(--toepassing-color-border-subtle); padding: var(--toepassing-space-padding-md);">
					<div style="background: var(--toepassing-color-background-default); padding: 0.5rem;">padding-md</div>
				</div>
				<div style="background: var(--toepassing-color-background-subtle); border: 1px dashed var(--toepassing-color-border-subtle); padding: var(--toepassing-space-padding-lg);">
					<div style="background: var(--toepassing-color-background-default); padding: 0.5rem;">padding-lg</div>
				</div>
				<div style="background: var(--toepassing-color-background-subtle); border: 1px dashed var(--toepassing-color-border-subtle); padding: var(--toepassing-space-padding-xl);">
					<div style="background: var(--toepassing-color-background-default); padding: 0.5rem;">padding-xl</div>
				</div>
			</div>
		`;
		resolveValues(container);
		return container;
	},
};
