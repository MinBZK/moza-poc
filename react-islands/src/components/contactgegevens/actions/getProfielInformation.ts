import { API_URL_PROFIEL_SERVICE } from "../../../config/config";
import { GetProfielInformationParams, GetProfielInformationResponse } from "../types";

export async function getProfielInformation<T = unknown>(params: GetProfielInformationParams, signal?: AbortSignal): Promise<GetProfielInformationResponse<T>> {
	const path = "/api/profielservice/v1/partij";
	const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

	let fetchUrl: string;
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	const upstreamUrl = new URL(path, API_URL_PROFIEL_SERVICE).toString();
	headers["x-proxy-target"] = upstreamUrl;

	if (isLocalhost) {
		// Local dev: use local proxy at port 8080, pass upstream via x-proxy-target header
		const proxyPort = 8080;
		fetchUrl = `${window.location.protocol}//${window.location.hostname}:${proxyPort}${path}`;
	} else {
		// Production: use same-origin nginx reverse proxy (no CORS, no x-proxy-target needed)
		fetchUrl = path;
	}

	const resp = await fetch(fetchUrl, {
		method: "POST",
		headers,
		body: JSON.stringify(params),
		signal,
	});

	const data = await resp.json().catch(() => null);
	return { data: data as T, status: resp.status };
}
