# CA03 — lokale gebruikersflow en Google-adapter

Vervolg: [pakket 1 — definitieve lokale afsluiting](ca03-youtube-unstarted-closure.md) repareert de hieronder beschreven lege SQL-opruimtaak in een nieuw, nog niet live toegepast migratiebestand. Dit document bewaart de grenzen van de eerdere PR #150.

Deze stap verbindt een herbruikbaar toestemmingsscherm en een lokale HTTP-grens met de bestaande eigenaargebonden kernel, sleutelring en versleutelde ontvangstlog. De Google-adapter gebruikt de vorm van de officiële endpoints, maar alle uitvoeringstests gebruiken een geïnjecteerd nagebootst transport. Er is geen globale `fetch`, omgevingsconfiguratie of bestaande organisatiecredential aangesloten.

## Gebruikersflow

`CreatorYouTubeConnect` toont het gekozen kanaal, de geselecteerde video’s, het doel, meetvenster, toestemmingsverval en bewaartermijn. De checkbox staat aanvankelijk uit. De waarden komen van de aanroepende toepassing; deze wijziging bepaalt geen echte termijnen, ontvangers of campagnes. Persoonlijke toegang, campagnedeling en publicatie blijven afzonderlijk.

`CreatorYouTubeUserFlow` levert **ongemonteerde** handlers voor een toekomstige `/api/creator-youtube` en `/auth/creator-youtube/callback`. Er is geen Next-routebestand toegevoegd. Het scherm wordt evenmin automatisch op een bestaande accountpagina getoond. De toepassingslaag moet later een actuele eigen-koppeling-read, echte sessiecontrole, eigenaar-RPC en server-RPC aansluiten. De meegegeven authenticatiecontrole en eigenaarpoort moeten dezelfde daadwerkelijke sessie gebruiken. Een adminrol of callback-querystring bewijst geen persoonlijke toestemming of actieve koppeling.

1. Een expliciete POST met toestemming maakt via de bestaande eigenaarpoort een consent aan. De coördinator reserveert de autorisatie met state, S256-verifier en browserbinding.
2. De browser ontvangt alleen de Google-toestemmings-URL, link-ID en een `__Host-`-cookie met aanvraag-ID/browsernonce. De cookie gebruikt Secure, HttpOnly, SameSite=Lax en Path=/; geen providercredential. De nonce hoeft niet ondertekend te worden: de coördinator verifieert de willekeurige nonce tegen de versleutelde aanvraag plus eigenaar/organisatie/sessie/state. Een gewijzigde cookie verleent geen toegang.
3. Google-terugkeer gebruikt uitsluitend de cookie-aanvraag, niet een job-ID uit query of formulier. Dubbele state/code/error, code plus error, verkeerde browser/sessie/state en herhaalde callbacks worden geweigerd. Providerfouttekst wordt niet weergegeven of opgeslagen.
4. De callback eindigt altijd op een vaste account-URL met een beperkte statuscode; code, state en providerantwoord komen daar niet in terecht. Het scherm mag pas na een geautoriseerde read als gekoppeld worden weergegeven.
5. Vernieuwen bestaat uit twee POST-antwoorden: eerst voorbereiden en de cookie aan de browser geven, pas daarna het providerverzoek. Bij onzekerheid blijft het ticket beschikbaar voor annulering/herstel; geen automatische herhaling.
6. Een open cookie-aanvraag blokkeert een tweede start, gewone collectie of gewone ontkoppeling in die browser. Eerst annuleren/herstellen voorkomt dat een kale SQL-intrekkingsstatus een onzekere ontvangstlog verbergt. Intrekken via die aanvraag kan de persoonlijke koppeling lokaal blokkeren; het scherm vermeldt dit.
7. Zonder open aanvraag kan de eigenaar metingen ophalen of intrekken. Lokale blokkering en bevestiging bij Google zijn aparte uitkomsten; een onbevestigde Google-intrekking blijft zichtbaar en opnieuw controleerbaar.

Weigering, annulering of verval vóór codewisseling krijgt een apart duurzaam bewijs: een succesvolle CAS van de nog niet geclaimde `pending`-status sluit een gelijktijdige start uit. Dat bewijs wordt vóór lokale intrekking opgeslagen. Ook na een verloren intrekkingsbevestiging kan herstel daardoor vaststellen dat er geen nieuw providerantwoord nodig is. Zodra een worker `running` heeft geclaimd, geldt deze uitzondering niet en blijft een ontbrekend antwoord onzeker. Oudere workers die het nieuwe optionele bewijsveld niet kennen, wijzen de aanvraag af; voor latere activering moet één compatibele workerversie worden gebruikt.

Het bestaande SQL-schema kan voor zo’n nooit gestarte autorisatie desondanks een lege revocationjob met `pending` bewaren. Deze wijziging verandert dat schema niet en meldt daarvoor geen providerbevestiging. Het expliciete `exchangeNotStarted`-bewijs mag alleen het browserticket vrijgeven: er kan geen codewisseling meer starten. De serverstatus blijft open en zichtbaar als afzonderlijke opvolging; definitieve SQL-afhandeling van deze lege job moet vóór live acceptatie worden ontworpen. Er wordt geen fictieve succesvolle Google-intrekking of auditgebeurtenis geschreven.

Mutaties vereisen exacte same-origin POST, Origin, JSON en passende Sec-Fetch-Site; geen CORS-toelating. Invoer is begrensd op 8 KiB. Antwoorden gebruiken no-store, no-referrer en generieke fouten. De callback mag een cross-site GET van Google ontvangen en wordt beveiligd door de opgeslagen state en browser-/sessiebinding. De aanvraag vervalt na vijf minuten; de herstelcookie blijft maximaal 24 uur. Verlies of verstrijken van die cookie is geen toestemming voor overname of automatische tokenherhaling.

## Google-provider

De adapter staat standaard uit, vereist een expliciet transport en een afzonderlijk bevestigde projectisolatie. De boolean is een aansluitvoorwaarde, **geen bewijs** dat een echt Google-project geïsoleerd is. Er wordt geen bestaand organisatieproject of gedeelde OAuth-client geselecteerd.

- Toestemmings-URL: vaste Google-host, twee bestaande readonly-scopes, offline toegang, expliciete consent, geen incrementele scopes, S256 en exacte redirect-URI. Geen clientgeheim in de URL.
- Codewisseling en vernieuwing: vaste tokenendpoint, credentials/verifier uitsluitend in POST-body, geen redirects of retries, geen cookies. Deadline omvat zowel transport als het uitlezen van de response; maximaal 64 KiB. Ruwe fouttekst wordt niet doorgegeven.
- Het begrensde tokenantwoord keert eerst terug naar de versleutelde ontvangstlog. Pas **na bevestigde opslag** volgt `validate` met `channels.list(mine=true)`; uitsluitend precies het gekozen kanaal wordt geaccepteerd. Geen of meerdere kanalen of paginering blijven onbevestigd. De voorlopige `channel_id` in het vastgelegde tokenantwoord is leeg en is geen eigendomsbewijs.
- De kernel roept deze aanvullende validatie na vastlegging aan en controleert daarna opnieuw isolatie en de bestaande eigenaar/sessie/generatie/consentgrenzen. De nieuwe adapter markeert ontvangstregistratie verplicht; de oude ongejournalde compatibiliteitsmethoden kunnen daarmee geen code wisselen of token vernieuwen.
- Ontbrekende scopes bij de eerste codewisseling worden geweigerd. Alleen bij een refresh mag een weggelaten scopeveld de vaste, eerder gevalideerde scopes behouden. Een ontbrekend vervangend refresh-token behoudt via de bestaande kernel het vorige token vóór ontvangstregistratie. Afwijkende scopes, token-type of levensduur worden niet actief; begrensde ontvangen credentials blijven waar mogelijk beschikbaar voor opruiming.
- Collectie vraagt uitsluitend het gekozen kanaal, de maximaal 25 geselecteerde video’s en het gekozen meetvenster op. Weergaven, kijktijd in minuten en gemiddelde kijkduur worden gecontroleerd op kolomdefinitie, video, dubbele rijen en geldige niet-negatieve getallen. Een echte nul blijft nul; ontbrekende rijen/waarden blijven missing. Een ontvangen rapport bewijst niet dat Google voor het hele gevraagde venster al volledige data heeft; volledigheids-/dekkingsacceptatie blijft open.
- Intrekking gebruikt een vaste POST-endpoint met token in de body. Alleen HTTP 200 bevestigt providerverwerking. HTTP 400 (ook invalid token), 204, fout of timeout wordt niet als bevestigde intrekking voorgesteld. Er is geen automatische retry-loop.

## Bewijs en grenzen

De nieuwe tests voeren de handlers, adapter, kernel, echte lokale bestandsopslag, sleutelring en ontvangstlog samen uit met synthetische providerantwoorden. De HTTP-grens gebruikt een nagebootste eigenaar-/serverpoort; afzonderlijke kerneltests toetsen de verificatievolgorde ook tegen het bestaande SQL-schema. Vault blijft in die databaseproef een testdubbel.

Onderbreking vóór de eerste duurzame ontvangst blijft onbekend. De nieuwe proef onderbreekt transport en kanaalcontrole en heropent de opslag voor herstel; bestaande procesbeëindigingsproeven blijven regressies. Dit is geen bewijs voor stroomuitval, schijfrollback, Google-livegedrag, echte browser/cookieacceptatie of productie-Vault. Authenticatie-/RPC-adapters, productiesleutelbron en herstelkopie, Google-projectisolatie, providerreconciliatie, retentie/vernietiging, metrics-readscherm en live acceptatie blijven open. Het getoonde toestemmingsverloop is geen automatische bewaar-/verwijdertaak.

Geen nieuwe SQL-migratie, live wijziging, Google-aanroep, nieuwe synchronisatie, publicatie of uitrol. De bestaande organisatie-YouTube-/Twitch-sync en website blijven ongewijzigd.

## Bronnen

Geraadpleegd op 7 november 2026:

- [Google server OAuth: toestemming, offline toegang, tokenvernieuwing en projectbrede intrekking](https://developers.google.com/identity/protocols/oauth2/web-server).
- [Google OAuth-best practices: opgeslagen state vóór antwoordverwerking vergelijken](https://developers.google.com/identity/protocols/oauth2/resources/best-practices).
- [YouTube channels.list en mine-filter](https://developers.google.com/youtube/data/reference/rest/v3/channels/list).
- [YouTube Analytics reports.query: scopes, selectie, metrics en datavertraging](https://developers.google.com/youtube/analytics/reference/reports/query).

Deze bronnen onderbouwen de adaptercontracten; de testresultaten bewijzen alleen de lokale implementatie tegen nagebootste antwoorden.

## Lokale verificatie — 7 november 2026

- Alle 1.608 tests van de volledige suite slagen; de gerichte YouTube-suite telt 195 geslaagde proeven.
- De nieuwe schermtests omvatten negen echte React/DOM-interacties: expliciete toestemming, dubbele klik, veilige navigatie, tweestapsvernieuwing, foutafhandeling en het zichtbaar houden van onbevestigde opruiming.
- De 17 adaptertests en 19 HTTP-/ketentests slagen op Windows en in een netwerkloze, alleen-lezen Linux-container (36). Alle providerantwoorden zijn nagebootst. De gewone ketenfixture gebruikt tien seconden voor de netwerkdeadline; losse tests toetsen onderbreking en timeout met een korte deadline.
- De 51 kerneltests slagen tevens op een lege lokale PostgreSQL 17.11-fixture; vier bestaande echte transactieraces slagen. Er is geen Cloud-database benaderd.
- TypeScript, lint en lokale productie-bouw slagen. De bestaande waarschuwing over 27 dependencies buiten de tracingroot van de gedeelde `node_modules`-junction blijft aanwezig; deze lokale bouw is geen zelfstandig imagebewijs.
- Tijdelijke databases en Linux-containers zijn gestopt/verwijderd. Er zijn geen nieuwe migratiebestanden of wijzigingen onder `supabase/`.
