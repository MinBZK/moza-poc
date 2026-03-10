import { MoxIcon, MoxMoleculeIconLink } from "mox-nlds/react";

export const FooterExternalLink = (props: React.ComponentProps<typeof MoxMoleculeIconLink>) => {
	return <MoxMoleculeIconLink startIconSlot={<MoxIcon flex="1 0 auto" icon="BoxArrowUpRight" />} {...props} />;
};
