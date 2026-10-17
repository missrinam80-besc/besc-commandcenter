# Ticketing V1 — definitief CC-endpointcontract voor de botchat

> V1-protocolbasis. Voor de huidige schema-2-uitbreiding en uitgevoerde DEV-acceptatie zie [Discordtickets](../Discordtickets-en-botbeheer.md) en [huidige DEV-status](../Huidige-DEV-status.md). Voorbereidingsuitspraken hieronder over niet-uitgevoerde migratie, scheduler of botbouw zijn historische oplevercontext.

Contractversie: `besc-ticketing-v1`. Basis: main `0c3cbbbdd648d9c3067efca16aad70251216f0b9`.
Deze implementatie is een reviewwijziging, geen actieve DEV-ticketmodule. Bestaande botleesroutes blijven compatibel.
Bijbehorende machineleesbare voorbeelden: `docs/contracts/ticketing-v1.fixtures.json`.

## Toegang en configuratie

Iedereen op de gebonden testserver mag intake doen, ook zonder CC-account. Er wordt uitsluitend een Discordaanvrager-ID geregistreerd; intake maakt geen profiel of membership en geeft geen account-, event- of staffrechten. De bestaande account/events-routes blijven actuele Auth-Discordidentity, actief organisatielidmaatschap en gedeelde eventrechten controleren.

De API vertrouwt de geauthenticeerde bot voor de echte commandactor en gecontroleerde serverdeelname. Een botkey is geen ondertekende Discordinteraction. De bot haalt actor/guild uitsluitend uit echte interactions/events en controleert live guildlidmaatschap, kanaaltype en kanaalrechten vóór intake. De API controleert de configuratiebinding, niet zelfstandig Discordlidmaatschap.

Botclientconfiguratie gebruikt dezelfde `BESC_BOT_CLIENTS_JSON`, keyhash, constante-tijdvergelijking, vervaldatum en intrekking. Nieuwe, afzonderlijk goed te keuren ticket-scopes:

- `tickets:create`: intake.
- `tickets:own:read`: alleen eigen ticket binnen org/guild/client, laatste 50 externe berichten; geen interne notities, behandelaars of auditdata.
- `tickets:ingest`: geregistreerde aanvragerberichten uit de vaste thread importeren.
- `tickets:deliver`: door CC geautoriseerde Discordopdrachten claimen/bevestigen.

Bij elke client met een ticket-scope is `ticketParentChannelId` verplicht: de vaste snowflake van het gewone `GUILD_TEXT`-intakekanaal. Zonder dit veld weigert de configuratieparser de clientlijst. Bestaande leesclients hebben dit veld niet nodig. Deze branch verandert geen live clientconfiguratie of scopes. Het echte intakekanaal-ID en de aangewezen staffaccounts moeten vóór DEV-acceptatie worden bevestigd.

De identiteitroute geeft `readOnly: true` voor bestaande leesclients; een client met ticket-scopes krijgt `readOnly: false`. Staffrechten worden nooit door botscopes verleend.

Gebruik HTTPS en `Authorization: Bearer <botkey>`. POST vereist `Content-Type: application/json`. Geen organisatie/client-ID in requestbodies; die komen uitsluitend uit de geauthenticeerde clientconfiguratie. Onbekende velden en dubbele GET-queryparameters worden geweigerd. Alle antwoorden zijn `no-store`.

## Endpoints

Base: `/api/v1/bot/`. IDs zijn UUIDs, Discord-IDs zijn strings van 17–20 cijfers. Een worker-ID bevat 8–64 letters, cijfers, `_` of `-` en identificeert één workerinstantie. De claimlease geldt 60 seconden.

| Methode en pad | Scope | Request | Succes |
| --- | --- | --- | --- |
| POST `tickets` | `tickets:create` | `guild_id`, `discord_user_id`, `parent_channel_id`, `subject` (1–160 tekens), `content` (1–4000). Header `Idempotency-Key`: formulierinteraction-ID. | 201: `ticketId`, `status`, `linkStatus`, `threadId` (aanvankelijk null). Replay geeft dezelfde 201/body. |
| GET `tickets/{ticketId}` | `tickets:own:read` | Query `guild_id`, `discord_user_id`. | 200: `ticketId`, `status`, `linkStatus`, `threadId`, `messages` met `id`, `direction`, `content`, `createdAt`; alleen extern, laatste 50 in chronologische volgorde. |
| POST `tickets/{ticketId}/messages` | `tickets:ingest` | `guild_id`, `discord_user_id`, `parent_channel_id`, `thread_id`, `source_message_id`, `content`. Header `Idempotency-Key` moet gelijk zijn aan `source_message_id`. | 200: `messageId`, `ticketId`; duurzame replay geeft dezelfde body. |
| POST `ticket-deliveries/claim` | `tickets:deliver` | `guild_id`, `worker_id`. | 200: `deliveries`, maximaal 5; uitsluitend eerste onvoltooide opdracht per ticket. |
| POST `ticket-deliveries/{deliveryId}/complete` | `tickets:deliver` | `guild_id`, `worker_id`, `lease_token`, resultaatvelden hieronder. | 200: `recorded: true`. |
| POST `ticket-deliveries/{deliveryId}/fail` | `tickets:deliver` | `guild_id`, `worker_id`, `lease_token`, `error_code`, `uncertain` (boolean). | 200: `recorded: true`. |

Requests zijn maximaal 16 KiB, ook bij chunked upload. Een vastlopende body wordt na 3 seconden geannuleerd. Eén serverbudget van 5 seconden geldt voor de gehele route, met daadwerkelijke annulering van Supabasefetches en responsebodies. Na een timeout kan een transactie toch al gecommit zijn: intake/import wordt daarom met dezelfde idempotencykey herhaald, nooit met een nieuwe key.

Limieten: 120 requests/minuut/client in proces én duurzaam in PostgreSQL, 30 requests/minuut/aanvrager/client duurzaam in PostgreSQL. De bestaande leesroutes behouden hun eigen limiet. Ratebucketwrites en effects behoren tot dezelfde transactie; een PostgreSQL-fout kan de teller terugrollen. Dit is een toepassingslimiet, geen vervanging voor netwerkbescherming.

## Discordopdrachten

Elk claimitem bevat `id`, `ticketId` (null bij opgeschoonde tickets), `kind`, `payload`, `guildId`, `parentChannelId`, `threadId`, `ticketStatus`, `ticketMarker`, `leaseToken`, `leasedUntil`, `reconcile`, `nonce`, `allowedMentions: { parse: [] }`.

| Kind | Payload | Complete-resultaat |
| --- | --- | --- |
| `create_thread` | `marker`: `besc-ticket-{UUID}`, `requester_discord_id` | `thread_id`, `parent_channel_id`, `requester_discord_id`, `requester_added: true`, `invitable: false`. Alleen na bevestigde privéthread en toegang van de aanvrager. |
| `send_message` | `message_id`: CC-berichtUUID, `content` | `thread_id`, `message_id`: echte Discordmessage-ID. Gebruik de claimnonce als stabiele nonce met `enforce_nonce` waar ondersteund en zet `allowed_mentions.parse=[]`. |
| `close_thread` | `{}` | `thread_id`, nadat thread vergrendeld én gearchiveerd is. |
| `delete_thread` | `{}` | `thread_id`, na verwijdering. Bij ontbrekende opgeslagen threadmapping moet `ticketMarker` in actieve én gearchiveerde privéthreads van het juiste parentkanaal gezocht worden. |

De bot moet uitsluitend een privéthread aanmaken, neutrale marker als naam gebruiken, `invitable=false` zetten en de aanvrager toevoegen. De openingsboodschap is een afzonderlijke, geordende opdracht en wordt pas vrijgegeven na bevestigde toegang. De threadlink wordt privé aan de aanvrager gemeld via het eigen-ticketendpoint. Onderwerp en inhoud komen niet in het openbare parentkanaal of de threadnaam.

Bij `ticketStatus: closed` mag een `create_thread`-opdracht **geen nieuwe thread maken**. Eerst bestaande marker/mapping controleren. Bij bewezen afwezigheid mag `thread_absent: true` worden bevestigd zonder `thread_id`; de server slaat dan de ongepubliceerde openingsboodschap over. Een daaropvolgende `close_thread` zonder mapping kan eveneens met bewezen `thread_absent: true` worden bevestigd. Hiermee kan ook een mislukt gekoppeld ticket worden gesloten en opgeschoond.

Een `delete_thread` die al afwezig blijkt mag worden bevestigd met `thread_absent: true`. Geef bij een bekende mapping de verwachte `thread_id` mee; bij marker-only cleanup ontbreekt dit veld. De worker moet alle markerresultaten controleren voordat hij afwezigheid bevestigt. De API vertrouwt het botresultaat; zij gebruikt geen Discordtoken om het zelf te bewijzen.

Leases horen bij worker + token + org/client/guild. Verlopen of verouderde bevestigingen geven 409. Het claimen van een verlopen lease zet de opdracht naar `uncertain` en retourneert `reconcile: true`. Controleer dan actieve én gearchiveerde threads, opgeslagen mapping, exacte parentmarker en aanvrager. Bij meerdere markers: incident, geen nieuwe thread. Bij onzekere berichten: eerst geschiedenis met nonce/resultaat controleren. Discordnonce-deduplicatie is tijdsgebonden; bij onbewezen oude uitkomst niet blind opnieuw versturen.

Maximaal 8 pogingen per herstelcyclus; begrensde exponential backoff tot 3600 seconden. `uncertain` betekent steeds controleren vóór uitvoering, ook na handmatig herstel. CC toont `pending`, `leased`, `delivered`, `failed`, `uncertain`. Het herstelknopje reset de pogingsteller en vraagt reconciliation; het autoriseert geen blinde herverzending. Na succesvolle complete wordt payload gewist. Een herhaalde complete na een verloren HTTP-antwoord kan `lease_conflict` geven; maak daardoor geen nieuw Discordeffect. De oorspronkelijke gecommitte opdracht wordt niet opnieuw geclaimd.

Toegestane foutcodes: `discord_unavailable`, `permission_denied`, `thread_missing`, `unexpected_participants`, `duplicate_marker`, `outcome_unknown`. Geen credentials, foutstack, volledige Discordresponse of ticketinhoud doorgeven.

Bij gesloten tickets blijven reeds geautoriseerde antwoorden vóór sluiten in de queuevolgorde staan. Nieuwe antwoorden en aanvragerberichten worden geweigerd. Autoarchivering door Discord verandert de ticketstatus niet. Ontbrekende thread/ongewenste deelnemers worden gemeld via een veilige failure; de bot mag alleen aanvragerberichten importeren, nooit bot-, webhook- of andere deelnemersberichten.

## Staff en privacy

`manageTickets` is gedeeld tussen navigatie, pagina, serveracties en databasebeleid. Admin/bestuur standaard; een actieve medewerker kan deze capability via een geldige maatwerkrol in dezelfde organisatie krijgen. Crew en vrijwilligers hebben zonder die capability geen tickettoegang. Toewijzing geeft geen rechten; iedere actie en kandidatenlijst controleert actuele membership en maatwerkrol opnieuw. De toegewezen medewerker moet op het moment van toewijzen ticketrechten hebben.

Staff behandelt via `/app/tickets` en `/app/tickets/{id}` met CC-sessie. Elke mutatie bevat de getoonde ticketversie; een parallelle wijziging geeft `version_conflict`. Het interne formulier schrijft uitsluitend een interne notitie; alleen `Versturen naar Discord` maakt bericht én verzendopdracht atomisch aan. React rendert inhoud als tekst, zonder HTML-uitvoering.

Geen ticketgegevens worden toegevoegd aan algemene zoekresultaten, dossiers, exports of activiteitfeeds. Alle zes nieuwe tabellen hebben RLS; anon heeft geen toegang. Staff heeft alleen organisatiegebonden SELECT op ticket/bericht/audit/delivery, geen directe schrijfrechten. Idempotency en ratebuckets zijn uitsluitend servertoegankelijk. Privileged stafffuncties staan in `private`, controleren `auth.uid()` en actuele rechten en hebben een vaste lege search_path en expliciete grants. Bot- en bewaarfunties zijn uitsluitend service_role-RPCs.

Ondersteunde statussen: `open`, `in_progress`, `waiting_requester`, `closed`. Een nieuw aanvragerbericht maakt `waiting_requester` opnieuw `in_progress`. Sluiten is definitief; een nieuwe vraag krijgt een nieuw ticket. Gesloten tickets nemen geen nieuwe gespreksberichten aan; reconciliation van bestaande opdrachten blijft mogelijk.

## Bewaartaken en installatiegrenzen

Migration: `20261011130951_ticketing_v1.sql`, gemaakt met Supabase CLI 2.110.0 (`migration new ticketing_v1`). Alleen lokaal getoetst tijdens voorbereiding; Cloud blijft ongewijzigd.

`purge_support_tickets()` is een service-only maintenance-RPC, batches van maximaal 100. Een afzonderlijk goed te keuren scheduler moet dit regelmatig uitvoeren. Er wordt **geen scheduler of externe automation** door deze migration geactiveerd. Closed_at bepaalt de deadline van 180 dagen, onafhankelijk van failed/uncertain delivery. Een nog actieve lease stelt één ticket maximaal de resterende leaseperiode (60 seconden) uit; de bewaartaak moet vervolgens opnieuw lopen.

Bij purge verdwijnen ticket, transcript, interne notities en persoonsgebonden auditgegevens. Idempotencyantwoorden/hash/actor worden gewist en een inhoudloze tombstone blijft maximaal 30 dagen vanaf aanvraag bestaan; nieuwe ticketintake weigert interactions ouder dan 24 uur. Incomplete idempotencyrecords en ratebuckets worden na één dag opgeruimd. De minimale Discorddelete-opdracht bewaart alleen org/client/guild/parent/thread/marker-IDs en technische herstelstatus, nooit transcript of aanvrager. Herstel staat op het ticketoverzicht; na bevestigde verwijdering wordt die opdracht bij de volgende purge verwijderd.

Nog vóór live gebruik: het feitelijke Cloud-backupschema en herstelprocedure documenteren. De migration verwijdert geen bestaande backups en bewijst geen directe verwijdering daaruit. Bijlagen/CDN-links worden niet geïmporteerd; de bot meldt dit expliciet, registreert nooit een lege transcriptie als geslaagde import en vereist `GuildMessages` + `MessageContent` intent voor berichten.

Botclients met lopende ticketopdrachten moeten beschikbaar blijven tot hun queue inclusief bewaartaken is afgehandeld. Deze V1 ondersteunt geen automatische overdracht van tickets/opdrachten tussen verschillende client-IDs. Rotatie van een toekomstige ticketclient behoudt bij voorkeur zijn ID; eventuele overdracht vereist een apart gecontroleerd beheerpad. De eerdere leesclientrotatie raakt deze nog niet actieve module niet.

Foutantwoord: `{ "error": { "code": "...", "requestId": "..." } }` (routebrede upstream/configuratietimeout kan alleen `code` bevatten). Belangrijkste codes: 401 `invalid_client`; 403 `insufficient_scope`, `guild_not_allowed`, `channel_not_allowed`, `thread_not_allowed`; 404 `ticket_unavailable`, `delivery_unavailable`; 409 `idempotency_conflict`, `source_conflict`, `lease_conflict`, `thread_conflict`, `ticket_closed`; 410 `interaction_expired`/`ticket_expired`; 413 `body_too_large`; 415 `json_required`; 429 `rate_limited`; 503 `upstream_unavailable`. Onbekende technische fouten lekken geen details.

## Overdracht aan botchat

Implementeer de botworker en intake in eigen branch tegen dit contract en de JSON-fixtures; niet tegen alleen het eerdere voorstel. Geen MEE6-aanpassing. Bot blijft op zijn aparte DEV-server. Privéthreadrechten, `invitable=false`, moderatorzichtbaarheid (`ManageThreads`), MessageContent-intent, echte Discordgeschiedenisreconciliation, noncegedrag, crash vóór/na Discordeffect, beide clientkeys en 180-dagenverwijdering moeten nog live worden geaccepteerd. Lokale SQL/API/UI-tests bewijzen die Discordeffecten niet.
