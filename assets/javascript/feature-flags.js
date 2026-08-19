/**
 * feature-flags.js
 *
 * Toont/verbergt secties op basis van feature flags in localStorage.
 * Elementen met data-feature="naam" worden verborgen als de flag uit staat.
 * Een toggle-paneel (geopend via de knop rechtsonder) laat alle flags zien,
 * gegroepeerd op data-feature-type ("pagina" of "functionaliteit").
 *
 * Standaard staan alle features aan. Pas als een feature expliciet op "false"
 * wordt gezet in localStorage (key: "feature:naam") wordt het element verborgen.
 */

const FEATURE_PREFIX = "feature:";
const SETTING_PREFIX = "setting:";

// Persistente feature flags: bewaard in een cookie i.p.v. localStorage, zodat de
// keuze het wissen van localStorage (bv. de "localStorage wissen"-knop) overleeft.
// Map: feature-naam -> cookienaam.
const PERSISTENT_FEATURES = {
	"Berichtenbox unhappy flow": "unhappy-flow",
};

function getCookie(naam) {
	const rij = document.cookie.split("; ").find((r) => r.startsWith(naam + "="));
	return rij ? decodeURIComponent(rij.split("=").slice(1).join("=")) : null;
}

function setCookie(naam, waarde) {
	// 1 jaar houdbaar; path=/ zodat de flag op alle pagina's geldt.
	document.cookie = naam + "=" + encodeURIComponent(waarde) + "; path=/; max-age=" + 60 * 60 * 24 * 365 + "; samesite=lax";
}

function getSettingValue(name, defaultValue) {
	return localStorage.getItem(SETTING_PREFIX + name) || defaultValue;
}

function setSettingValue(name, value) {
	localStorage.setItem(SETTING_PREFIX + name, value);
	window.dispatchEvent(new CustomEvent("setting-changed", { detail: { key: name } }));
}

// Berichtenbox A/B/C-test: één actieve variant. a = huidige, b = PDF-preview,
// c = directe acties. Bron: ?variant= seedt alleen de eerste keer; een keuze in
// het flags-paneel wint daarna (en verwijdert de URL-param) > setting > 'a'.
const BX_VARIANTEN = ["a", "b", "c"];
function pasBerichtenboxVariantToe(gebruikUrlParam) {
	const param = (new URLSearchParams(location.search).get("variant") || "").toLowerCase();
	let variant;
	if (gebruikUrlParam && BX_VARIANTEN.includes(param)) {
		variant = param;
		localStorage.setItem(SETTING_PREFIX + "berichtenbox-variant", variant);
	} else {
		variant = getSettingValue("berichtenbox-variant", "a");
		if (!BX_VARIANTEN.includes(variant)) variant = "a";
	}
	document.documentElement.dataset.berichtenboxVariant = variant;
}
pasBerichtenboxVariantToe(true);
window.addEventListener("setting-changed", (e) => {
	if (e.detail && e.detail.key === "berichtenbox-variant") {
		// Paneelkeuze wint: verwijder een eventuele ?variant= uit de URL zodat die
		// bij een reload de keuze niet opnieuw overschrijft.
		const url = new URL(location.href);
		if (url.searchParams.has("variant")) {
			url.searchParams.delete("variant");
			history.replaceState(null, "", url);
		}
		pasBerichtenboxVariantToe(false);
	}
});

function getFeaturesByType() {
	const groups = {};
	document.querySelectorAll("[data-feature]").forEach((el) => {
		const type = el.dataset.featureType || "overig";
		if (!groups[type]) groups[type] = new Set();
		groups[type].add(el.dataset.feature);
	});
	// Sorteer features binnen elke groep
	for (const type in groups) {
		groups[type] = [...groups[type]].sort();
	}
	return groups;
}

// Verzamel features die standaard uit staan (data-feature-default="off")
const defaultOffFeatures = new Set();
document.querySelectorAll('[data-feature-default="off"]').forEach((el) => {
	defaultOffFeatures.add(el.dataset.feature);
});

function isFeatureEnabled(name) {
	if (PERSISTENT_FEATURES[name]) {
		return getCookie(PERSISTENT_FEATURES[name]) === "true";
	}
	const stored = localStorage.getItem(FEATURE_PREFIX + name);
	if (defaultOffFeatures.has(name)) {
		return stored === "true";
	}
	return stored !== "false";
}

function applyFeatureFlags() {
	document.querySelectorAll("[data-feature]").forEach((el) => {
		const enabled = isFeatureEnabled(el.dataset.feature);
		if (el.dataset.featureAction === "link") {
			// Toggle href + class. Bij off: href weg, class erop. Bij on: href terug, class weg.
			if (enabled) {
				if (el.dataset.featureHref) el.setAttribute("href", el.dataset.featureHref);
				el.classList.remove("feature-link-disabled");
			} else {
				if (el.hasAttribute("href")) {
					el.dataset.featureHref = el.getAttribute("href");
					el.removeAttribute("href");
				}
				el.classList.add("feature-link-disabled");
			}
		} else {
			el.hidden = !enabled;
		}
	});
	// Wijs inloglinks naar de inlogpagina als de Inlogflow-flag aan staat
	const inlogflowAan = isFeatureEnabled("Inlogflow");
	document.querySelectorAll("[data-inlogflow-link]").forEach((el) => {
		if (inlogflowAan) {
			el.href = (typeof window.PATH_PREFIX === "string" && window.PATH_PREFIX !== "/" ? window.PATH_PREFIX.replace(/\/$/, "") : "") + "/inloggen/";
		}
	});
	// Laat andere scripts (bv. berichtenbox.js) reageren op een flag-wijziging
	// zonder herladen. hidden-attributen staan op dit punt al goed.
	document.dispatchEvent(new CustomEvent("feature-flags-applied"));
}

const TYPE_LABELS = {
	pagina: "Pagina's",
	functionaliteit: "Functionaliteit",
	overig: "Overig",
};

// Volgorde van groepen in het paneel
const TYPE_ORDER = ["pagina", "functionaliteit", "overig"];

function buildTogglePanel() {
	const groups = getFeaturesByType();
	const allTypes = TYPE_ORDER.filter((t) => groups[t]);
	if (allTypes.length === 0) return;

	const panel = document.createElement("div");
	panel.className = "feature-flags-panel";
	panel.hidden = true;

	const heading = document.createElement("p");
	heading.className = "feature-flags-heading";
	heading.textContent = "Feature flags";
	panel.appendChild(heading);

	allTypes.forEach((type) => {
		const groupHeading = document.createElement("p");
		groupHeading.className = "feature-flags-group-heading";
		groupHeading.textContent = TYPE_LABELS[type] || type;
		panel.appendChild(groupHeading);

		const list = document.createElement("ul");
		groups[type].forEach((name) => {
			const li = document.createElement("li");
			const label = document.createElement("label");
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = isFeatureEnabled(name);
			checkbox.addEventListener("change", () => {
				if (PERSISTENT_FEATURES[name]) {
					setCookie(PERSISTENT_FEATURES[name], checkbox.checked ? "true" : "false");
				} else if (checkbox.checked) {
					if (defaultOffFeatures.has(name)) {
						localStorage.setItem(FEATURE_PREFIX + name, "true");
					} else {
						localStorage.removeItem(FEATURE_PREFIX + name);
					}
				} else {
					if (defaultOffFeatures.has(name)) {
						localStorage.removeItem(FEATURE_PREFIX + name);
					} else {
						localStorage.setItem(FEATURE_PREFIX + name, "false");
					}
				}
				applyFeatureFlags();
			});
			label.appendChild(checkbox);
			label.appendChild(document.createTextNode(" " + name));
			li.appendChild(label);
			list.appendChild(li);
		});
		panel.appendChild(list);
	});

	// --- Berichtenbox A/B/C-test ---
	const variantHeading = document.createElement("p");
	variantHeading.className = "feature-flags-group-heading";
	variantHeading.textContent = "Berichtenbox A/B/C-test";
	panel.appendChild(variantHeading);

	const variantFieldset = document.createElement("fieldset");
	variantFieldset.className = "settings-radio-group";
	const variantLegend = document.createElement("legend");
	variantLegend.textContent = "Variant";
	variantFieldset.appendChild(variantLegend);
	[
		["a", "A: Huidige berichtenbox"],
		["b", "B: Bericht met PDF-preview"],
		["c", "C: Bericht met directe acties"],
	].forEach(([value, labelText]) => {
		const label = document.createElement("label");
		label.className = "mode-option";
		const radio = document.createElement("input");
		radio.type = "radio";
		radio.name = "berichtenbox-variant";
		radio.value = value;
		radio.checked = getSettingValue("berichtenbox-variant", "a") === value;
		radio.addEventListener("change", () => setSettingValue("berichtenbox-variant", value));
		label.appendChild(radio);
		label.appendChild(document.createElement("span")).textContent = labelText;
		variantFieldset.appendChild(label);
	});
	panel.appendChild(variantFieldset);

	// --- Digitale Assistent instellingen ---
	const settingsHeading = document.createElement("p");
	settingsHeading.className = "feature-flags-group-heading";
	settingsHeading.textContent = "Digitale Assistent";
	panel.appendChild(settingsHeading);

	// LLM keuze
	const llmFieldset = document.createElement("fieldset");
	llmFieldset.className = "settings-radio-group";
	const llmLegend = document.createElement("legend");
	llmLegend.textContent = "LLM";
	llmFieldset.appendChild(llmLegend);
	["vlam", "claude"].forEach((value) => {
		const label = document.createElement("label");
		label.className = "mode-option";
		const radio = document.createElement("input");
		radio.type = "radio";
		radio.name = "admin-llm";
		radio.value = value;
		radio.checked = getSettingValue("llm", "claude") === value;
		radio.addEventListener("change", () => setSettingValue("llm", value));
		label.appendChild(radio);
		label.appendChild(document.createElement("span")).textContent = value.toUpperCase();
		llmFieldset.appendChild(label);
	});
	panel.appendChild(llmFieldset);

	// Transport keuze
	const transportFieldset = document.createElement("fieldset");
	transportFieldset.className = "settings-radio-group";
	const transportLegend = document.createElement("legend");
	transportLegend.textContent = "Transport";
	transportFieldset.appendChild(transportLegend);
	["mcp", "cli"].forEach((value) => {
		const label = document.createElement("label");
		label.className = "mode-option";
		const radio = document.createElement("input");
		radio.type = "radio";
		radio.name = "admin-transport";
		radio.value = value;
		radio.checked = getSettingValue("transport", "mcp") === value;
		radio.addEventListener("change", () => setSettingValue("transport", value));
		label.appendChild(radio);
		label.appendChild(document.createElement("span")).textContent = value.toUpperCase();
		transportFieldset.appendChild(label);
	});
	panel.appendChild(transportFieldset);

	// Demo-modus voor de Digitale Assistent: toon het patroon zonder backend.
	const demoField = document.createElement("label");
	demoField.className = "settings-field";
	const demoToggle = document.createElement("input");
	demoToggle.type = "checkbox";
	demoToggle.checked = getSettingValue("demo-mode", "false") === "true";
	demoToggle.addEventListener("change", () => setSettingValue("demo-mode", demoToggle.checked ? "true" : "false"));
	demoField.appendChild(demoToggle);
	demoField.appendChild(document.createTextNode(" Demo-modus: toon een werkend voorbeeld zonder echte API"));
	panel.appendChild(demoField);

	// Freeze thinking element: houdt het denk-element zichtbaar voor animatie-aanpassingen
	const freezeField = document.createElement("label");
	freezeField.className = "settings-field";
	const freezeToggle = document.createElement("input");
	freezeToggle.type = "checkbox";
	freezeToggle.checked = getSettingValue("freeze-thinking", "false") === "true";
	freezeToggle.addEventListener("change", () => setSettingValue("freeze-thinking", freezeToggle.checked ? "true" : "false"));
	freezeField.appendChild(freezeToggle);
	freezeField.appendChild(document.createTextNode(" Freeze thinking element (voor tweaking)"));
	panel.appendChild(freezeField);

	// Pauzeknop voor de wait-indicator animatie: handig om de animatie visueel aan te passen
	const pauseField = document.createElement("label");
	pauseField.className = "settings-field";
	const pauseToggle = document.createElement("input");
	pauseToggle.type = "checkbox";
	pauseToggle.checked = getSettingValue("pause-animations", "false") === "true";
	pauseToggle.addEventListener("change", () => {
		const isPaused = pauseToggle.checked;
		setSettingValue("pause-animations", isPaused ? "true" : "false");
		if (isPaused) {
			document.documentElement.classList.add("animations-paused");
		} else {
			document.documentElement.classList.remove("animations-paused");
		}
	});
	pauseField.appendChild(pauseToggle);
	pauseField.appendChild(document.createTextNode(" Animaties pauzeren (voor aanpassingen)"));
	panel.appendChild(pauseField);

	// Pas de initiële pauzestaat toe
	if (getSettingValue("pause-animations", "false") === "true") {
		document.documentElement.classList.add("animations-paused");
	}

	// Testantwoord met bronvermelding: alleen zinvol op een pagina met een chat.
	// digitale-assistent.js laadt na dit script, dus we controleren op het element
	// en niet op window.MozaAssistent — die bestaat hier nog niet.
	if (document.getElementById("chat-messages")) {
		const testAntwoordBtn = document.createElement("button");
		testAntwoordBtn.className = "feature-flags-actie";
		testAntwoordBtn.textContent = "Testantwoord met bronvermelding tonen";
		testAntwoordBtn.addEventListener("click", () => {
			if (window.MozaAssistent) window.MozaAssistent.testAntwoord();
		});
		panel.appendChild(testAntwoordBtn);
	}

	// API Key velden, plus het KvK-nummer dat de assistent als bedrijfsidentiteit
	// meestuurt: ingevuld wint dat van het nummer van de actieve persona. Geen
	// geheim (het staat al in personas.json), dus een gewoon tekstveld.
	[
		{ key: "vlam-api-key", label: "VLAM API Key", type: "password", placeholder: "sk-..." },
		{ key: "claude-api-key", label: "Claude API Key", type: "password", placeholder: "sk-..." },
		{ key: "test-user-kvk", label: "KvK-nummer assistent", type: "text", placeholder: "85234567" },
	].forEach(({ key, label: labelText, type, placeholder }) => {
		const field = document.createElement("div");
		field.className = "settings-field";
		const label = document.createElement("label");
		label.textContent = labelText;
		const input = document.createElement("input");
		input.type = type;
		input.value = getSettingValue(key, "");
		input.placeholder = placeholder;
		if (type === "text") input.inputMode = "numeric";
		input.addEventListener("input", () => setSettingValue(key, input.value));
		label.appendChild(input);
		field.appendChild(label);
		panel.appendChild(field);
	});

	// Hard reset: beide opslagen leeg. localStorage draagt bewaarde items, verborgen
	// items en de lopende zaken die de assistent aanmaakt; sessionStorage draagt het
	// gesprek zelf. Alleen localStorage wissen laat het gesprek van de vorige
	// gebruiker staan — bij demo's en gebruikersonderzoek precies wat je niet wilt.
	// De feature flags overleven dit: die staan in een cookie.
	const clearBtn = document.createElement("button");
	clearBtn.className = "feature-flags-clear";
	clearBtn.textContent = "Hard reset (alles wissen)";
	clearBtn.addEventListener("click", () => {
		if (!window.confirm("Alles wissen? Het gesprek, de bewaarde items en de lopende zaken verdwijnen.")) return;
		localStorage.clear();
		try {
			sessionStorage.clear();
		} catch (e) {
			/* privémodus: er was dan ook niets bewaard */
		}
		location.reload();
	});
	panel.appendChild(clearBtn);

	const toggle = document.createElement("button");
	toggle.className = "feature-flags-toggle";
	toggle.setAttribute("aria-expanded", "false");
	toggle.textContent = "Flags";
	toggle.addEventListener("click", () => {
		const expanded = panel.hidden;
		panel.hidden = !expanded;
		toggle.setAttribute("aria-expanded", String(expanded));
	});

	document.body.appendChild(panel);
	document.body.appendChild(toggle);

	document.addEventListener("click", (e) => {
		if (!panel.hidden && !panel.contains(e.target) && !toggle.contains(e.target)) {
			panel.hidden = true;
			toggle.setAttribute("aria-expanded", "false");
		}
	});
}

applyFeatureFlags();
buildTogglePanel();
