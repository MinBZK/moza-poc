import { API_URL_PROFIEL_SERVICE } from "../../../../config/config";
import { pocFetch } from "../../../../helpers/pocFetch";
import { components } from "../../../../network/profiel/generated";

export const updateVoorkeur = async (identificatieNummer: string, identificatieType: components["schemas"]["IdentificatieType"], voorkeurType: components["schemas"]["VoorkeurType"], waarde: string, id?: string, scope?: components["schemas"]["ScopeRequest"]) => {
	const params = { voorkeurType, waarde, identificatieNummer, identificatieType, scope };

	if (id) {
		const response = await pocFetch({
			method: "PUT",
			baseUrl: API_URL_PROFIEL_SERVICE,
			path: "/api/profielservice/v1/voorkeur",
			params: {
				id,
				...params,
			},
		});

		return response.status;
	} else {
		const response = await pocFetch({
			method: "POST",
			baseUrl: API_URL_PROFIEL_SERVICE,
			path: "/api/profielservice/v1/voorkeur",
			params: {
				id,
				...params,
			},
		});

		return response.status;
	}
};
