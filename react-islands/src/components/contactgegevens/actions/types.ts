export type GetProfielInformationParams = {
	identificatieNummer: string;
	identificatieType: string;
	dienstverlener?: string;
	dienstNaam?: string;
};

export type GetProfielInformationResponse<T = unknown> = {
	data: T | null;
	status: number;
};
