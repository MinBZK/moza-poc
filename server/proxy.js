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

// CORS middleware: allow the dev front-end (and other origins) to call the proxy
app.use((req, res, next) => {
	// If the browser sent an Origin, echo it back and allow credentials.
	// Only use wildcard '*' when no Origin header is present.
	const incomingOrigin = req.headers.origin;
	if (incomingOrigin) {
		res.setHeader("Access-Control-Allow-Origin", incomingOrigin);
		res.setHeader("Access-Control-Allow-Credentials", "true");
	} else {
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Credentials", "false");
	}

	res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "Origin, X-Requested-With, Content-Type, Accept, Authorization");

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
		// Ensure the upstream path preserves the original requested path (including /api)
		pathRewrite: (path, req) => {
			// req.originalUrl includes the full path as requested by the client
			console.log(`[proxy] pathRewrite: ${path} -> ${req.originalUrl}`);
			return req.originalUrl;
		},
		proxyReqPathResolver: (req) => {
			const upstreamPath = req.originalUrl;
			console.log(`[proxy] forwarding incoming path for ${req.method} ${req.url} -> ${upstreamPath}`);
			return upstreamPath;
		},
		onProxyReq(proxyReq, req, res) {
			// For local proxying, strip Origin/Referer to present the request as
			// a server-to-server call. Some backends reject unexpected browser
			// origins; removing Origin often allows the request.
			const perReq = req.headers["x-proxy-target"] || (req.query && (req.query.target || req.query.proxyTarget));
			if (perReq) {
				try {
					const u = new URL(perReq);
					// Present the request to the upstream as coming from the upstream origin
					// so the backend's CORS allowlist accepts it.
					proxyReq.setHeader("Origin", u.origin);
					proxyReq.setHeader("Referer", u.origin);
					// Ensure backend receives expected Host header (hostname[:port])
					if (u.port) {
						proxyReq.setHeader("Host", `${u.hostname}:${u.port}`);
					} else {
						proxyReq.setHeader("Host", u.hostname);
					}
					// Forward Authorization if the browser supplied it
					if (req.headers["authorization"]) {
						proxyReq.setHeader("Authorization", req.headers["authorization"]);
					}
				} catch (e) {
					// Invalid perReq format: ensure no Origin is forwarded
					proxyReq.removeHeader("Origin");
					proxyReq.removeHeader("Referer");
				}
			} else {
				// No explicit upstream target — ensure we don't forward the browser origin
				proxyReq.removeHeader("Origin");
				proxyReq.removeHeader("Referer");
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

			// Also ensure Express response headers include CORS so the browser sees them
			try {
				res.setHeader("Access-Control-Allow-Origin", origin);
				res.setHeader("Access-Control-Allow-Credentials", "true");
				res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
				res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "Origin, X-Requested-With, Content-Type, Accept, Authorization");
				res.setHeader("Vary", "Origin");
			} catch (e) {
				// ignore if headers already sent
			}

			// Collect upstream response body for debugging if status >= 400
			let body = "";
			proxyRes.on("data", (chunk) => {
				try {
					body += chunk.toString();
				} catch (e) {
					// ignore
				}
			});
			proxyRes.on("end", () => {
				console.log(`[proxy] proxied response ${req.method} ${req.url} -> ${proxyRes.statusCode}`);
				if (proxyRes.statusCode >= 400) {
					console.error(`[proxy] upstream response body:`, body.slice(0, 2000));
				}
			});
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
