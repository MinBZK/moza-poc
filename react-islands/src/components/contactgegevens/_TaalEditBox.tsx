"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { EditBoxButton } from "./_editBoxButton";
import { components } from "../../network/profiel/generated";
import { EditIcon } from "../icons/EditIcon";
import { useUpdateVoorkeur } from "./hooks/updateVoorkeur/useUpdateVoorkeur";

const taalValues = ["Nederlands", "Engels", "Fries", "Papiamento", "Papiamentu"] as const;

export const TaalEditBox = ({ idenType, idenValue, voorkeur }: { idenType: components["schemas"]["IdentificatieType"]; idenValue: string; voorkeur?: components["schemas"]["VoorkeurResponse"] }) => {
	const [fieldState, setFieldState] = useState<"view" | "edit">("view");
	const [errorMessage, setErrorMessage] = useState<string | undefined>();
	const selectRef = useRef<HTMLSelectElement>(null);
	const { mutate } = useUpdateVoorkeur();
	const queryClient = useQueryClient();

	const [newValue, setNewValue] = useState(voorkeur?.waarde || "");
	const [prevWaarde, setPrevWaarde] = useState(voorkeur?.waarde);
	if (voorkeur?.waarde !== prevWaarde) {
		setPrevWaarde(voorkeur?.waarde);
		setNewValue(voorkeur?.waarde || "");
	}

	return (
		<form
			className="flex flex-col gap-3"
			noValidate
			onSubmit={(e) => {
				e.preventDefault();

				if (fieldState !== "edit") return;

				setErrorMessage(undefined);
				mutate(
					{
						identificatieNummer: idenValue,
						identificatieType: idenType,
						voorkeurType: "WebsiteTaal",
						waarde: newValue,
						id: voorkeur?.id,
					},
					{
						onSuccess: () => {
							setFieldState("view");
							queryClient.invalidateQueries({
								queryKey: ["profiel", idenType, idenValue],
							});
						},
						onError: () => {
							setErrorMessage("Er is een fout opgetreden bij het opslaan. Probeer het opnieuw.");
						},
					}
				);
			}}
		>
			<div className="contactgegeven-container">
				<label htmlFor="field-taal">Taalvoorkeur</label>
				<div>
					{fieldState === "edit" ? (
						<div className="">
							<select ref={selectRef} className="" id="field-taal" value={newValue} onChange={(e) => setNewValue(e.target.value)}>
								<option value="">Selecteer een taal</option>
								{taalValues.map((taal) => (
									<option key={taal} value={taal}>
										{taal}
									</option>
								))}
							</select>
							{errorMessage && <span className="form-field-error">{errorMessage}</span>}
						</div>
					) : newValue ? (
						<span>{newValue}</span>
					) : (
						<span className="text-missing">Niet opgegeven</span>
					)}
				</div>
				<div>
					{fieldState !== "edit" ? (
						<EditBoxButton
							icon={<EditIcon />}
							onClick={() => {
								setFieldState("edit");
								requestAnimationFrame(() => selectRef.current?.focus());
							}}
						>
							Aanpassen
						</EditBoxButton>
					) : (
						<div className="contactgegeven-save-actions">
							<EditBoxButton type="submit">Opslaan</EditBoxButton>
							<EditBoxButton
								onClick={() => {
									setFieldState("view");
									setErrorMessage(undefined);
									setNewValue(voorkeur?.waarde || "");
								}}
							>
								Annuleren
							</EditBoxButton>
						</div>
					)}
				</div>
			</div>
		</form>
	);
};
