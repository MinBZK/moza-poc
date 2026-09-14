/**
 * Dev-proxy voor het Federatief Berichtenstelsel.
 *
 * In een container staat nginx voor de site en zet die `/api/v1/` en `/api/demo/` door naar het
 * stelsel (zie `container/default.conf.template`). De Eleventy-dev-server doet dat niet, dus
 * lokaal kwamen die verzoeken uit bij de statische site: een 404, waarna een testaccount van het
 * stelsel een lege berichtenbox kreeg met de melding dat het stelsel hier niet beschikbaar is.
 *
 * Deze middleware doet hetzelfde als nginx, met dezelfde afspraken:
 *
 * - de Host-header volgt de upstream, niet `localhost` — het stelsel zit achter een gedeelde
 *   ingress die op die header routeert;
 * - voor een bijlage-adres wordt het cookie `ontvanger` een `X-Ontvanger`-header, want een
 *   `<a href>` kan geen eigen header meesturen;
 * - de ophaalronde is een SSE-stroom: niets bufferen, ruime timeout.
 *
 * Alleen voor lokaal ontwikkelen. In een uitgerolde omgeving draait nginx en komt dit bestand niet
 * in beeld; het staat dan ook niet in de container.
 *
 * Aan te passen met dezelfde variabelen als de container gebruikt:
 *   BACKEND_KETEN, BACKEND_KETEN_HOST, BACKEND_PERSONAS, BACKEND_PERSONAS_HOST, BACKEND_DEMO
 * Leeg zetten van BACKEND_KETEN schakelt de proxy uit; dan gedraagt localhost zich weer als een
 * omgeving zonder stelsel, wat de melding daarover ook weer laat zien.
 */
const { createProxyMiddleware } = require("http-proxy-middleware");

// Dezelfde standaardwaarden als container/Containerfile, zodat lokaal en uitgerold hetzelfde
// stelsel aanspreken zonder dat iemand iets hoeft in te stellen.
const KETEN = process.env.BACKEND_KETEN ?? "https://uitvraag-test-mpfb-8wh.rig.prd1.gn2.quattro.rijksapps.nl";
const PERSONAS = process.env.BACKEND_PERSONAS ?? "https://demopersonas-test-mpfm-w3h.rig.prd1.gn2.quattro.rijksapps.nl";
const DEMO = process.env.BACKEND_DEMO || KETEN;

const hostVan = (doel, override) => override || (doel ? new URL(doel).host : "");

const BIJLAGE = /^\/api\/v1\/berichten\/[^/]+\/bijlagen\/[^/]+$/;

function leesCookie(req, naam) {
	const ruw = req.headers.cookie;
	if (!ruw) return "";
	for (const deel of ruw.split(";")) {
		const [sleutel, ...rest] = deel.trim().split("=");
		if (sleutel === naam) return rest.join("=");
	}
	return "";
}

function proxy(doel, host, extra = {}) {
	return createProxyMiddleware({
		target: doel,
		// Host én TLS-servernaam volgen de upstream. Zetten we alleen de Host-header, dan blijft de
		// handshake `localhost` melden en wijst een gedeelde ingress de verbinding af. Dit is wat
		// nginx doet met `proxy_set_header Host $backend_keten_host` plus `proxy_ssl_server_name on`.
		changeOrigin: true,
		secure: true,
		xfwd: true,
		// De ophaalronde is een stroom. Bufferen zou de voortgang per organisatie pas aan het eind
		// laten zien, en dan lijkt de pagina te hangen tot de traagste organisatie klaar is.
		selfHandleResponse: false,
		proxyTimeout: 3600 * 1000,
		timeout: 3600 * 1000,
		onProxyReq(proxyReq, req) {
			// Alleen nodig als de ingress op een andere naam routeert dan waar we naartoe verbinden;
			// anders heeft changeOrigin de Host al goed gezet.
			if (host && host !== new URL(doel).host) proxyReq.setHeader("Host", host);

			// Een bijlage staat in een <a href> en kan geen header meesturen; de browser zet de
			// ontvanger daarom in een cookie. Alleen invullen als de browser zelf niets stuurde:
			// een fetch met X-Ontvanger hoort voor te gaan.
			if (BIJLAGE.test(req.url.split("?")[0]) && !req.headers["x-ontvanger"]) {
				const ontvanger = leesCookie(req, "ontvanger");
				if (ontvanger) proxyReq.setHeader("X-Ontvanger", ontvanger);
			}
		},
		onError(fout, req, res) {
			// Zichtbaar falen: anders blijft het verzoek hangen en lijkt het stelsel traag in plaats
			// van onbereikbaar.
			console.error("[keten-proxy] " + req.method + " " + req.url + " → " + fout.message);
			if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
			res.end("De dev-proxy kon het stelsel niet bereiken: " + fout.message);
		},
		...extra,
	});
}

/**
 * De middlewares voor de dev-server, in de volgorde waarin nginx ze ook toepast: het specifieke
 * adres van de testaccounts vóór de rest van de demo-console.
 *
 * Geeft een lege lijst als BACKEND_KETEN leeg is; dan blijft localhost een omgeving zonder stelsel.
 */
function ketenProxy() {
	if (!KETEN) {
		console.log("[keten-proxy] BACKEND_KETEN is leeg: geen proxy, localhost draait zonder stelsel.");
		return [];
	}

	const ketenHost = hostVan(KETEN, process.env.BACKEND_KETEN_HOST);
	const personasHost = hostVan(PERSONAS, process.env.BACKEND_PERSONAS_HOST);
	const demoHost = hostVan(DEMO, process.env.BACKEND_DEMO_HOST);

	console.log("[keten-proxy] /api/v1/ → " + KETEN);
	console.log("[keten-proxy] /api/demo/personas → " + PERSONAS);

	const personas = proxy(PERSONAS, personasHost);
	const demo = proxy(DEMO, demoHost);
	const keten = proxy(KETEN, ketenHost);

	return [
		function ketenProxyMiddleware(req, res, next) {
			const pad = (req.url || "").split("?")[0];
			if (pad === "/api/demo/personas") return personas(req, res, next);
			if (pad.startsWith("/api/demo/")) return demo(req, res, next);
			if (pad.startsWith("/api/v1/")) return keten(req, res, next);
			return next();
		},
	];
}

module.exports = { ketenProxy };
