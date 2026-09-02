"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { components } from "../../network/profiel/generated";
import { EditBoxButton } from "./_editBoxButton";
import { useUpdateVoorkeur } from "./hooks/updateVoorkeur/useUpdateVoorkeur";
import { EditIcon } from "../icons/EditIcon";

export const AanhefEditBox = ({ idenType, idenValue, voorkeur }: { idenType: components["schemas"]["IdentificatieType"]; idenValue: string; voorkeur?: components["schemas"]["VoorkeurResponse"] }) => {
	const [fieldState, setFieldState] = useState<"view" | "edit">("view");
	const [errorMessage, setErrorMessage] = useState<string | undefined>();
	const inputRef = useRef<HTMLInputElement>(null);
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
						voorkeurType: "Aanhef",
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
				<label htmlFor="field-aanhef">Aanhef</label>
				<div>
					{fieldState === "edit" ? (
						<div className="contact-gegeven-input-group">
							<input ref={inputRef} className="" id="field-aanhef" type="text" placeholder="bv: Dhr. Jansen" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
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
								requestAnimationFrame(() => inputRef.current?.focus());
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
