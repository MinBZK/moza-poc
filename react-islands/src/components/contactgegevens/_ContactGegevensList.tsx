"use client";

import { components } from "../../network/profiel/generated";
import { AanhefEditBox } from "./_AanhefEditBox";
import { ContactEditBox } from "./_ContactEditBox";
import { TaalEditBox } from "./_TaalEditBox";
import { useGetProfielInformation } from "./hooks/getProfielInformation/useGetProfielInformation";

export const ContactGegevensList = ({ identificatieNummer, identificatieType }: { identificatieNummer: string; identificatieType: components["schemas"]["IdentificatieType"] }) => {
	const { data, status } = useGetProfielInformation({ identificatieType, identificatieNummer });

	const email = data?.data?.contactgegevens?.find(({ type }) => type === "Email");
	const telefoonnummer = data?.data?.contactgegevens?.find(({ type }) => type === "Telefoonnummer");
	const aanhef = data?.data?.voorkeuren?.find(({ voorkeurType }) => voorkeurType === "Aanhef");
	const taal = data?.data?.voorkeuren?.find(({ voorkeurType }) => voorkeurType === "WebsiteTaal");

	if (status === "pending") return <div>Loading...</div>;

	if (status === "error") {
		return <div>Error!</div>;
	}

	return (
		<div className="flex w-full flex-col gap-4 overflow-x-auto">
			<div className="flex flex-col gap-0 bg-neutral-100 p-4">
				<AanhefEditBox voorkeur={aanhef} idenType={identificatieType} idenValue={identificatieNummer} />
				<hr className="my-3 border-neutral-300" />

				<TaalEditBox voorkeur={taal} idenType={identificatieType} idenValue={identificatieNummer} />
				<hr className="my-3 border-neutral-300" />

				<ContactEditBox name={"Email"} label={"E-mailadres"} contactGegeven={email} idenType={identificatieType} idenValue={identificatieNummer} />
				<hr className="my-3 border-neutral-300" />

				<ContactEditBox name={"Telefoonnummer"} label={"Telefoonnummer"} contactGegeven={telefoonnummer} idenType={identificatieType} idenValue={identificatieNummer} />
			</div>

			{/* {data?.status === 404 && <CopyNotificatie kvkNummer={kvk} />} */}
		</div>
	);
};
