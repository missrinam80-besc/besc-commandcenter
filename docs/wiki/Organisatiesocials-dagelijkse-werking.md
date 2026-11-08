# Organisatiesocials — dagelijkse werking en pakket 4

Dit pakket controleert de bestaande organisatiekoppelingen. De persoonlijke YouTube-creatorproef van pakket 3 blijft afzonderlijk en uitgeschakeld. Publicatie en inbox vallen onder latere pakketten.

## Alleen-lezen controle op 8 november 2026

Om 10:48 Europe/Brussels is Cloud DEV samen met BESCSRVDEV gecontroleerd, zonder providerverzoek, tokenlezing, handmatige synchronisatie, configuratiewijziging of vervalste storing. De onderstaande tijden zijn Europe/Brussels.

| Organisatieaccount | Laatste geplande succesvolle run | Waargenomen bewijs |
| --- | --- | --- |
| YouTube — Belgian Streamers | 7 november 12:15 | 11 metingen; één geplande geslaagde run sinds dagelijks inschakelen |
| Twitch — BelgianStreamersCommunity | 7 november 12:15 | 3 operationele metingen; één geplande geslaagde run sinds dagelijks inschakelen |
| Instagram — belgianstreamerscommunity | 7 november 18:30 | 5 metingen; zeven geplande geslaagde runs in het bekeken zevendaagse venster |
| Facebook — Belgian Streamers Community | 7 november 22:15 | 5 metingen; zeven geplande geslaagde runs in hetzelfde venster |

Alle vier staan verbonden, met automatische synchronisatie om de 1440 minuten. Geen van de vier was op dat moment over tijd of had een accountfout. Er stonden geen persoonlijke socialincidenten open. De timer stond ingeschakeld en actief, met een controle om de 15 minuten; de laatste service-uitvoering om 10:45 eindigde met status 0. Dit is een momentopname en geen garantie voor de volgende run of alle afzonderlijke providerrechten.

De interne limiet is bij alle vier 10.000 per UTC-dag met waarschuwingsgrens 80%. De opgeslagen laatste schattingen van 7 november waren respectievelijk 2, 5, 3 en 5. Dit zijn interne reserveringen per account, geen uitgelezen providerquota, geen kostenrapport en geen gedeelde Google-projectlimiet. Een teller met datum van gisteren is geen verbruik van vandaag. De workers beginnen bij een andere UTC-datum opnieuw te tellen.

Een verlopen opgeslagen access-token is op zichzelf geen bewijs dat opnieuw koppelen nodig is: de bestaande worker kan het token vernieuwen. Deze controle heeft geen token gelezen, vernieuwd of getest. Voor YouTube en Twitch bewijst de geslaagde geplande run dat de ingestelde keten op dat tijdstip werkte; het venster bevat nog maar één dagelijkse automatische run per kanaal.

## Lokaal gerepareerd; nog niet uitgerold

1. Twitch slikte alle fouten bij het lezen van de planning in. Alleen de [gedocumenteerde 404 zonder geplande uitzendingen](https://dev.twitch.tv/docs/api/schedule/) wordt nu als lege planning verwerkt. Een 401, 403, 429, serverfout, transportfout of onvolledig antwoord bereikt de foutopvolging; er worden dan geen succesvolle nulmetingen geschreven.
2. Twitch vernieuwde tokens na iedere mislukte validatie. Alleen een bevestigde 401 probeert nu tokenvernieuwing. Een tijdelijke storing of quotafout overschrijft geen token. Bevestigde succesvolle rotatie blijft opgeslagen en opnieuw gevalideerd.
3. YouTube verving ontbrekende kanaaltellers door nul. Alleen aangeleverde geldige tellers worden nu opgeslagen, met echte nulwaarden behouden. Ontbrekende tellers maken de run gedeeltelijk en laten een foutmelding achter. Ongeldige cijfers laten de run mislukken vóór snapshotopslag. Dit raakt de organisatiesync, niet de creatoradapter. Zie de [YouTube-kanaalvelden](https://developers.google.com/youtube/v3/docs/channels).

De nieuwe gedragstests gebruiken de daadwerkelijke adapters en workers met een nagebootste provider en databaseclient. Tien regressiegevallen falen tegen de ongewijzigde beginversie `ce4f4f5`; alle 31 gerichte gevallen slagen met de reparaties. Ze controleren ook quotaweigering vóór providercontact, een nieuwe UTC-dag, een mislukte reservering, dubbele runs, gedeeltelijke Meta-inzichten, behoud van oude actualiteit bij fouten en herstel bij een volgende geslaagde run. Dit is geen nieuwe PostgreSQL-raceproef voor de bestaande quotareservering.

## Opvolgen in Command Center

- **Integraties** toont accountstatus, laatste synchronisatie, automatische planning, interne quota en de laatste fout. **Logs** toont de laatste 50 synchronisatieruns. Beoordeel ook gedeeltelijke runs en lopende runs die niet afronden.
- **Socialrapportage** toont metingen met bron, ophaaltijd en meetperiode. Een recente kanaalsynchronisatie maakt een oudere periode niet actueel. YouTube heeft een bewust vertraagd Analytics-venster; Twitch levert een operationele momentopname, geen historische bereik- of followeranalyse. De Twitch-planning bevat maximaal de eerste 25 komende segmenten, geen totaal voor alle toekomstige herhalingen.
- Bestaande persoonlijke socialmeldingen onderscheiden mislukking, gedeeltelijk resultaat, verlopen koppeling en overschrijding van interval plus 30 minuten. Eén incident blijft één melding per ontvanger. Alleen opnieuw koppelen telt nog niet als herstel; daarvoor is een geslaagde actuele run nodig. Bestaande voorkeuren en bestuurs-/adminrechten blijven gelden.
- Bij een tijdelijke providerstoring of quotaweigering: lees de fout en laatste succesvolle meting. De bestaande planner kan later opnieuw controleren; een bestaande idempotentiesleutel binnen hetzelfde tijdvak kan een herhaling overslaan. Start niet herhaaldelijk handmatige runs om de limiet te omzeilen.
- Bij bevestigde verlopen toegang: laat een bevoegde beheerder het juiste organisatieaccount opnieuw koppelen. Controleer vervolgens een toegelaten of reguliere succesvolle run. Deel geen toegangstokens in logs of dossiers.
- Bij uitblijvende runs: controleer de bestaande timer, service-uitkomst en foutmeldingen. Een HTTP-time-out of een afgebroken proces bewijst niet dat de externe handeling is teruggedraaid. Markeer een oude lopende run niet zonder onderzoek als geslaagd.

## Grenzen van deze afronding

De gecontroleerde live basis blijft versie `5e67494`. PR #153 is afzonderlijk samengevoegd als `ce4f4f5` en de image is gebouwd; er is in deze stap niets uitgerold. De pakket-4-reparaties zijn lokaal voorbereid, zonder SQL-, dependency- of plannerwijziging. Review en afzonderlijk toegelaten uitrol blijven nodig voordat de reparaties live werken.

Er is geen echte storing of extra synchronisatie veroorzaakt om waarschuwingen te testen. Lokale bestaande database-/meldingsproeven controleren de fout-naar-herstelketen en rechten. De live inventaris is geen bewijs van bezorging tijdens een nieuwe echte storing. Niet-geregistreerde platformen worden niet als operationeel opgevoerd. De ingestelde bewaartermijn van 730 dagen is waargenomen; daadwerkelijke gegevensverwijdering, beheercontinuïteit en back-ups behoren tot de afzonderlijke beheer-/privacyafhandeling.

[← Integraties](Integraties.md)
