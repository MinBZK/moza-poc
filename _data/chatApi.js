/**
 * Backend-URL voor de Digitale Assistent, instelbaar per omgeving via de
 * build-omgevingsvariabele MOZA_CHAT_API. Deze waarde wordt in `base.njk` in
 * `window.MOZA_CHAT_API` gezet en door `assets/javascript/digitale-assistent.js`
 * gebruikt voor de chat-fetch.
 *
 *   (niet gezet)             -> ""  (same-origin: de nginx-proxy van de frontend)
 *   MOZA_CHAT_API=""         -> ""  (idem, expliciet)
 *   MOZA_CHAT_API=http://…   -> expliciete backend-URL (lokale dev zonder proxy)
 *
 * Productie draait achter de reverse proxy, dus same-origin ("") is de default.
 * Voor lokale dev zet `npm run dev` MOZA_CHAT_API=http://localhost:8000 (zie
 * package.json); de backend draai je dan los met ALLOWED_ORIGINS=http://localhost:8080.
 */
module.exports = function () {
	return process.env.MOZA_CHAT_API || "";
};
