export type DataResponse<T = unknown> = {
	data: T | null;
	status: number;
};
