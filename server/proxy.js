#!/usr/bin/env node

// This is a simply proxy server that forwards requests to a target backend, while adding CORS headers and allowing per-request target overrides via header or query parameter. It is intended for local development use only.
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const PORT = process.env.PROXY_PORT || 4040;
const TARGET = process.env.PROXY_TARGET;

const app = express();

// Simple request logger
app.use((req, res, next) => {
	console.log(`[proxy] ${req.method} ${req.url}`);
	next();
});

// Parse JSON bodies only for methods that usually contain a body
app.use((req, res, next) => {
	if (["POST", "PUT", "PATCH"].includes(req.method)) {
		return express.json({ limit: "1mb" })(req, res, next);
	}
	return next();
});

// CORS middleware: allow the dev front-end (and other origins) to call the proxy
app.use((req, res, next) => {
	const origin = req.headers.origin || "*";
	res.setHeader("Access-Control-Allow-Origin", origin);
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "Origin, X-Requested-With, Content-Type, Accept, Authorization");
	res.setHeader("Access-Control-Allow-Credentials", "true");

	// Short-circuit preflight requests
	if (req.method === "OPTIONS") {
		return res.sendStatus(204);
	}

	next();
});

// Proxy any request under /api to the target (supports per-request target via header or query)
app.use(
	"/api",
	createProxyMiddleware({
		// default target if none specified per-request
		target: TARGET,
		changeOrigin: true,
		secure: true,
		logLevel: "info",
		// Allow per-request target via header 'x-proxy-target' or query '?target='
		router: (req) => {
			const perReq = req.headers["x-proxy-target"] || (req.query && (req.query.target || req.query.proxyTarget));
			if (!perReq) return TARGET;
			try {
				const u = new URL(perReq);
				return u.origin;
			} catch (e) {
				// If just an origin without protocol was provided, assume https
				if (/^[a-z0-9.-]+(:[0-9]+)?$/i.test(perReq)) return `https://${perReq}`;
				return TARGET;
			}
		},
		// Resolve the upstream path dynamically: if a full URL was provided use its path,
		// otherwise forward the incoming request path unchanged.
		proxyReqPathResolver: (req) => {
			const perReq = req.headers["x-proxy-target"] || (req.query && (req.query.target || req.query.proxyTarget));
			if (!perReq) return req.originalUrl;
			try {
				const u = new URL(perReq);
				// ensure path portion exists
				return u.pathname + u.search;
			} catch (e) {
				return req.originalUrl;
			}
		},
		onProxyReq(proxyReq, req, res) {
			// If the request body was parsed by express.json(), we need to re-serialize it
			// and explicitly write it to the proxy request. This prevents empty bodies
			// for POST/PUT when middleware has already consumed the stream.
			if (req.body && Object.keys(req.body).length) {
				const bodyData = JSON.stringify(req.body);
				// ensure correct headers
				proxyReq.setHeader("Content-Type", "application/json");
				proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
				proxyReq.write(bodyData);
				proxyReq.end();
				console.log(`[proxy] forwarded JSON body to target for ${req.method} ${req.url}:`, bodyData);
			} else {
				// No parsed body available; nothing to forward here
			}
		},
		onProxyRes(proxyRes, req, res) {
			// Ensure CORS headers remain present on proxied responses
			const origin = req.headers.origin || "*";
			proxyRes.headers["access-control-allow-origin"] = origin;
			proxyRes.headers["access-control-allow-credentials"] = "true";
			proxyRes.headers["access-control-allow-methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
			proxyRes.headers["access-control-allow-headers"] = req.headers["access-control-request-headers"] || "Origin, X-Requested-With, Content-Type, Accept, Authorization";
			// Ensure caches vary by Origin so responses for different origins don't get mixed
			proxyRes.headers["vary"] = "Origin";

			console.log(`[proxy] proxied response ${req.method} ${req.url} -> ${proxyRes.statusCode}`);
		},
		onError(err, req, res) {
			console.error("[proxy] error", err && err.message);
			if (err && err.code === "ECONNREFUSED") {
				console.error(`[proxy] ECONNREFUSED when connecting to target ${TARGET}. Is the target reachable?`);
			}
			if (!res.headersSent) {
				res.statusCode = 502;
				res.end("Bad Gateway");
			}
		},
	})
);

app.listen(PORT, () => {
	console.log(`[proxy] Listening on http://localhost:${PORT} -> ${TARGET}`);
});
