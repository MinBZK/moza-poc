import ReactDOM from 'react-dom/client';
import { ExampleButton } from './components/ExampleButton';
import { Contactgegevens } from './components/contactgegevens/Contactgegevens';

// Map of all island components
const ISLANDS = {
	'example-button': ExampleButton,
	contactgegevens: Contactgegevens,
};

// Auto-hydrate all islands on page load
function hydrateIslands() {
	document.querySelectorAll('[data-island]').forEach((el) => {
		const componentName = el.getAttribute('data-island');
		const Component = ISLANDS[componentName];
		if (!Component) {
			console.warn(`Unknown island: ${componentName}`);
			return;
		}
		const props = JSON.parse(el.getAttribute('data-props') || '{}');
		const root = ReactDOM.createRoot(el);
		root.render(<Component {...props} />);
	});
}

// Hydrate when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', hydrateIslands);
} else {
	hydrateIslands();
}
