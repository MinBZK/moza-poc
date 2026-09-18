#!/usr/bin/env node

// Lokale server voor "Inloggen met NL Wallet". Serveert de gebouwde site uit _site en,
// op hetzelfde adres, twee endpoints die met de verification_server van NL Wallet praten.
// Zelfde origin als in productie achter nginx, dus de pagina gebruikt relatieve paden.
// Alleen bedoeld voor lokale ontwikkeling; zie server/nl-wallet/README.md.
const fs = require("fs");
const path = require("path");
const express = require("express");
const { maakConfig, startSessie, haalStatusOp, haalGegevensOp, inlogUitGegevens } = require("./nl-wallet/verifier");

const PORT = process.env.NL_WALLET_PORT || 8095;
const config = maakConfig(process.env);

const app = express();
app.use(express.json({ limit: "1kb" }));

app.use((req, res, next) => {
	if (req.path.startsWith("/api/")) console.log(`[nl-wallet] ${req.method} ${req.path}`);
	next();
});

// Het sessietoken van de lopende inlog, in een cookie van deze browser. Zo kan de pagina de sessie
// volgen zonder dat de knop van NL Wallet het token hoeft te melden; dat doet die pas bij sluiten.
const SESSIE_COOKIE = "nl-wallet-sessie";

function sessieUitCookie(req) {
	const gevonden = (req.headers.cookie || "")
		.split(";")
		.map((deel) => deel.trim().split("="))
		.find(([naam]) => naam === SESSIE_COOKIE);
	return gevonden ? decodeURIComponent(gevonden[1] || "") : null;
}

function zetSessieCookie(req, res, token) {
	const delen = [`${SESSIE_COOKIE}=${token ? encodeURIComponent(token) : ""}`, "Path=/api/nl-wallet", "HttpOnly", "SameSite=Strict"];
	if (!token) delen.push("Max-Age=0");
	if (req.secure) delen.push("Secure");
	res.setHeader("Set-Cookie", delen.join("; "));
}

// Aangeroepen door <nl-wallet-button start-url="/api/nl-wallet/sessies">.
app.post("/api/nl-wallet/sessies", async (req, res) => {
	if (req.body && req.body.usecase && req.body.usecase !== config.usecase) {
		return res.status(400).json({ fout: "Onbekende usecase" });
	}
	try {
		const sessie = await startSessie(config, fetch);
		zetSessieCookie(req, res, sessie.session_token);
		res.json(sessie);
	} catch (e) {
		console.error("[nl-wallet]", e.message);
		res.status(502).json({ fout: "De NL Wallet-koppeling is niet bereikbaar" });
	}
});

// Na een geslaagde sessie: naam en bevoegdheid gaan terug naar de browser, verder niets.
app.get("/api/nl-wallet/sessies/:token/gegevens", async (req, res) => {
	try {
		const gedeeld = await haalGegevensOp(config, req.params.token, req.query.nonce, fetch);
		const inlog = inlogUitGegevens(gedeeld);
		if (!inlog) return res.status(422).json({ fout: "Geen naam ontvangen uit de NL Wallet" });
		res.json(inlog);
	} catch (e) {
		console.error("[nl-wallet]", e.message);
		res.status(502).json({ fout: "De gegevens uit de NL Wallet zijn niet op te halen" });
	}
});

// De pagina volgt hiermee de lopende inlog. Is die gelukt, dan komen naam en bevoegdheid meteen mee
// en vervalt het cookie. Bij een sessie op dezelfde telefoon lukt ophalen zonder nonce niet; die
// loopt via de terugkeerpagina, dus dan alleen de status.
app.get("/api/nl-wallet/sessie", async (req, res) => {
	const token = sessieUitCookie(req);
	if (!token) return res.json({ status: "GEEN" });
	try {
		const status = await haalStatusOp(config, token, fetch);
		if (status === "DONE") {
			const inlog = inlogUitGegevens(await haalGegevensOp(config, token, null, fetch).catch(() => null));
			if (inlog) zetSessieCookie(req, res, null);
			return res.json(inlog ? { status, gegevens: inlog } : { status });
		}
		if (["FAILED", "CANCELLED", "EXPIRED"].includes(status)) zetSessieCookie(req, res, null);
		res.json({ status });
	} catch (e) {
		console.error("[nl-wallet]", e.message);
		res.status(502).json({ fout: "De status van de NL Wallet-sessie is niet op te halen" });
	}
});

// Instellingen van deze omgeving: per onderneming de links om de bevoegdheid in de wallet te zetten,
// en waar de app te downloaden is. Lokaal geschreven door server/nl-wallet/lokaal-inrichten.sh; elders
// via NL_WALLET_CONFIG (pad naar een JSON-bestand in hetzelfde formaat).
const CONFIG_PAD = process.env.NL_WALLET_CONFIG || path.join(__dirname, "nl-wallet", "lokaal.json");

function leesOmgeving() {
	try {
		return JSON.parse(fs.readFileSync(CONFIG_PAD, "utf8"));
	} catch (e) {
		return {};
	}
}

app.get("/api/nl-wallet/config", (req, res) => {
	const omgeving = leesOmgeving();
	const bevoegdheden = Array.isArray(omgeving.bevoegdheden) ? omgeving.bevoegdheden : [];
	res.json({
		bevoegdheden: bevoegdheden.map(({ id, handelsnaam, kvkNummer, same_device_ul, cross_device_ul }) => ({ id, handelsnaam, kvkNummer, same_device_ul, cross_device_ul })),
		app: { beschikbaar: Boolean(process.env.NL_WALLET_APP_URL || (omgeving.app && omgeving.app.apk)) },
	});
});

// De app NL Wallet MOZa (Android). Online een vaste URL; lokaal de APK uit de NL Wallet-build.
app.get("/downloads/nl-wallet-moza.apk", (req, res) => {
	if (process.env.NL_WALLET_APP_URL) return res.redirect(process.env.NL_WALLET_APP_URL);
	const apk = leesOmgeving().app && leesOmgeving().app.apk;
	if (!apk || !fs.existsSync(apk)) return res.status(404).send("NL Wallet MOZa is in deze omgeving niet te downloaden.");
	res.download(apk, "nl-wallet-moza.apk");
});

app.use(express.static(path.join(__dirname, "..", "_site"), { extensions: ["html"] }));

app.listen(PORT, () => {
	console.log(`[nl-wallet] MOZa op http://localhost:${PORT}/inloggen/nl-wallet/`);
	console.log(`[nl-wallet] verification_server intern ${config.intern}, publiek ${config.publiek}, usecase ${config.usecase}`);
});
