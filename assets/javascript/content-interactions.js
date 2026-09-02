/**
 * content-interactions.js
 *
 * Beheert alle interacties op inhoud en slaat staten op in localStorage:
 * - Bewaren (favorite:)
 * - Verbergen / niet relevant voor mij (hidden:)
 * - Relevant / niet relevant toggles (relevant:)
 * - Notificaties sluiten (dismissed:)
 */

// Vul lege visually-hidden labels in op basis van de heading in dezelfde <li> of <article>
document.querySelectorAll(".action-group .visually-hidden").forEach((span) => {
	if (span.textContent.trim()) return;
	const container = span.closest("li") || span.closest("article");
	const heading = container?.querySelector("h1, h2, h3, h4");
	if (heading) span.textContent = heading.textContent.trim();
});

function getCategory(li) {
	const section = li.closest("section");
	const heading = section?.querySelector(":scope > hgroup > h2, :scope > hgroup > h3, :scope > h2, :scope > h3");
	return heading?.textContent.trim() || "";
}

function getFavoriteKey(checkbox) {
	const label = checkbox.closest(".save-topic");
	const hidden = label?.querySelector(".visually-hidden");
	return hidden ? "favorite:" + hidden.textContent.trim() : null;
}

function getFavoriteData(checkbox) {
	const li = checkbox.closest("li");
	if (li) {
		const link = li.querySelector("a.content-link");
		const title = link?.querySelector("h3")?.textContent.trim() || "";
		const url = link?.getAttribute("href") || "";
		const desc = li.querySelector(":scope > p")?.textContent.trim() || "";
		const category = getCategory(li);
		return { title, url, desc, category };
	}
	// Detailpagina: haal data uit de pagina zelf.
	const article = checkbox.closest("article");
	if (!article) return null;
	const title = article.querySelector("h1")?.textContent.trim() || "";
	const url = location.pathname;
	const desc = article.querySelector(".intro")?.textContent.trim() || "";
	const breadcrumb = article.querySelector(".breadcrumb li:nth-child(2) a") || article.querySelector(".breadcrumb li:nth-child(3) a");
	const category = breadcrumb?.textContent.trim() || "";
	return { title, url, desc, category };
}

// Herstel opgeslagen staat bij laden
document.querySelectorAll(".save-topic input[type='checkbox']").forEach((checkbox) => {
	const key = getFavoriteKey(checkbox);
	if (!key) return;
	const stored = localStorage.getItem(key);
	// Ondersteun zowel oud ("true") als nieuw (JSON) formaat
	if (stored && stored !== "false") {
		checkbox.checked = true;
	}
});

// Sla staat op bij wijziging
document.addEventListener("change", (e) => {
	if (e.target.matches(".save-topic input[type='checkbox']")) {
		const key = getFavoriteKey(e.target);
		if (!key) return;
		if (e.target.checked) {
			const data = getFavoriteData(e.target);
			localStorage.setItem(key, JSON.stringify(data));
		} else {
			localStorage.removeItem(key);
		}
	}
});

// Verberg topic bij klik op "Niet relevant voor mij"
function getItemData(li) {
	const link = li.querySelector("a.content-link");
	const title = link?.querySelector("h3, h4")?.textContent.trim() || "";
	const url = link?.getAttribute("href") || "";
	const desc = li.querySelector(":scope > p")?.textContent.trim() || "";
	const category = getCategory(li);
	return { title, url, desc, category };
}

function showNextReserve(list) {
	// Zoek het eerste reserve-topic dat nog verborgen is en niet al aan het verdwijnen is
	const reserve = list?.querySelector("li.reserve-topic[hidden]:not(.removing)");
	if (!reserve) return;
	reserve.hidden = false;
	reserve.classList.remove("reserve-topic");
}

function removeTopic(li) {
	const list = li.closest("ul");
	// Toon de volgende reserve direct, zodat het totaal aantal zichtbare items klopt
	showNextReserve(list);
	// Fade het verwijderde item uit
	let done = false;
	function hide() {
		if (done) return;
		done = true;
		li.hidden = true;
		li.classList.remove("remove-item");
	}
	li.classList.add("remove-item");
	li.addEventListener("animationend", hide, { once: true });
}

// Deel topic via Web Share API (fallback: kopieer link naar klembord)
document.addEventListener("click", async (e) => {
	const btn = e.target.closest(".share-topic");
	if (!btn) return;
	const li = btn.closest("li");
	let shareData;
	if (li) {
		const data = getItemData(li);
		shareData = { title: data.title, text: data.desc, url: data.url };
	} else {
		const article = btn.closest("article");
		if (!article) return;
		const title = article.querySelector("h1")?.textContent.trim() || document.title;
		const desc = article.querySelector(".intro")?.textContent.trim() || "";
		shareData = { title, text: desc, url: location.href };
	}
	try {
		if (navigator.share) {
			await navigator.share(shareData);
		} else {
			await navigator.clipboard.writeText(shareData.url);
			btn.textContent = "Link gekopieerd";
			setTimeout(() => { btn.textContent = "Deel"; }, 2000);
		}
	} catch {}
});

// Verberg topic bij klik op "Niet relevant voor mij" (.hide-topic)
document.addEventListener("click", (e) => {
	const btn = e.target.closest(".hide-topic");
	if (!btn) return;

	// Op een overzichtspagina: verberg het item in de lijst.
	const li = btn.closest("li");
	if (li) {
		const data = getItemData(li);
		if (!data.title) return;
		localStorage.setItem("hidden:" + data.title, JSON.stringify(data));
		removeTopic(li);
		return;
	}

	// Op een detailpagina: sla op en ga terug naar de overzichtspagina.
	const article = btn.closest("article");
	if (!article) return;
	const title = article.querySelector("h1")?.textContent.trim() || "";
	if (!title) return;
	const desc = article.querySelector(".intro")?.textContent.trim() || "";
	const url = location.pathname;
	const section = article.querySelector(".breadcrumb li:nth-child(3) a");
	const category = section?.textContent.trim() || "";
	localStorage.setItem("hidden:" + title, JSON.stringify({ title, url, desc, category }));
	// Navigeer terug naar de overzichtspagina (derde breadcrumb-item).
	if (section?.href) {
		location.href = section.href;
	} else {
		history.back();
	}
});

// Stabiele sleutel per feedback-blok: het id wanneer aanwezig, anders het
// paginapad plus de positie van het blok op de pagina. Zo onthouden we ook
// blokken zonder id, zonder af te hangen van (soms dynamische) tekstinhoud.
function feedbackKey(feedback) {
	if (feedback.id) return feedback.id;
	const alle = Array.prototype.slice.call(document.querySelectorAll(".feedback"));
	return location.pathname + "#" + alle.indexOf(feedback);
}

// Sluit feedback-notificaties met .btn-close en onthoud dit
document.addEventListener("click", (e) => {
	const btn = e.target.closest(".btn-close");
	if (!btn) return;
	const feedback = btn.closest(".feedback");
	if (!feedback) return;
	feedback.hidden = true;
	localStorage.setItem("dismissed:" + feedbackKey(feedback), "true");
});

document.querySelectorAll(".feedback").forEach((feedback) => {
	if (localStorage.getItem("dismissed:" + feedbackKey(feedback)) === "true") {
		feedback.hidden = true;
	}
});

// Markeer reserve-topics die eerder als niet-relevant zijn gemarkeerd,
// zodat showNextReserve() ze overslaat bij het doorschuiven
document.querySelectorAll(".list-content-links li.reserve-topic").forEach((li) => {
	const data = getItemData(li);
	if (data.title && localStorage.getItem("hidden:" + data.title)) {
		li.classList.remove("reserve-topic");
	}
});

// Verberg eerder verborgen topics bij laden en schuif reserve-topics door
// Alleen voor items die nog zichtbaar waren, items die al hidden zijn
// (bijv. reserves waarvan .reserve-topic hierboven is verwijderd) overslaan
document.querySelectorAll(".list-content-links li:not(.reserve-topic)").forEach((li) => {
	if (li.closest("#saved-groups") || li.closest("#hidden-groups")) return;
	if (li.hidden) return;
	const data = getItemData(li);
	if (data.title && localStorage.getItem("hidden:" + data.title)) {
		li.hidden = true;
		showNextReserve(li.closest("ul"));
	}
});

// Ongelezen-status: markeer content-links als gelezen bij klik en werk badge bij.
function updateUnreadBadge() {
	const ongelezen = document.querySelectorAll(".content-link.is-unread").length;
	document.querySelectorAll("[data-unread-badge]").forEach((badge) => {
		badge.textContent = ongelezen;
		badge.hidden = ongelezen === 0;
	});
	// Sla het aantal op zodat de badge ook op andere pagina's klopt.
	try {
		localStorage.setItem("unread:count", String(ongelezen));
	} catch (e) { /* localStorage niet toegankelijk */ }
}

// Herstel gelezen-status voor alle ongelezen links binnen een scope.
function herstelGelezenStatus(root = document) {
	root.querySelectorAll(".content-link.is-unread").forEach((link) => {
		const heading = link.querySelector("h2, h3, h4");
		if (!heading) return;
		const key = "read:" + heading.textContent.trim();
		if (localStorage.getItem(key)) {
			link.classList.remove("is-unread");
		}
	});
}

// Herstel gelezen-status bij laden.
herstelGelezenStatus();

// Herstel + badge bijwerken na dynamische rendering (zie homepage-profiel.js).
document.addEventListener("content:rendered", (e) => {
	herstelGelezenStatus(e.target instanceof Element ? e.target : document);
	updateUnreadBadge();
});

// Markeer als gelezen bij klik.
document.addEventListener("click", (e) => {
	const link = e.target.closest(".content-link.is-unread");
	if (!link) return;
	const heading = link.querySelector("h2, h3, h4");
	if (!heading) return;
	localStorage.setItem("read:" + heading.textContent.trim(), "true");
	link.classList.remove("is-unread");
	updateUnreadBadge();
	document.dispatchEvent(new CustomEvent("content:read"));
});

// Badge op andere pagina's bijwerken vanuit localStorage.
try {
	const opgeslagen = localStorage.getItem("unread:count");
	if (opgeslagen !== null) {
		document.querySelectorAll("[data-unread-badge]").forEach((badge) => {
			badge.textContent = opgeslagen;
			badge.hidden = opgeslagen === "0";
		});
	}
} catch (e) { /* localStorage niet toegankelijk */ }
