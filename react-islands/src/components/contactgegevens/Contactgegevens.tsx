import React from "react";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getProfielInformation } from "./actions/getProfielInformation";
import type { GetProfielInformationParams } from "./actions/types";

const _ContactGegevens = ({ type }: { type: "zakelijk" | "prive" }) => {
	const [count, setCount] = React.useState(0);
	console.log(type);
	const params: GetProfielInformationParams = {
		identificatieNummer: type === "zakelijk" ? "90006623" : "000000036",
		identificatieType: type === "zakelijk" ? "KVK" : "BSN",
	};

	const { data, isLoading, isError } = useQuery({
		queryKey: ["profiel", params.identificatieNummer, type],
		queryFn: ({ signal }) => getProfielInformation(params, signal),
	});

	return (
		<div>
			<button
				onClick={() => setCount((c) => c + 1)}
				style={{
					padding: "8px 16px",
					fontSize: "14px",
					border: "1px solid #0066cc",
					borderRadius: "4px",
					backgroundColor: "#0066cc",
					color: "white",
					cursor: "pointer",
				}}
			>
				{type} ({count})
			</button>

			{isLoading && <p>Loading profile…</p>}
			{isError && <p>Error loading profile</p>}
			{data && <pre>{JSON.stringify(data.data, null, 2)}</pre>}
		</div>
	);
};

export const Contactgegevens = ({ type = "zakelijk" }: { type?: "zakelijk" | "prive" }) => {
	// Create QueryClient once per module instance using a ref so it isn't recreated on every render
	const queryClientRef = React.useRef<QueryClient | null>(null);
	if (!queryClientRef.current) queryClientRef.current = new QueryClient();

	return (
		<QueryClientProvider client={queryClientRef.current}>
			<_ContactGegevens type={type} />
		</QueryClientProvider>
	);
};
