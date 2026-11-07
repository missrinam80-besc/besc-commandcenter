# CA03 — lokale opvang van tokenvernieuwing

Deze stap breidt het versleutelde ontvangstlog uit naar persoonlijke YouTube-tokenvernieuwing. Er zijn alleen synthetische antwoorden en testsleutels gebruikt. De koppeling blijft standaard uitgeschakeld; er zijn geen HTTP-routes, planners, nieuwe bevoegdheden, serverinstellingen of SQL-migraties toegevoegd.

## Voorbereiden, uitvoeren en bevestigen

De eigenaargebonden coördinator heeft twee expliciete serverhandelingen: `beginRefresh(link)` reserveert een bestaande SQL-refreshjob en legt een versleutelde actie plus een reservering per link vast; `refresh(jobId, browserNonce)` voert precies die actie uit. Voor de nieuwe veilige route zijn zowel de sleutelring als het ontvangstlog verplicht. De browserrespons bevat alleen aanvraag-ID en browsernonce, geen token, PKCE-verifier of aanmeldlink.

De kern leest het bestaande refresh-token uitsluitend via de serverpoort. Als het providerantwoord het vervangende refresh-token weglaat, wordt het bestaande token vóór ontvangstregistratie toegevoegd aan de interne, versleutelde antwoordvorm. Een daadwerkelijk meegegeven vervanger wordt behouden. Een ongeldig of leeg vervangend veld wordt niet stilzwijgend als geldige rotatie behandeld. Daarna gelden dezelfde kanaal-, scope-, sessie-, generatie- en vervalcontroles als voorheen. De [Google-documentatie over offline toegang](https://developers.google.com/identity/protocols/oauth2/web-server#offline) blijft de bron voor de toekomstige echte adapter.

De reservering, het providerantwoord, de SQL-update, de ontvangstbevestiging en de afgeronde actie worden afzonderlijk bevestigd. Alleen na bevestigde afronding wordt de linkreservering vrijgegeven voor een volgende vernieuwing. Een verloren vrijgavebevestiging start geen nieuw providerverzoek en trekt een al bevestigde vernieuwing niet alsnog in. Expliciet herstel kan die vrijgave controleren zonder een inmiddels nieuwe actie vrij te geven.

## Geen onzekere herhaling

Een duurzame linkreservering voorkomt dat dezelfde eigenaar na een procesuitval simpelweg een nieuwe refreshjob start terwijl de vorige uitkomst nog onbekend is. Die reservering vervalt niet automatisch door het verstrijken van de vijfminutenlease. De ontvangstbewijzen hebben een afzonderlijke, geauthenticeerde refreshnaamruimte; een aanmeldantwoord kan niet voor vernieuwing worden gebruikt.

| Situatie | Afhandeling |
| --- | --- |
| Voorbereid, maar nog nooit gestart | Annuleren of expliciet afhandelen na verval laat de bestaande koppeling en tokens intact. De ongebruikte SQL-reservering blijft nog tot haar gewone leaseverval blokkeren. |
| Provideroproep gestart, geen duurzaam antwoord | Uitkomst blijft onbekend; geen automatisch nieuw verzoek en geen vervanging van de actie. |
| Antwoord vastgelegd, bevestiging of commit verloren | Herstel gebruikt het antwoord uitsluitend voor intrekking/opruiming; het wordt niet alsnog actief opgeslagen. |
| Intrekking terwijl een antwoord onderweg is | De koppeling blijft ingetrokken. Het late antwoord wordt alleen versleuteld voor opruiming bewaard. |
| SQL-update en ontvangstbewijs bevestigd, alleen vrijgavebevestiging verloren | Herstel bevestigt de voltooide actie en controleert de eigen linkreservering; geen herhaalde tokenvernieuwing. |
| Verkeerde eigenaar, sessie, browser, jobsoort, kanaal of scopes | Geen actieve credential-update; alleen de toegestane opruimketen kan nog lopen. |

Een nooit gestarte voorbereiding is herkenbaar aan de nog niet geclaimde, duurzame actiestatus. Annulering en het starten concurreren atomair om die status. Zodra starten heeft gewonnen, wordt de uitkomst niet meer als ongebruikt beschouwd. Annuleren van een gestarte of onzekere actie kan de gekozen persoonlijke koppeling lokaal intrekken om onzekere credentials te blokkeren; deze betekenis moet later duidelijk in de gebruikersinterface worden weergegeven.

De volledige uitkomst komt van de coördinator, niet uitsluitend van de oude SQL-intrekkingsstatus. Het opruimen van het oude bekende token bewijst immers niet dat een mogelijk nieuw uitgegeven maar verloren token ook is afgehandeld. Het ontvangstlog houdt zo'n onbekende uitkomst daarom open en de linkreservering blijft vaststaan.

## Grenzen en toekomstige inrichting

Dit is een lokale uitbreiding van de bestaande servermodules. De algemene kernelmethode `refresh(link)` blijft als compatibele hulpfunctie bestaan; toekomstige persoonlijke HTTP-acties moeten de nieuwe beschermde coördinatorroute gebruiken om het ontvangstlog en de linkreservering af te dwingen. Er is geen live route of automatische selectie toegevoegd. Bestaande organisatiebrede social-synchronisaties zijn niet gewijzigd of gestart.

Een crash tussen SQL-reservering, lokale vastlegging en het teruggeven van de browsernonce kan een voorbereide actie achterlaten die niet vanzelf kan worden overgenomen. Er is geen bevoorrechte herstelomweg toegevoegd voor verloren nonce of sessie. Dit blijft een punt voor een afzonderlijk ontworpen, beperkte beheerprocedure. Onderbreking vóór de eerste duurzame antwoordopslag blijft bovendien een onbekende externe grant; er wordt geen token verzonnen of providerverzoek herhaald om die onzekerheid te verbergen.

De provider en Vault blijven testdubbels. Productiebron/backup van de hoofdsleutel, echte Google-projectisolatie, providerreconciliatie, juiste interpretatie van al ingetrokken tokens, HTTP-/cookiebeveiliging, retentie en vernietiging blijven open. De [sleutelgrenzen](ca03-youtube-local-keyring.md), [opslaggrenzen](ca03-youtube-local-recovery.md) en [antwoordgrenzen](ca03-youtube-provider-inbox.md) blijven gelden. De proeven bewijzen procesherstel, geen garantie bij stroomuitval, schijfrollback of verlies van de sleutel of complete opslagmap.

Er zijn geen echte sleutels gelezen, tokens vernieuwd of grants ingetrokken. Geen migratie, uitrol of publicatie uitgevoerd.

## Controle

`node --test tests/creator-youtube-refresh-inbox.test.mts tests/creator-youtube-kernel.test.mts tests/creator-youtube-provider-inbox.test.mts tests/creator-youtube-keyring.test.mts tests/creator-youtube-durable.test.mts tests/creator-youtube-oauth-attempt.test.mts`

De proeven omvatten echte procesbeëindiging, twee concurrerende workers, sleutelrotatie, verloren opslag-/SQL-bevestigingen, behoud van een niet vervangen refresh-token, onderscheid tussen ongebruikte en gestarte voorbereidingen en late antwoorden na intrekking. Alleen eigen tijdelijke synthetische testmappen worden verwijderd.

Gecontroleerd op 7 november 2026: 144 gerichte tests en alle 1.557 tests van de volledige suite slagen. De 21 refresh-, 24 ontvangstlog-, 21 sleutelring- en 14 opslagtests slagen zowel op Windows als in een netwerkloze Linux-container (80 per platform). Daarnaast slagen 45 kerneltests op geïsoleerde PostgreSQL 17.11 en vier echte transactieraces. TypeScript, lint en de lokale productie-bouw slagen. De bouw meldt de bestaande 27 dependency-tracingwaarschuwingen door de gedeelde `node_modules`-junction; dit is geen bewijs van een zelfstandig uitrolbare image. Tijdelijke testcontainers zijn gestopt en verwijderd.
