export const pocFetch = async <T = unknown>({ path, baseUrl, params, method = "GET", signal }: { path: string; baseUrl: string; params: Record<string, unknown>; method?: "POST" | "GET" | "PUT" | "DELETE" | "OPTIONS"; signal?: AbortSignal }): Promise<{ data: T | null; status: number }> => {
	const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

	const upstreamUrl = new URL(path, baseUrl).toString();
	let fetchUrl: string;
	const headers: Record<string, string> = { "Content-Type": "application/json" };

	if (isLocalhost) {
		// Local dev: use local proxy and instruct it which upstream to call
		const proxyPort = 8080;
		fetchUrl = `http://localhost:${proxyPort}${path}`;
		headers["x-proxy-target"] = upstreamUrl;
	} else {
		// Production: call upstream directly from the browser (no server-side proxy)
		fetchUrl = upstreamUrl;
	}

	const resp = await fetch(fetchUrl, {
		method,
		headers,
		body: JSON.stringify(params),
		signal,
	});

	const data = await resp.json().catch(() => null);
	return { data, status: resp.status };
};
