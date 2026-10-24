# F5 — gecontroleerde uitbreiding: scope en eerste werkpakket

24 oktober 2026. Voorbereiding na het akkoord om F4 als bouw/DEV-oplevering af te sluiten en de oorspronkelijke richting te hervatten. Deze voorbereiding autoriseert geen live wijzigingen.

## Richting uit het oorspronkelijke traject

F5 omvat alleen benodigde aanvullende socialcapabilities, campagnebotfuncties, een Streamer.bot-bronkoppeling en voorbereid saldobeheer. De poort vereist per functie bewezen toegangsrechten, betrouwbaarheid, kosten en menselijke acceptatie. Automatisch verdienen blijft uit tot afzonderlijke acceptatie.

F6 omvat productiegang, websiteomschakeling en eventuele Metricool- of StreamElements-overname als afzonderlijke besluiten. Die worden niet naar F5 getrokken. De [F4-openingsvoorwaarden](../f4/Afronding-DEV-20261024.md) en open bewijsgrenzen uit eerdere fasen blijven bestaan.

## Eerste werkpakket: F5.0 — hergebruik en ontbrekende capabilities

Status: voorbereid; de gerichte code-inventaris en bouw zijn nog niet uitgevoerd in dit werkpakket. Eerste resultaat is één onderbouwde lijst van wat al bestaat, wat werkelijk ontbreekt en welke beperkte bouwstap eerst nodig is.

| Werkstroom | Te controleren bestaande basis | Afbakening van de eerste uitwerking |
| --- | --- | --- |
| Social en Twitch | F3-bronregistratie, meetvensters, officiële Twitch-ophaling en bestaande accountkoppeling | Ontbrekende gewenste gegevens en capabilities vaststellen; bestaande F3-functionaliteit hergebruiken. Twitch is de eerder gekozen eerste bron, geen toestemming voor alle platformen of nieuwe scopes. |
| Campagnebot | Bestaande bot-naar-CC-API, rechten en campagneobjecten | Eén concrete campagnehandeling voorstellen, met eigenaar, beperkte toegang en behandeling van dubbele of mislukte verzoeken. |
| Streamer.bot | Werkende lokale Speaker.bot/Streamer.bot-opstelling en beschikbare eventreferenties | Een broncontract voor stream-, clip- of engagementreferenties uitwerken; geen bereik- of impressiecijfers afleiden zonder bron. |
| Saldobeheer | Bestaand Bucks-saldo, transacties en uitgeschakelde rewards/intake | Ontbrekende beheerfuncties aanwijzen; bestaande saldi en historie behouden. Geen nieuw parallel saldo en geen verdienen activeren. |

Voor iedere capability legt de inventaris vast: bron/codeverwijzing, huidige dekking, ontbrekende bouw, benodigde gegevens en rechten, betrouwbaarheid en foutafhandeling, kosten of nog onbekende kosten, minimale bouwcontrole, latere menselijke acceptatie en eventuele afzonderlijke vrijgave.

## Oplevering en eerste beslispunt

1. Een gecontroleerde hergebruikinventaris met concrete bronnen uit de afzonderlijke repositories en bekende configuratie. Ontbrekende connector- of live toegang blijft als onbekend benoemd.
2. Een beperkte volgorde van bouwbare aanvullingen. Prioriteit wordt onderbouwd vanuit de ontbrekende capability; er wordt niet opnieuw gebouwd wat F3 al levert.
3. Eén eerste bouwpakket met acceptatiecriteria en de bijbehorende grenzen voor database, toegang, configuratie en serveruitrol.

Pas na die inventaris kan een concrete eerste bouwstap als uitvoeringsklaar worden aangemerkt. Deze voorbereiding is geen claim dat F5 al gebouwd is en vraagt de gebruiker nu geen nieuwe live handelingen.

## Blijvende grenzen

- CC, website en Discordbot behouden aparte repositories, credentials, branches, PR’s en uitrolpakketten. De bot gebruikt uitsluitend de beperkte CC-API.
- Geen nieuwe OAuth-scopes, externe berichten, accounttoegang, dataverzameling of Streamer.bot-livekoppeling zonder concrete vrijgave waar die nodig is.
- Geen automatische verdiensten, saldoherberekening, betalingen, productie-DNS of dienstovername in dit voorbereidingswerk.
- Gerichte noodzakelijke bouwchecks; uitgebreide hele-app-acceptatie blijft vóór productie. Niet-uitgevoerde proeven worden niet als geslaagd geregistreerd.
- De aanvullende [privacyuitvoering](../f4/Privacyvoorwaarden-en-aanvullende-uitvoering.md) blijft zichtbaar in de gedeelde planning en wordt niet ongemerkt een onbeperkte extra F4- of F5-bouwopdracht.
