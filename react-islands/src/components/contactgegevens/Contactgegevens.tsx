import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GetProfielInformationParams } from "./types";
import { ContactGegevensList } from "./_ContactGegevensList";

export const Contactgegevens = ({ type = "zakelijk" }: { type?: "zakelijk" | "prive" }) => {
	const params: GetProfielInformationParams = {
		identificatieNummer: type === "zakelijk" ? "90006623" : "000000036",
		identificatieType: type === "zakelijk" ? "KVK" : "BSN",
	};

	// Create QueryClient once per module instance using a ref so it isn't recreated on every render
	const queryClientRef = React.useRef<QueryClient | null>(null);
	if (!queryClientRef.current) queryClientRef.current = new QueryClient();

	return (
		<QueryClientProvider client={queryClientRef.current}>
			<ContactGegevensList identificatieNummer={params.identificatieNummer} identificatieType={params.identificatieType} />
		</QueryClientProvider>
	);
};
