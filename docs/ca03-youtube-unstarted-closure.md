# CA03 — pakket 1: aanvragen zonder tokenwisseling afsluiten

Vervolg: [pakket 2 — eigen sessie en gebruikersbediening](ca03-youtube-session-ui.md) voegt standaard uitgeschakelde routes en de accountaansluiting toe. Onderstaande beschrijving bewaart de scope van pakket 1.

Dit pakket repareert lokaal de openstaande SQL-opruimstatus na weigering, annulering of verval vóór een autorisatiecode is gewisseld. De persoonlijke YouTube-flow blijft uit en ongemonteerd. De nieuwe SQL is uitsluitend voorbereid en in tijdelijke fixtures uitgevoerd; er is geen Cloud-migratie, serveruitrol, echte Google-aanroep of accountwijziging.

## Wat nu als afgesloten geldt

De lokale coördinator claimt een aanvraag atomair voordat een codewisseling kan starten. Als afsluiten de nog ongeclaimde `pending`-status wint, legt hij eerst versleuteld `exchangeNotStarted` vast. Dat lokale bewijs alleen was eerder onvoldoende: de database bleef een lege intrekkingsjob als `pending` bewaren.

De nieuwe databasekolom `private.cy_jobs.dispatch_state` maakt het tweede bewijs expliciet:

| Status | Betekenis voor afsluiting |
| --- | --- |
| `unknown` | Bestaande aanvraag van vóór deze schemawijziging; geen aanname dat er niets is uitgegeven. |
| `unstarted` | Nieuwe aanvraag waarvan nog geen autorisatiestatus aan een worker is afgegeven. |
| `started` | Een worker heeft de autorisatiejob opgehaald; een providerverzoek kan zijn gestart. |
| `closed` | De nooit gestarte autorisatiejob is definitief en idempotent gesloten. |

Een autorisatie-`read` markeert mogelijke dispatch onder dezelfde bestaande database-/rijvergrendeling als afsluiting. Dit geldt ook voor oudere kernels die gewoon de bestaande read-operatie gebruiken. Een sluitende transactie blokkeert latere reads/finish; wint een read eerst, dan is de nooit-gestart-uitzondering niet beschikbaar. De autorisatie-read wijzigt voortaan de dispatchstatus en moet via een schrijvende RPC-aanroep (POST) verlopen. Iedere toekomstige serverpoort moet zijn SQL-transactie **duurzaam bevestigen vóór** hij een job aan de providerkant beschikbaar stelt of afsluiting als bevestigd teruggeeft. Een open SQL-transactie over een providerverzoek heen is geen ondersteund adaptercontract.

`CreatorYouTubeKernel.closeUnstartedAuthorization` laat eerst de bestaande eigenaarpoort de actuele eigenaar/sessie controleren en de koppeling lokaal blokkeren. Daarna controleert de serverpoort jobsoort, link, generatie, dispatchstatus en afwezigheid van credentials. De afsluiting schrijft precies één afgeschermd bewijs in `private.cy_authorization_closures`, met job, link, werkelijke eigenaar, reden en tijdstip. De redenen zijn `denied`, `cancelled`, `expired` en `failed`. Ook na een lokale claim kan de database nog aantonen dat de job nooit is afgegeven, bijvoorbeeld als de SQL-aanroep vóór dispatch mislukt. Zonder dat databasebewijs blijft de bestaande intrekkings- en herstelketen gelden. Een herhaling met een andere reden verandert de historie niet.

De database sluit lege revocationjobs alleen als geen credential of andere onopgeloste autorisatie-/refreshjob meer bestaat. De koppeling krijgt dan `provider_revocation='none'`: er was geen Google-intrekking nodig. Er wordt geen `provider_revoked`-gebeurtenis verzonnen. Andere onzekere aanvragen houden de gezamenlijke opvolging open, ook als deze ene aanvraag al een afsluitbewijs heeft.

## Wat de gebruiker terugkrijgt

- Weigering of annulering vóór tokenwisseling: een bevestigde afsluiting zonder Google-intrekking.
- Een ongebruikte autorisatie die vervalt: expliciet `expired`, geen generieke geslaagde koppeling.
- Een ongebruikte refresh die vervalt: expliciet `expired`; het bestaande actieve grant blijft behouden en er wordt geen vernieuwing als voltooid gemeld.
- Mislukte SQL-afsluiting of verloren bevestiging: het browserticket en herstelbediening blijven beschikbaar. Lokaal bewijs alleen wist het ticket niet meer.
- Een al gestarte codewisseling, ontbrekend antwoord, aanwezige credential of oudere onduidelijke job: geen valse nooit-gestart-afsluiting, geen herhaling van de codewisseling.

Het scherm onderscheidt “geen Google-intrekking nodig” van een daadwerkelijk bevestigde providerintrekking. Het geeft een aanvraag pas vrij als de serveruitkomst dat bevestigt. De bestaande owner-/organisatie-/sessie-/browserbinding en sleutelring blijven gelden; de reparatie voegt geen bevoorrechte herstelomweg toe.

## Herstel en historische gegevens

Het lokale afsluitvoornemen wordt vóór de SQL-grens opgeslagen. Daardoor kan herstel na procesuitval dezelfde operatie herhalen. Het databasebewijs is op job-ID uniek en de oorspronkelijke reden blijft behouden. Een verloren SQL-bevestiging of lokale eindbevestiging veroorzaakt geen dubbele sluiting en geen providerverzoek.

De nieuwe kolom wordt voor bestaande jobs eerst `unknown`; alleen later aangemaakte jobs krijgen de default `unstarted`. De bestaande migratie blijft ongewijzigd. Oude jobs worden niet achteraf als veilig gesloten verklaard. Direct lezen van de nieuwe bewijstabel is voor anon, authenticated en service_role ingetrokken; de tabel heeft RLS. De bestaande smalle RPC-grenzen blijven bestaan.

Er komt geen cron, automatische sweep, gegevensverwijdering of stilzwijgende retentiehandeling. Een verloren browsernonce, sessie, sleutel of complete opslagmap krijgt geen automatische overname. De bestaande vijfminutenlease van een ongebruikte refreshjob blijft van toepassing; annulering daarvan trekt het actieve grant niet in. Productiesleutels, Google-projectisolatie, echte sessie-/RPC-adapters en live acceptatie horen bij de volgende pakketten.

## Lokale verificatie

De databaseproeven gebruiken het werkelijke schema en de werkelijke creatorfuncties met synthetische accounts. De provider en Vault zijn testdubbels. Onder meer weigering/annulering/verval, lege intrekkingsjobs, owner- en rolgrenzen, actieve credentials, onbekende oudere aanvragen, meerdere onopgeloste jobs, immutable redenen, mislukte bewijsopslag en verloren/mismatched bevestigingen worden uitgevoerd.

Vier deterministische afsluitraces controleren echte PostgreSQL-lockwachttijden: afsluiten vóór dispatch, dispatch vóór afsluiten, gelijktijdig herstel en teruggedraaide afsluiting. De vier bestaande consent/intrekkingsraces blijven behouden. De procesproeven beëindigen echte workers vóór lokale publicatie, vóór de SQL-grens, na een nagebootste SQL-commit, na lokale eindopslag en tijdens een geclaimde wisseling. Daarbij wordt echte lokale bestandsopslag en sleutelrotatie gebruikt. De SQL in die procesproef is een expliciete lokale ledger-double; de afzonderlijke PostgreSQL-proeven bewijzen de echte database-idempotentie. Dit bewijst procesherstel, geen garantie tegen stroomuitval of schijfrollback.

De gerichte `plpgsql_check`-analyse van de twee gewijzigde creatorfuncties heeft geen bevindingen. De algemene lokale SQL-scan meldt bestaande fouten in `private.confirm_newsletter_subscription` en `private.request_newsletter_subscription`, die verwijzen naar de ontbrekende `public.newsletter_subscription_requests`. Deze nieuwsbriefcode wordt in dit pakket niet gewijzigd; de algemene scan wordt niet als volledig groen voorgesteld. Er is geen live verificatie van die afzonderlijke bevindingen uitgevoerd.

De lokale release-inventaris bevat het nieuwe bestand `20261107212328_creator_youtube_unstarted_closure.sql`, met historische SQL-hashes behouden. Een latere afzonderlijk goedgekeurde toepassing zou Cloud-historie 151 naar 152 brengen; de bewust uitgesloten oude seed blijft uitgesloten. Alle toepassing vereist vooraf opnieuw gecontroleerde toestand en een atomair uitgevoerde migratie.

## Afgeronde controle op 7 november 2026

- Volledige lokale suite: **1.632 geslaagd, 0 mislukt**.
- Native PostgreSQL 17.11: **66 kerneltests** en **8 echte transactieraces** geslaagd.
- Volledige lege-schemaherbouw: **153 SQL-bestanden, 204 RLS-tabellen en 381 functies**; bestaande agentregressies geslaagd.
- Netwerkloze Linux-proeven: **124 geslaagd**, inclusief de vijf procesherstelproeven; dezelfde herstelproeven slagen op Windows.
- ESLint, TypeScript en de lokale webpack-build slagen. De standaard Turbopack-build kan in deze werkmap de gedeelde dependency-junction buiten zijn projectroot niet volgen. De webpack-build meldt ook 27 bestaande bestanden buiten de standalone-tracegrens. Dit is geen verificatie van een uitleverbare containerimage; er is geen image gebouwd of serveruitrol uitgevoerd.
- De twee gewijzigde SQL-functies hebben elk **0 analyzerbevindingen**. De twee hierboven genoemde bestaande nieuwsbriefbevindingen blijven afzonderlijk geregistreerd.

De tijdelijke databasecontainers zijn na verificatie gestopt en verwijderd. De nieuwe schemawijziging is alleen voorbereid en lokaal beproefd; Cloud DEV behoudt de eerder uitgerolde versie totdat hiervoor apart toestemming wordt gegeven. De volledige live creatoracceptatie blijft open.

## Bronnen voor de databasegrenzen

- [PostgreSQL 17: expliciete vergrendeling](https://www.postgresql.org/docs/17/explicit-locking.html).
- [Supabase: databasefuncties en rechten](https://supabase.com/docs/guides/database/functions).
