/**
 * Backend-URL voor de Digitale Assistent, instelbaar per omgeving via de
 * build-omgevingsvariabele MOZA_CHAT_API. Deze waarde wordt in `base.njk` in
 * `window.MOZA_CHAT_API` gezet en door `assets/javascript/digitale-assistent.js`
 * gebruikt voor de chat-fetch.
 *
 *   (niet gezet)             -> http://localhost:8000  (lokale backend, dev)
 *   MOZA_CHAT_API=""         -> relatief, zelfde origin (reverse proxy)
 *   MOZA_CHAT_API=https://…  -> expliciete backend-URL (cross-origin + CORS)
 *
 * In de container-build is de default leeg (""), zie container/Containerfile.
 */
module.exports = function () {
	const value = process.env.MOZA_CHAT_API;
	return value === undefined ? "http://localhost:8000" : value;
};
