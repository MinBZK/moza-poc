# Tegen de draaiende keten

Deze tests laden de berichtenbox uit een draaiende demo-stack van het Federatief Berichtenstelsel en
voeren daar de echte scripts op uit. Geen fixture en geen dubbel: de berichten komen uit de
berichtenuitvraag, langs onze eigen nginx-config, door de ongewijzigde `berichtenbox-keten.js` en
`berichtenbox.js`.

Ze draaien **niet** mee in `npm test`. Zonder stack hebben ze geen betekenis, en met stack duren ze
tientallen seconden omdat er echte ophaalronden overheen gaan.

## De stack starten

De stack staat in [`moza-poc-fbs-berichtenbox`](https://github.com/MinBZK/moza-poc-fbs-berichtenbox).
Uit die map:

```sh
demo/podman-up.sh
```

Draait de podman-API-socket niet, dan start u die eerst en geeft u hem mee:

```sh
podman system service --time=0 unix:///tmp/podman-run-1000/podman/podman.sock &
DOCKER_HOST=unix:///tmp/podman-run-1000/podman/podman.sock demo/podman-up.sh
```

Daarna komt onze eigen build erin, in plaats van het gepubliceerde image:

```sh
npx @11ty/eleventy                       # in deze repo
PROEFTUIN_PAD=/pad/naar/moza-poc \
  docker-compose -f compose.yaml -f compose.podman.yaml -f compose.podman-hostnet.yaml \
                 -f proeftuin-lokaal.yaml --profile demo up -d proeftuin
```

`compose.proeftuin-lokaal.yaml` uit die repo werkt ook, maar beperkt `NGINX_ENVSUBST_FILTER` tot
`BACKEND_(ORIGIN|PROFIEL|API_2|KETEN|DEMO)`. Onze `container/default.conf.template` gebruikt
daarnaast `BACKEND_API`, `BACKEND_KETEN_HOST` en `BACKEND_DEMO_HOST`. Die blijven dan letterlijk in
de nginx-config staan, en nginx leest zo'n niet-gesubstitueerde `${...}` als een eigen,
ongeïnitialiseerde variabele — dus als leeg, waarna de terugval in de template vuurt. Gemeten: de
browser-host gaat dan als `Host` mee, precies zoals bedoeld, en `/api/` komt bij `BACKEND_ORIGIN`
uit. Het gaat dus niet stuk; wat je verliest is dat een gezette variabele stilzwijgend genegeerd
wordt. Gebruik daarom een overlay die alle `BACKEND_*` doorlaat, zoals de Containerfile hier ook
doet.

## Draaien

```sh
npm run test:keten
```

Standaard tegen `http://127.0.0.1:8080` (de proeftuin-container). Met `DEMO_BASIS=…` elders heen —
bijvoorbeeld `http://127.0.0.1:8097`, de demo-proxy die alles achter één origin zet.

## Twee dingen die eronder zitten

- **Eén ophaalronde per ontvanger.** De uitvraag houdt de ronde per ontvanger bij en antwoordt op
  een tweede ronde terecht met 409. Twee tests op dezelfde persona laten de tweede dus struikelen
  over de eerste. Vandaar één lading per scenario, elk met een eigen persona.
- **Opruimen tussen ladingen.** Gedelegeerde listeners hangen aan `document`, en een ophaalronde
  loopt door nadat de test klaar is. Zonder opruimen schrijft een vorige lading in het meldingsblok
  van de volgende pagina — wat zich voordoet als een storing die er niet is. In een browser is elke
  lading een vers document; hier niet. `laadLive` geeft daarom `ruimOp` terug.

## Wat het niet ziet

jsdom rendert niet en schildert niet. Opmaak, animatie, focusrand en het gedrag bij zoomen blijven
handwerk; zie `docs/berichtenbox-regressietests.md`.
