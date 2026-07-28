import { API_URL_PROFIEL_SERVICE } from "../../../config/config";
import { GetProfielInformationParams, GetProfielInformationResponse } from "../types";

export async function getProfielInformation<T = unknown>(params: GetProfielInformationParams, signal?: AbortSignal): Promise<GetProfielInformationResponse<T>> {
	// Prefer the local proxy when running in the browser on localhost (port 4040)
	const proxyPort = 4040;
	const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
	const proxyOrigin = isLocalhost ? `${window.location.protocol}//${window.location.hostname}:${proxyPort}` : undefined;

	const path = "/api/profielservice/v1/partij";
	const upstreamUrl = new URL(path, API_URL_PROFIEL_SERVICE).toString();

	const fetchUrl = proxyOrigin ? new URL(path, proxyOrigin).toString() : upstreamUrl;

	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (proxyOrigin) {
		// Instruct the proxy which upstream to use for this request
		headers["x-proxy-target"] = upstreamUrl;
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
