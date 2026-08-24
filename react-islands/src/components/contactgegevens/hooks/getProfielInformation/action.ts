import { API_URL_PROFIEL_SERVICE } from "../../../../config/config";
import { pocFetch } from "../../../../helpers/fetcher";
import { GetProfielInformationResponse, GetProfielInformationParams } from "../../types";

export async function getProfielInformation(params: GetProfielInformationParams, signal?: AbortSignal) {
	return pocFetch<GetProfielInformationResponse>({
		method: "POST",
		path: "/api/profielservice/v1/partij",
		baseUrl: API_URL_PROFIEL_SERVICE,
		params,
		signal,
	});
}
