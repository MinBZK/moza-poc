import { API_URL_PROFIEL_SERVICE } from "../../../config/config";

type GetProfielInformationParams = {
	identificatieNummer: string;
	identificatieType: string;
	dienstverlener?: string;
	dienstNaam?: string;
};

type GetProfielInformationResponse = {
	data: any;
	status: number;
};

export const getProfielInformation = async ({ identificatieNummer, identificatieType, dienstverlener, dienstNaam }: GetProfielInformationParams) => {
	const apiEndpoint = new URL(API_URL_PROFIEL_SERVICE);
	apiEndpoint.pathname = "/api/profielservice/v1/partij";

	// Weirdly, this is a POST call, even though we are just retrieving information. This is because the API expects a JSON body with the parameters which we didn't want te expose in the URL.
	const response = await fetch(apiEndpoint.toString(), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			identificatieNummer,
			identificatieType,
			dienstverlener,
			dienstNaam,
		}),
	});

	const data: GetProfielInformationResponse = await response.json();

	return { data: data, status: response.status };
};
