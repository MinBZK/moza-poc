export const pocFetch = async <T = unknown>({ path, baseUrl, params, method = "GET", signal }: { path: string; baseUrl: string; params: Record<string, unknown>; method?: "POST" | "GET" | "PUT" | "DELETE" | "OPTIONS"; signal?: AbortSignal }): Promise<{ data: T | null; status: number }> => {
	const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

	const upstreamUrl = new URL(path, baseUrl).toString();
	let fetchUrl: string;
	const headers: Record<string, string> = { "Content-Type": "application/json" };

	if (isLocalhost) {
		// Local dev: use local proxy and instruct it which upstream to call.
		// De site draait lokaal op 8080, dus de proxy staat ernaast op 8081:
		// `PROXY_PORT=8081 npm run proxy`. Delen ze een poort, dan vangt de
		// dev-server deze aanroepen op en krijgt de island zijn eigen 404-pagina
		// terug in plaats van gegevens.
		const proxyPort = 8081;
		fetchUrl = `http://localhost:${proxyPort}${path}`;
		headers["x-proxy-target"] = upstreamUrl;
	} else {
		// Production / preview: call the site-relative path so the site's nginx
		// reverse-proxy performs the server-side call to the upstream. Do NOT
		// set x-proxy-target in non-local environments.
		fetchUrl = path;
	}

	const options: RequestInit = {
		method,
		headers,
		signal,
	};

	if (method !== "GET" && method !== "OPTIONS") {
		options.body = JSON.stringify(params);
	}

	const resp = await fetch(fetchUrl, options);

	const data = await resp.json().catch(() => null);
	return { data, status: resp.status };
};
