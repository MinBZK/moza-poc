/**
 * Testtokens per persona voor de Digitale Assistent, instelbaar per omgeving via
 * de build-omgevingsvariabele MOZA_TEST_USERS. De waarde is een JSON-object dat
 * een persona-id uit `personas.json` koppelt aan een token:
 *
 *   MOZA_TEST_USERS='{"koffiezaak": "<token>"}'
 *
 * Deze map wordt in `base.njk` in `window.MOZA_TEST_USERS` gezet;
 * `assets/javascript/digitale-assistent.js` stuurt het token van de actieve
 * persona mee als `X-Test-User`-header. De backend mapt dat token server-side
 * naar een KvK-nummer (env TEST_USERS daar) en bepaalt zo de bedrijfsidentiteit.
 *
 * Het token is een credential: het hoort NIET in deze publieke repo, alleen in
 * de omgeving van de build. Niet gezet (of onleesbaar) = leeg object; de
 * assistent antwoordt dan met "log eerst in" in plaats van bedrijfsgegevens.
 */
module.exports = function () {
	var raw = process.env.MOZA_TEST_USERS;
	if (!raw) return {};
	try {
		var map = JSON.parse(raw);
		return map && typeof map === "object" ? map : {};
	} catch (e) {
		console.warn("[testUsers] MOZA_TEST_USERS is geen geldige JSON; genegeerd.");
		return {};
	}
};
