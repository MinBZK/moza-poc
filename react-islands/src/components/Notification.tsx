"use client";

import { ReactNode, useState } from "react";
import { InfoIcon } from "./icons/InfoIcon";
import { CloseIcon } from "./icons/CloseIcon";

// const NotificationTV = tv({
// 	base: "p-3 shadow-md",
// 	variants: {
// 		variant: {
// 			information: "bg-blue-100",
// 			warning: "bg-orange-200",
// 			error: "bg-red-200",
// 			success: "bg-green-200",
// 		},
// 	},
// 	defaultVariants: {
// 		variant: "information",
// 	},
// });

export const Notification = ({ children, variant = "info", onClose }: { children?: ReactNode; variant?: "info" | "warning" | "error" | "success"; onClose?: () => void }) => {
	const [isVisible, setIsVisible] = useState(true);

	const handleClose = () => {
		setIsVisible(false);
		onClose?.();
	};

	return isVisible ? (
		<div className={`feedback feedback-${variant}`} role="alert">
			<div className="relative grid grid-cols-[auto_1fr_auto] items-start gap-2">
				<div className="mt-0.5 flex flex-row items-start gap-3">
					<InfoIcon />
				</div>
				<div className="flex flex-col gap-4 whitespace-pre-line">{children}</div>
				<button onClick={handleClose} className="mt-0.5 text-gray-500 hover:text-gray-700" aria-label="Close notification">
					{variant != "error" && <CloseIcon />}
				</button>
			</div>
		</div>
	) : null;
};
