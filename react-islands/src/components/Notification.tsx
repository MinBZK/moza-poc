"use client";

import { ReactNode, useState } from "react";
import { InfoIcon } from "./icons/InfoIcon";
import { CloseIcon } from "./icons/CloseIcon";

export const Notification = ({ children, variant = "info", onClose }: { children?: ReactNode; variant?: "info" | "warning" | "error" | "success"; onClose?: () => void }) => {
	const [isVisible, setIsVisible] = useState(true);

	const handleClose = () => {
		setIsVisible(false);
		onClose?.();
	};

	return isVisible ? (
		<div className={`feedback feedback-${variant}`} role="alert">
			<div className="mt-0.5 flex flex-row items-start gap-3">
				<InfoIcon />
			</div>
			<div className="flex flex-col gap-4 whitespace-pre-line">{children}</div>
			<button onClick={handleClose} className="btn-close link-button">
				<i>Sluit notificatie</i>
			</button>
		</div>
	) : null;
};
