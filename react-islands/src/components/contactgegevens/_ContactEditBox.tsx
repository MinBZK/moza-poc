"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";

import { useUpdateOndernemengContactvoorkeur, useVerifyEmail, useRequestVerificationCode } from "./hooks/updateOndernemingContactvoorkeur/useUpdateOndernemingContactVoorkeur";
import { components } from "../../network/profiel/generated";
import { Notification } from "../Notification";
import { InfoIcon } from "../icons/InfoIcon";
import { EditBoxButton } from "./_editBoxButton";
import { EditIcon } from "../icons/EditIcon";
import { CheckCircleIcon } from "../icons/CheckCirlceIcon";

const RESEND_COUNTDOWN_SECONDS = 10;

const contactSchemas = {
	Email: z.email("Voer een geldig e-mailadres in"),
	Telefoonnummer: z
		.string() // kan nog stricter met regex voor NL nummers
		.min(8, "Voer een geldig Nederlands telefoonnummer in")
		.max(18, "Voer een geldig Nederlands telefoonnummer in"),
	ApplicatieId: z.string(),
	// Adres: z.string(), // komt niet voor als veld
} as const satisfies Record<components["schemas"]["ContactType"], z.ZodTypeAny>;

export const ContactEditBox = ({ label, name, idenType, idenValue, contactGegeven }: { name: components["schemas"]["ContactType"]; label: string; idenType: components["schemas"]["IdentificatieType"]; idenValue: string; contactGegeven?: components["schemas"]["ContactgegevenResponse"] }) => {
	const [fieldState, setFieldState] = useState<"view" | "edit">("view");
	const [errorMessage, setErrorMessage] = useState<string | undefined>();
	const [verificationSubmitted, setVerificationSubmitted] = useState<boolean>(false);
	const [hasSubmitted, setHasSubmitted] = useState(false);
	const [resendCountdown, setResendCountdown] = useState(() => {
		if (typeof window === "undefined") return RESEND_COUNTDOWN_SECONDS;
		const stored = sessionStorage.getItem(`resend-end-time-${name}-${idenType}-${idenValue}`);
		if (!stored) return RESEND_COUNTDOWN_SECONDS;
		return Math.max(0, Math.ceil((parseInt(stored) - Date.now()) / 1000));
	});
	const [resendError, setResendError] = useState<string | undefined>();
	const [resendSuccess, setResendSuccess] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const { mutate: updateEmailMutate } = useUpdateOndernemengContactvoorkeur();
	const { mutate: emailVerifyMutate } = useVerifyEmail();
	const { mutate: requestVerificationCodeMutate } = useRequestVerificationCode();

	const [newValue, setNewValue] = useState(contactGegeven?.waarde || "");
	const [verificationCode, setVerificationCode] = useState("");

	const id = contactGegeven?.id;
	const isVerified = contactGegeven?.isGeverifieerd || false;
	const queryClient = useQueryClient();

	const showResendSection = name === "Email" && !isVerified && !!newValue && fieldState !== "edit";

	const storageKey = `resend-end-time-${name}-${idenType}-${idenValue}`;

	// Store end time the first time the resend section becomes visible
	useEffect(() => {
		if (!showResendSection) return;
		if (!sessionStorage.getItem(storageKey)) {
			sessionStorage.setItem(storageKey, (Date.now() + RESEND_COUNTDOWN_SECONDS * 1000).toString());
		}
	}, [showResendSection, storageKey]);

	useEffect(() => {
		if (!showResendSection || resendCountdown === 0) return;
		const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
		return () => clearTimeout(timer);
	}, [resendCountdown, showResendSection]);

	const handleResendVerification = () => {
		if (resendCountdown > 0) return;
		setResendError(undefined);
		setResendSuccess(false);
		const endTime = Date.now() + RESEND_COUNTDOWN_SECONDS * 1000;
		sessionStorage.setItem(storageKey, endTime.toString());
		setResendCountdown(RESEND_COUNTDOWN_SECONDS);
		requestVerificationCodeMutate(
			{
				body: {
					email: newValue,
					identificatieNummer: idenValue,
					identificatieType: idenType,
				},
			},
			{
				onSuccess: () => {
					setResendSuccess(true);
				},
				onError: (error: Error) => {
					const isServiceUnavailable = error.message === "SERVICE_UNAVAILABLE";
					setResendError(isServiceUnavailable ? "De verificatieservice is momenteel niet beschikbaar. Probeer het later opnieuw." : "Er is een fout opgetreden bij het aanvragen van de verificatiecode. Probeer het later opnieuw.");
				},
			}
		);
	};

	return (
		<form
			className="flex flex-col gap-3"
			noValidate
			onSubmit={(e) => {
				e.preventDefault();
				setHasSubmitted(true);

				if (fieldState === "edit") {
					if (newValue == null) return;

					// Validate email if the field type is Email
					const result = contactSchemas[name].safeParse(newValue);

					if (!result.success) {
						setErrorMessage(result.error.issues[0].message);
						inputRef.current?.focus();
						return;
					}

					// Clear any previous error messages
					setErrorMessage(undefined);
					updateEmailMutate(
						{
							identificatieNummer: idenValue,
							identificatieType: idenType,
							body: {
								identificatieNummer: idenValue,
								identificatieType: idenType,
								id,
								type: name,
								waarde: newValue,
							},
						},
						{
							onSuccess: () => {
								setFieldState("view");
								const newEndTime = Date.now() + RESEND_COUNTDOWN_SECONDS * 1000;
								sessionStorage.setItem(storageKey, newEndTime.toString());
								setResendCountdown(RESEND_COUNTDOWN_SECONDS);
								setResendError(undefined);
								setResendSuccess(false);
								queryClient.invalidateQueries({
									queryKey: ["profiel", idenType, idenValue],
								});
							},
							onError: (_error: Error) => {
								setErrorMessage("Er is een fout opgetreden bij het opslaan. Probeer het opnieuw.");
							},
						}
					);
				} else if (fieldState === "view") {
					emailVerifyMutate(
						{
							body: {
								identificatieNummer: idenValue,
								identificatieType: idenType,
								email: newValue,
								verificatieCode: verificationCode,
							},
						},
						{
							onSuccess: () => {
								setVerificationCode("");
								queryClient.invalidateQueries({
									queryKey: ["profiel", idenType, idenValue],
								});
							},
							onError: (_error: Error) => {
								setErrorMessage("De verificatiecode is onjuist. Probeer het opnieuw.");
							},
						}
					);
				}
			}}
		>
			{verificationSubmitted && isVerified && (
				<Notification variant="success" onClose={() => setVerificationSubmitted(false)}>
					{`Uw ${label.toLocaleLowerCase()} is succesvol geverifieerd.`}
				</Notification>
			)}
			<div className="contactgegeven-container">
				<label htmlFor={`field-${name}-${id}`}>{label}</label>
				<div>
					{fieldState === "edit" ? (
						<div className="contactgegeven-input-group">
							<input
								ref={inputRef}
								id={`field-${name}-${id}`}
								type={name === "Email" ? "email" : "text"}
								name={name}
								value={newValue}
								onChange={(e) => {
									setNewValue(e.target.value);

									// Only validate email in real-time if form has been submitted
									if (hasSubmitted) {
										const result = contactSchemas[name].safeParse(e.target.value);

										if (!result.success) {
											setErrorMessage(result.error.issues[0].message);
										} else {
											setErrorMessage(undefined);
										}
									}
								}}
							/>
							<div role="alert">
								{errorMessage && (
									<div className="contactgegeven-form-error-message">
										<InfoIcon />
										<span className="form-field-error">{errorMessage}</span>
									</div>
								)}
							</div>
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
								requestAnimationFrame(() => {
									inputRef.current?.focus();
								});
							}}
						>
							Aanpassen
						</EditBoxButton>
					) : (
						<div className="contactgegeven-save-actions">
							<EditBoxButton type="submit">Opslaan</EditBoxButton>
							<EditBoxButton
								type="button"
								onClick={() => {
									setFieldState("view");
									setHasSubmitted(false);
									setErrorMessage(undefined);
									// Fall back to the database-value on cancel
									setNewValue(contactGegeven?.waarde || "");
								}}
							>
								Annuleren
							</EditBoxButton>
						</div>
					)}
				</div>
				{showResendSection && (
					<>
						<div />
						<div className="contactgegeven-resend-section">
							<Notification variant="warning">{`Uw ${label.toLocaleLowerCase()} is nog niet geverifieerd. U ontvangt nog geen notificaties. Er is een verificatiecode gestuurd naar ${newValue}.\nBekijk uw Ongewenste e-mail wanneer u niets binnen heeft gekregen.`}</Notification>
							{resendSuccess && (
								<Notification variant="success" onClose={() => setResendSuccess(false)}>
									{`Er is een nieuwe verificatiecode verzonden naar ${newValue}.`}
								</Notification>
							)}
							{resendError && <Notification variant="error">{resendError}</Notification>}
							<button type="button" onClick={resendCountdown === 0 ? handleResendVerification : undefined} disabled={resendCountdown > 0} className={`self-center text-primary ml-auto text-right text-sm ${resendCountdown === 0 ? "cursor-pointer hover:underline" : "cursor-default"}`}>
								{resendCountdown > 0 ? `Opnieuw verificatiecode aanvragen in ${resendCountdown} seconden` : "Opnieuw verificatiecode aanvragen"}
							</button>
							<div />
							<div className="contactgegeven-verification-field-group ">
								<label htmlFor={`verificationCode-field-${name}-${id}`} className="font-bold">
									{"Verificatiecode:"}
								</label>
								<input ref={inputRef} id={`verificationCode-field-${name}-${id}`} className="w-1/4 border border-gray-300 bg-white px-1" placeholder="bv: 123456" maxLength={6} type="text" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} />
								<EditBoxButton icon={<CheckCircleIcon />} type="submit" onClick={() => setVerificationSubmitted(true)}>
									Verifieer
								</EditBoxButton>
							</div>
							<div />
						</div>
					</>
				)}
			</div>
		</form>
	);
};
