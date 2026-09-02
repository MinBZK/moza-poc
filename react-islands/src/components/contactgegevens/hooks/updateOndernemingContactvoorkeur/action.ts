import { API_URL_PROFIEL_SERVICE } from "../../../../config/config";
import { pocFetch } from "../../../../helpers/pocFetch";
import { components } from "../../../../network/profiel/generated";

export const updateEmail = async (
	identificatieNummer: string,
	identificatieType: components["schemas"]["IdentificatieType"],
	body: components["schemas"]["ContactgegevenUpdateRequest"],
	isDefault: boolean = true // TODO: caller should decide once multiple emails are supported
) => {
	if (body.id) {
		const response = await pocFetch({
			method: "PUT",
			baseUrl: API_URL_PROFIEL_SERVICE,
			path: "/api/profielservice/v1/voorkeur",
			params: {
				...body,
				identificatieNummer,
				identificatieType,
				isDefault,
			},
		});
		return response.status;
	} else {
		const { id: _id, ...postBody } = body;
		const response = await pocFetch({
			method: "POST",
			baseUrl: API_URL_PROFIEL_SERVICE,
			path: "/api/profielservice/v1/contactgegeven",
			params: {
				...postBody,
				identificatieNummer,
				identificatieType,
				isDefault,
			},
		});
		return response.status;
	}
};

export const requestVerificationCode = async (body: components["schemas"]["EmailVerificatieCodeAanvraagRequest"]) => {
	const response = await pocFetch({
		method: "POST",
		baseUrl: API_URL_PROFIEL_SERVICE,
		path: "/api/profielservice/v1/emailverificatie/code",
		params: body,
	});
	if (response.status === 503) {
		throw new Error("SERVICE_UNAVAILABLE");
	}
	return response.status;
};

export const verifyEmail = async (body: components["schemas"]["EmailVerificatieRequest"]) => {
	const response = await pocFetch({
		method: "POST",
		baseUrl: API_URL_PROFIEL_SERVICE,
		path: "/api/profielservice/v1/emailverificatie",
		params: body,
	});
	return response.status;
};
