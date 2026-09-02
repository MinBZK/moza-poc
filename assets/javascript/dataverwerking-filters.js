(function () {
	const NS = "dataverwerkingFilters";

	function readActivities() {
		try {
			const jsonEl = document.getElementById("activiteiten-data");
			let activities = jsonEl ? JSON.parse(jsonEl.textContent || "[]") : [];

			if ((!activities || activities.length === 0) && window[NS] && Array.isArray(window[NS].activities)) activities = window[NS].activities;
			if ((!activities || activities.length === 0) && Array.isArray(window.activiteitenLogData)) activities = window.activiteitenLogData;
			if ((!activities || activities.length === 0) && Array.isArray(window.activiteitenData)) activities = window.activiteitenData;
			if (typeof activities === "string") {
				try {
					activities = JSON.parse(activities);
				} catch (e) {
					/* ignore */
				}
			}

			return Array.isArray(activities) ? activities : [];
		} catch (err) {
			console.error("dataverwerking-filters: readActivities error", err);
			return [];
		}
	}

	function formatEntryHtml(entry) {
		const container = document.createElement("li");
		container.className = "card-topic";
		container.setAttribute("data-id", entry.id || "");
		container.setAttribute("data-year", entry.datetime || "");
		container.setAttribute("data-source", entry.source || "");
		if (entry.relatedProduct && entry.relatedProduct.id) container.setAttribute("data-zaak", entry.relatedProduct.id);

		const a = document.createElement("a");
		a.className = "content-link";
		a.href = "/moza/dataverwerking/#" + (entry.id || "");
		const h3 = document.createElement("h3");
		h3.textContent = (entry.source || "") + " — " + (entry.datetime || "");
		a.appendChild(h3);
		const span = document.createElement("span");
		span.className = "card-link";
		a.appendChild(span);
		container.appendChild(a);

		const p = document.createElement("p");
		if (Array.isArray(entry.data)) {
			entry.data.forEach((d, i) => {
				const strong = document.createElement("strong");
				strong.textContent = (d.request || "") + ":";
				p.appendChild(strong);
				p.appendChild(document.createTextNode(" " + (d.response || "")));
				if (i !== entry.data.length - 1) p.appendChild(document.createElement("br"));
			});
		}
		container.appendChild(p);
		return container;
	}

	function populateSelects(activities) {
		const selectYear = document.getElementById("filter-jaar");
		const selectSource = document.getElementById("filter-afzender");
		const selectZaak = document.getElementById("filter-zaak");
		if (!selectYear && !selectSource && !selectZaak) return;

		const years = new Set();
		const sources = new Set();
		const zaakMap = new Map();
		(activities || []).forEach((a) => {
			if (a && a.datetime) years.add(String(a.datetime).slice(0, 4));
			if (a && a.source) sources.add(a.source);
			if (a && a.relatedProduct && a.relatedProduct.id) zaakMap.set(a.relatedProduct.id, a.relatedProduct.type);
		});

		function clearOptions(sel) {
			if (!sel) return;
			while (sel.options && sel.options.length > 1) sel.remove(1);
		}
		clearOptions(selectYear);
		clearOptions(selectSource);
		clearOptions(selectZaak);

		Array.from(years)
			.sort()
			.reverse()
			.forEach((y) => {
				if (!selectYear) return;
				const o = document.createElement("option");
				o.value = y;
				o.textContent = y;
				selectYear.appendChild(o);
			});
		Array.from(sources)
			.sort()
			.forEach((s) => {
				if (!selectSource) return;
				const o = document.createElement("option");
				o.value = s.toLowerCase();
				o.textContent = s;
				selectSource.appendChild(o);
			});
		Array.from(zaakMap.entries()).forEach(([id, type]) => {
			if (!selectZaak) return;
			const o = document.createElement("option");
			o.value = id;
			o.textContent = `${type} — ${id.slice(0, 8)}`;
			selectZaak.appendChild(o);
		});
	}

	function getFilters() {
		const y = (document.getElementById("filter-jaar") && document.getElementById("filter-jaar").value) || "";
		const s = ((document.getElementById("filter-afzender") && document.getElementById("filter-afzender").value) || "").toLowerCase();
		const z = (document.getElementById("filter-zaak") && document.getElementById("filter-zaak").value) || "";
		return { y, s, z };
	}

	function filterActivities(activities, filters) {
		return (activities || []).filter((a) => {
			const ey = a && a.datetime ? (a.datetime.slice ? a.datetime.slice(0, 4) : String(a.datetime).slice(0, 4)) : "";
			const es = a && a.source ? (a.source || "").toLowerCase() : "";
			const ez = a && a.relatedProduct && a.relatedProduct.id ? a.relatedProduct.id : "";
			return (!filters.y || ey === filters.y) && (!filters.s || es === filters.s) && (!filters.z || ez === filters.z);
		});
	}

	function renderList() {
		const activities = readActivities();
		window[NS] = window[NS] || {};
		window[NS].activities = activities;
		populateSelects(activities);

		const listEl = document.getElementById("activiteiten-list");
		const pagEl = document.getElementById("activiteiten-pagination");
		if (pagEl) pagEl.style.display = "none";
		if (!listEl) return console.log("dataverwerking-filters: no #activiteiten-list");

		const filters = getFilters();
		const filtered = filterActivities(activities, filters);

		listEl.innerHTML = "";
		filtered.forEach((entry) => listEl.appendChild(formatEntryHtml(entry)));

		console.log("dataverwerking-filters: renderList", { total: filtered.length });
	}

	function init() {
		try {
			console.log("dataverwerking-filters:init");
			// initial render
			renderList();

			// attach listeners
			["filter-jaar", "filter-afzender", "filter-zaak"].forEach((id) => {
				const el = document.getElementById(id);
				if (el) el.addEventListener("change", () => renderList());
			});

			// expose applyFilters
			window[NS] = window[NS] || {};
			window[NS].applyFilters = renderList;
		} catch (err) {
			console.error("dataverwerking-filters init error", err);
		}
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
