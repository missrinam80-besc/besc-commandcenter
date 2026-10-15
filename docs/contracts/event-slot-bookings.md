# Eventtijdslots en boekingen V1

Status: implementatie voor review; nog geen live mail-, Discord- of DEV-acceptatie.

## Functionele afspraken

- De huidige actieve eventeigenaar beheert crew- (`shift`) en streamer- (`stream`) slots, capaciteit en publicatie van de gedeelde inschrijfpagina.
- Iedereen met de link kan aanvragen. Publiek worden uitsluitend het event en open slots getoond, nooit boekers, e-mailadressen of contactgegevens van de eigenaar.
- Eén aanvraag is één persoon. Een onvolledig geverifieerde aanvraag houdt geen plaats vast. E-mailverificatie is 30 minuten geldig; na bevestigen tellen `pending` en `confirmed` beide mee voor de capaciteit.
- Aanvraag na verificatie -> agenda `draft` met zichtbaar label **Voorlopig**. De eigenaar beslist: bevestigd -> agenda `confirmed`; afgewezen/geannuleerd -> agenda `cancelled`, capaciteit vrij. De agenda bevat de boekersnaam; er wordt niet automatisch een communityprofiel aangemaakt.
- De eigenaar kan namens iemand boeken met naam en e-mailadres. Dit is expliciet een handmatige boeking door de eigenaar, geen bewijs dat die persoon zijn e-mail heeft geverifieerd. Ook deze boeking begint voorlopig en kan daarna bevestigd worden.
- De inschrijver krijgt een verificatiemail, daarna een ontvangstbericht en na de beslissing een bevestiging of afwijzing. Annuleren meldt ook het vrijgeven van de plaats. De eigenaar krijgt een CC-melding en ziet de aanvragen onder **Inschrijvingen -> Tijdslots en boekingen**.
- Geen automatische wachtlijst. De capaciteit kan niet onder bestaande voorlopige/bevestigde boekingen worden gezet. Met zulke boekingen zijn titel, type, locatie en tijd vergrendeld; sluit het slot en maak een nieuw slot voor een andere planning.
- Bestaande algemene inschrijvingen en eventrechten blijven behouden. Alleen de eigenaar beheert slotboekingen. Directe wijzigingen aan boekingsregels via de gewone agenda of gezamenlijke editor worden door de database geweigerd.

## Publieke stroom

`/inschrijven/{public_id}` is een afzonderlijke publieke pagina. Publicatie staat standaard uit. De link blijft gelijk bij sluiten/heropenen. Een gesloten, verwijderd, afgerond of geannuleerd event accepteert geen nieuwe aanvragen; een ontbrekende/inactieve eigenaar maakt de publieke pagina onbeschikbaar.

Server Actions valideren invoer en gebruiken server-side servicecredentials. Anonieme en normale ingelogde clients hebben geen EXECUTE op de publieke RPC en geen rechtstreekse schrijfrechten op slots/boekingen.

De willekeurige 256-bit verificatiecode staat alleen in de mail en in het fragment van de link (`#code=...`), niet in de server-URL. De browser neemt die over in geheugen, wist het fragment en verstuurt hem pas na een expliciete bevestigingsactie. Een GET/scanner reserveert niets. De database bewaart de SHA-256-hash. Verificatie is idempotent. Verlopen codes werken niet.

Rate limits: maximaal 5 nieuwe aanvragen per e-mail/event/uur, 20 per gehashte bron/uur en 500 per event/uur, plus een honeypot. Caddy moet `X-Forwarded-For` zelf betrouwbaar zetten/overschrijven; de laatste proxy-hop wordt met `CRON_SECRET` gehasht. Er worden geen ruwe IP-adressen opgeslagen. Deze limieten zijn geen CAPTCHA/DDoS-dienst. Bestaande actieve aanvragen worden niet opnieuw gemaild bij herhaald aanvragen.

## Berichten en configuratie

- E-mail gebruikt de bestaande gedelegeerde Gmail-koppeling (concept -> verzenden). Bestaande Google-instellingen blijven behouden. `NEXT_PUBLIC_SITE_URL` moet de HTTPS-CC-origin zijn; Host/Origin-headers bepalen de verificatielink niet.
- `CRON_SECRET` moet minimaal 32 tekens lang zijn. De bestaande Gmail- en Workspace-instellingen moeten geldig zijn.
- Roep via een beveiligde scheduler eenmaal per minuut **POST `/api/cron/event-slot-messages`** aan met `Authorization: Bearer <CRON_SECRET>`. Gebruik een beveiligde bestaande secretbron; zet de werkelijke sleutel niet in documentatie, chat of logs. De implementatie activeert geen scheduler en wijzigt geen serverconfiguratie.
- Acties starten de bijbehorende mail na het HTTP-antwoord met Next.js `after`, zodat bezoekers niet op Gmail hoeven te wachten; de duurzame databasewachtrij en scheduler behandelen uitval/herstel. Geen berichtinhoud of adressen in worker-antwoorden/logs.
- Per boeking worden eerdere nog actieve berichten eerst verwerkt. Concept-ID en lease worden vóór verzending opgeslagen. Na een onzekere verzending of verlopen dispatch volgt **geen blinde herhaling**. De eigenaar ziet de status. Mislukte acties vóór verzending kunnen opnieuw worden geprobeerd; `uncertain` vereist controle in Gmail/Discord vóór handmatig herstel.
- Mails hebben een gedeeld budget van 20 seconden per poging, inclusief database, tokenaanvraag en responsebodies; echte fetches krijgen hetzelfde AbortSignal. De databaselease is twee minuten.
- E-mail is het standaardkanaal. Discord wordt pas aangeboden wanneer `BESC_SLOT_DISCORD_NOTIFICATIONS_ENABLED=true` na botacceptatie is ingesteld. Die instelling of extra clientrechten worden niet automatisch aangezet.
- Voor DM kiest de aanvrager zijn gekoppelde account. De server verlangt een actueel Auth-account met bevestigd, overeenkomend e-mailadres én overeenkomstige Discord-identity/profielkoppeling. Geen los ingevuld Discord-ID. De bot-API controleert de actuele identity opnieuw vóór claim/dispatch. Bij ontkoppeling of gesloten DM volgt terugval naar e-mail.

## Discordbot-contract

Nieuwe beperkte scope: `slots:deliver`. Bestaande client-ID's/scopes, organisatie- en guildbinding, tickets, account- en eventrechten worden niet aangepast. De bot krijgt geen boekerslijst, mailadres, verificatiecode of mogelijkheid een willekeurige ontvanger/inhoud te kiezen.

Alle endpoints zijn POST, `Content-Type: application/json`, dezelfde bestaande Bearer-clientauthenticatie en een `guild_id` gelijk aan de clientconfiguratie. De organisatie komt uitsluitend uit het geauthenticeerde clientrecord. Eén serverbudget van vijf seconden annuleert Supabase/Auth en responsebodies. Invoer maximaal 8 KiB, uitleestijd maximaal drie seconden.

1. `/api/v1/bot/slot-messages/claim`: `{guild_id, worker_id}`. `worker_id`: 8..40 letters/cijfers/underscore/koppelteken. Antwoord `{delivery:null}` of `{delivery:{id,lease_token,lease_until,discord_user_id,subject,body,reference}}`. Gebruik `reference` als herkenbaar kenmerk in het DM-bericht en sluit mentions uit.
2. `/api/v1/bot/slot-messages/dispatch`: `{guild_id,worker_id,id,lease_token}`. Verplicht vlak vóór de externe Discordactie. Alleen na `{ok:true}` mag de bot sturen. Bij netwerkuitval tijdens dispatch: niet sturen/claimen alsof de uitkomst bekend is; laat de lease aflopen en onderzoek de wachtrijstatus.
3. `/api/v1/bot/slot-messages/sent`: dezelfde velden plus `message_id` (Discord snowflake). Pas na een bewezen succesvol DM-resultaat. Dezelfde ack is idempotent.
4. `/api/v1/bot/slot-messages/fail`: dezelfde velden plus `error_code`: `dm_closed` (uitsluitend bewezen Discord-weigering, terugval e-mail), `discord_unavailable` (vóór dispatch veilig opnieuw plannen; na dispatch onzeker), `outcome_unknown` (altijd onzeker).

De bot mag niet blind opnieuw sturen als een antwoord verloren gaat of een lease verloopt. Bewaar lokale delivery/Discord-resultaten zodat een `sent`-ack kan worden hervat. Een uncertain bericht wordt eerst aan de hand van het kenmerk/Discord-resultaat gecontroleerd. De CC-API vertrouwt de bevoegde worker voor de gerapporteerde externe verzenduitkomst; zij kan zelf niet bewijzen dat een DM is aangekomen.

De bestaande documentatie dat de command-API de bot vertrouwt om de echte commandactor door te geven blijft van toepassing. De nieuwe worker-API gebruikt geen meegegeven commandactor; de ontvanger komt uitsluitend uit een bestaande boeking met gecontroleerde koppeling.

## Uitrol en acceptatie

1. Review en merge van deze PR.
2. Migratie `20261014213254_event_slot_bookings.sql` op DEV; daarna CC-image deployen.
3. Bestaande mailconfiguratie en HTTPS-origin controleren, berichtenworker inplannen en een testmail end-to-end bewijzen.
4. Eventeigenaar kiezen, twee slots maken, capaciteit 1 en 2, inschrijfpagina publiceren.
5. Twee browsers met verschillende e-mails: e-mail verifiëren, laatste plaats gelijktijdig aanvragen, voorlopig in agenda, eigenaarmelding, bevestigen/afwijzen en ontvangen mails controleren. Ook namens een inschrijver boeken, capaciteit vrijgeven, pagina sluiten, verlopen/verkeerde code testen.
6. De botchat bouwt de runtime tegen dit contract en de fixtures. Voeg pas daarna expliciet de beperkte scope aan een gekozen botclient toe, controleer DM en e-mailfallback en zet de DM-keuze aan. Geen wijziging aan MEE6.

Privacy/retentie: deze PR introduceert geen automatische bewaartermijn voor slotboekingen. De bestaande tickettermijn geldt niet automatisch voor eventboekingen. Verificatielinks worden na verzending/verlopen uit de private berichtinhoud verwijderd; e-mailadressen zijn alleen voor de eigenaar en de serverworker beschikbaar. Boekersnamen zijn ook zichtbaar in de bestaande interne eventagenda. Een event kan pas via een afzonderlijk afgesproken opschoonbeleid worden gepurged.
