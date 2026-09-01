import React from "react";

export const EditBoxButton = ({ className, onClick, children, type = "button", icon }: { className?: string; onClick?: () => void; children: React.ReactNode; type?: "button" | "submit" | "reset"; icon?: React.ReactNode }) => {
	return (
		<button type={type} onClick={onClick} className={`link-button ${className ?? ""}`}>
			{icon}
			{children}
		</button>
	);
};
