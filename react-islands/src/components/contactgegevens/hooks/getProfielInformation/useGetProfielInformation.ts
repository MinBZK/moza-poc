import { useQuery } from "@tanstack/react-query";
import { getProfielInformation } from "./action";
import { GetProfielInformationParams } from "../../types";

export function useGetProfielInformation(params: GetProfielInformationParams) {
	return useQuery({
		queryKey: ["profiel", params.identificatieType, params.identificatieNummer],
		queryFn: () => getProfielInformation(params),
		enabled: !!params.identificatieNummer,
	});
}
