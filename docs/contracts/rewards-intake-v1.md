# Centrale verdien-API — duurzame ontvangst V1

18 oktober 2026. Voorbereid in draft-PR #109, geen Cloud-migratie of activering uitgevoerd. Dit register neemt beperkte bronclaims duurzaam in ontvangst en controleert de actuele accountbinding. Het bevat geen puntenverwerker.

## Scheiding van ontvangst, bewijs en beloning

CC blijft eigenaar van de gegevens en het saldo. De bestaande Discordbot, website en Streamer.bot krijgen geen directe databasetoegang. De bestaande Discord-/Bucks-API blijft ongewijzigd. Streamer.bot en de centrale bronadapter zijn nog niet aangesloten.

De [preview](rewards-integration-preview-v1.md) valideert uitsluitend synthetische invoer zonder opslag. De nieuwe intake heeft een eigen namespace, serverflag, clientregister, tokens en scopes. Intake weigert `simulation: true`. Een bronclaim met `simulation: false` is echter **geen zelfstandig Twitchbewijs**: elk ontvangstbewijs meldt `providerProofVerified: false`. Er is nog geen provideradapter die echte Twitchbewijzen controleert.

Een ingeschakelde intake kent nooit XP/Bucks toe, wijzigt geen reservering en roept de bestaande reward-boekingsfunctie niet aan. `held` is een vastgelegde technisch geaccepteerde bronclaim onder een puntenstop, geen opdracht voor latere automatische uitbetaling. Deze onbewezen claims mogen bij een toekomstige activering niet stilzwijgend worden uitbetaald.

## Routes en authenticatie

Namespace: `/api/v1/integrations/rewards/intake`.

| Route | Scope | Functie |
| --- | --- | --- |
| `POST /activities` | `rewards:intake:write` | Nieuwe bronclaim vastleggen of dezelfde claim herhalen. |
| `GET /receipts/{eventKey}` | `rewards:receipts:read` | Alleen ontvangstbewijs van de eigen organisatie/broadcaster opvragen. |

Geen lijst van leden of ontvangstbewijzen, geen saldo-, beheer-, import-, toeken- of verwijderroute. Queryparameters en andere methoden worden geweigerd.

```dotenv
BESC_REWARDS_INTAKE_ENABLED=false
BESC_REWARDS_INTAKE_REGISTRY_JSON=
```

Exact `true` maakt intake bereikbaar; standaard 404 zonder register- of databaselezing. Dit staat los van `BESC_REWARDS_ACTIVITY_ENABLED` en de previewflag. Er is geen echte bron of credential aangemaakt.

Het server-only register heeft dezelfde beperkte bronvorm als de preview: maximaal 32 unieke bronnen, organisatie-UUID, `platform: "twitch"`, numerieke broadcaster-ID, toegestane `twitch.follow`/`twitch.cheer` en intrekking. Het clientregister heeft maximaal 32 clients met `id`, `sourceId`, SHA256-`keyHash`, unieke intake-/receiptscopes, UTC-vervaldatum met milliseconden en boolean `revoked`. Onbekende velden, ongeldige verwijzingen en dubbele IDs/hashes/bronbindingen worden geweigerd. Configuratie maximaal 64 KiB.

Intaketoken: `bri_<client-id>.<43 base64url-tekens>`, met een later afzonderlijk te genereren cryptografisch willekeurige secret van 32 bytes. De hash betreft het volledige token. Preview- en Discordtokens/scopes werken hier niet. Beide scopes geven uitsluitend recht op de eigen technische bron. Alleen vertrouwde serverbronnen mogen deze credentials krijgen; ontvangst kan het al dan niet voldoen aan de accountcontrole zichtbaar maken, nooit namen, interne account-IDs of saldi. Secrets blijven buiten Git, uitvoer en browserconfiguratie.

Intrekken/verlopen van een client of intrekken van de bron blokkeert ook reads en retries. Een client-/bronrecord-ID roteren verandert de zakelijke bronbinding (organisatie + platform + broadcaster) niet en maakt geen nieuw ontvangstbewijs.

## Invoer en eerste ontvangst

De envelop heeft dezelfde begrensde follow-/cheervelden als de preview, met uitsluitend **`simulation: false`**. Geen vrije bedragen, interne user-ID, organisatie, regeltarief of clientgekozen idempotencysleutel.

- `schemaVersion: 1`; `event_id` is een stabiele oorspronkelijke provider-bericht-UUID, geen nieuwe UUID per retry.
- `broadcaster_id` moet overeenkomen met de serverconfiguratie; `twitch_user_id` is een numerieke onveranderlijke ID-string. Geen username-/e-mailmatch.
- `kind` is `twitch.follow` met lege `facts`, of `twitch.cheer` met geheel `bits` 1–1.000.000 en `is_anonymous: false`.
- `occurred_at` is strikte UTC met milliseconden. Een nieuwe claim mag bij databaseverwerking maximaal 120 seconden oud of 5 seconden toekomstig zijn. Dit is een conservatieve technische intakegrens; een ander herstelvenster vraagt later een expliciet contract.
- Andere activiteitsoorten, lees-/likeclaims, abonnementen/gifts/resubs, raids en tips blijven niet ondersteund.

De API controleert velden en bronbinding; de database controleert opnieuw de envelopevorm en bepaalt de tijd met haar eigen klok. Bestaande identieke ontvangst wordt vóór de ouderdomscontrole herkend: een timeout of offline retry maakt een al opgeslagen claim niet verloren. Een nog nooit ontvangen verlopen claim wordt geweigerd en niet opgeslagen.

## Actuele accountcontrole

CC zoekt gericht in de native Auth-identiteiten op `provider='twitch'` en `provider_id`; geen volledige Auth-userlijst of tweede profielkopie. Precies één identiteit moet aan de voorwaarden voldoen:

- De Twitch-ID in de aanwezige Auth-`identity_data.sub`/`provider_id` is een string die overeenkomt met de onveranderlijke provider-ID. Ontbrekende of tegenstrijdige Twitchdata wordt geweigerd.
- Auth-account bestaat, is niet verwijderd of geblokkeerd en heeft een bestaand CC-profiel.
- Actief lid in de servergekozen organisatie, met rol admin, board, member of volunteer.
- Het profiel heeft een geldige actuele Discord-ID met een overeenkomende native Discord-identiteit. Tegenstrijdige aanwezige Discordproviderdata wordt geweigerd.

De lookup gebruikt geen wijzigbare `user_metadata`. Dit bewijst een actuele accountkoppeling in Auth, geen voortdurende providerconsent of juistheid van een door de bron opgegeven cheer/follow. De bronadapter en providerautorisatie moeten nog afzonderlijk worden gebouwd.

Bij geldige eerste controle: `decision: "held"`, `reason: "earning_disabled"`, interne historische accountbinding. Anders: `decision: "rejected"`, `reason: "account_ineligible"`, geen interne accountbinding. Ook die afwijzing wordt duurzaam vastgelegd. Een latere koppeling, nieuw lidmaatschap of verplaatsing naar een ander account herschrijft dit niet en geeft geen recht op historische punten.

Bij iedere receipt-read en identieke retry wordt de actuele accountcontrole opnieuw uitgevoerd. `accountCheckPassed` is alleen waar wanneer dezelfde oorspronkelijke rekening nog aan alle voorwaarden voldoet. Verwijderde/overgedragen identiteit, ban of veranderd lidmaatschap maakt dit onwaar. De oorspronkelijke ontvangstuitkomst blijft behouden; een technisch receipt geeft nooit zelfstandig financiële bevoegdheid. De lookup is volatile zodat een tijdens een lock-wachttijd gecommitteerde wijziging in een volgende interne query wordt gezien. Dit is geen toekomstige financiële autorisatietransactie; die moet controle en boeking later atomair uitvoeren.

## Duurzaamheid en herhaling

Private tabel `private.reward_intake_receipts`, geen lees-/schrijfrechten voor browserrollen of directe tablerechten voor service_role. Alleen de smalle RPC kan in de tabel schrijven. RLS staat aan zonder publieke policies. De public RPC is security invoker en uitsluitend uitvoerbaar door service_role; private helpers met lege search_path lezen gericht Auth-data onder ownerrechten. De service-rolecontrole, execute-grants en schema-afscherming houden deze machinefunctie buiten browsergebruik. De beheercredential blijft uitsluitend op CC.

Eén providerbericht heeft één ontvangstbewijs binnen organisatie/broadcaster. De unieke sleutel is SHA256 over PostgreSQLs canonieke JSONB-tekst van:

```text
[1,"intake","twitch",organisatie-UUID,broadcaster-ID,lowercase-providerbericht-UUID]
```

Actor, activiteitsoort, source-record-ID, API-client en regelrevisie zitten niet in deze sleutel. Een ander account of andere eventsoort aan hetzelfde providerbericht meegeven levert daardoor geen tweede receipt op. De inhoudshash is SHA256 van de volledige gevalideerde JSONB-envelope met lowercase `event_id`. JSON-veldvolgorde heeft geen effect. Dit hashformaat is bewust anders dan de synthetische preview; clients hoeven de sleutel niet zelf te berekenen en krijgen hem terug in de receipt.

Een transactionele advisory lock plus unieke databaseconstraint serialiseert dezelfde brongebeurtenis, ook tussen processen/roterende clients. Identieke inhoud geeft dezelfde receipt-ID/tijd/uitkomst terug met `replay: true`. Gewijzigde feiten, actor, soort of tijd geven 409 `idempotency_conflict`; het oorspronkelijke record blijft intact. Rollback laat geen half receipt achter. Er is geen API die historische receipts reset of verwijdert.

Dit is **transportdeduplicatie**, geen complete financiële deduplicatie voor verschillende providerberichten over dezelfde zakelijke actie. Eenmalig volgen, subscribe/resub/gift-overlap, campagnes en intervallen moeten in de latere boekingskern worden bepaald en getest.

## Antwoord en onzeker resultaat

200 betekent uitsluitend: de ontvangst en oorspronkelijke uitkomst bestaan duurzaam in CC. Het antwoord bevat alleen `schemaVersion`, `mode: "intake_only"`, `receiptId`, `eventKey`, `receivedAt`, `decision`, `reason`, `persisted: true`, `awarded: false`, `earningEnabled: false`, `identityChecked: true`, `accountCheckPassed`, `providerProofVerified: false` en `replay`. De API valideert deze projectie strikt; extra interne velden of een onverwachte awardclaim leiden tot 503, niet tot doorgeven van de payload.

Bij onbekende uitkomst of 503 dezelfde oorspronkelijke envelop herhalen. Nooit een nieuwe event-ID maken. De database kan na verbroken HTTP toch gecommit hebben; een annulering is geen bewijs van rollback. Als de receipt-ID/sleutel al bekend is kan de bron die binnen haar eigen binding uitlezen. Een bronjournal/bridge en onafhankelijke providerverificatie zijn nog niet gebouwd.

Bodies maximaal 8192 bytes, strikte UTF-8/JSON en leesdeadline 3 seconden. Het volledige API-pad heeft een budget van 5 seconden, met echte annulering van upstream-I/O. Alle responses zijn no-store/nosniff. In-process limiet: 60 requests per client per minuut, receipt-reads en intake samen; meerdere replica's vereisen later een gedeelde limiter.

Fouten: 400 ongeldige velden/body/query; 401 ongeldige client; 403 bron/scope/soort niet toegestaan; 404 niet gevonden of uitgeschakeld; 405 verkeerde methode; 408/413/415 transportgrens; 409 inhoudsconflict; 422 nieuwe claim buiten tijdvenster; 429 rate limited; 503 onzekere/opslag-/configuratiefout. Geen ruwe databasefout, Auth-record of secret in de foutprojectie.

## Grenzen vóór ingebruikname

- Geen Cloud-migratie, broncredential, scope, Streamer.bot-wijziging, botdeploy, automatische backup of saldo-overname uitgevoerd. Intake en automatisch verdienen blijven uit.
- Nog vast te stellen vóór echte broninname: numerieke broadcaster-ID, adapterbewijs, bronautorisatie, hosting/journal, volume-/retentiebeleid en operationeel herstel. Geen automatische receiptpurge: verwijderen zou de deduplicatie-/afwijzingshistorie verliezen. Bewaartermijn moet afzonderlijk worden besloten vóór werkelijke persoonsgegevens worden verzameld.
- Een processor met financiële boekingen, bronregels/revisies, tarieven, XP, levels, quota, semantische deduplicatie en atomische financiële autorisatie ontbreekt nog. Het ontvangstregister kan deze controles niet vervangen.
- Website, Discord, Streamer.bot en centrale service blijven aparte deployment-/credentialgrenzen rond hetzelfde CC-saldo. Saldo-overname blijft gekoppeld aan de latere StreamElements/Streamer.bot-omschakeling.

Verificatie en beperkingen: [lokaal acceptatieverslag](../acceptatie/REWARDS-INTAKE-20261018.md). Geraadpleegd: [Supabase identities](https://supabase.com/docs/guides/auth/identities), [databasefuncties](https://supabase.com/docs/guides/database/functions) en het [Auth-user-model](https://github.com/supabase/auth/blob/master/internal/models/user.go) voor de native ban-/verwijdervelden. De changelog is gecontroleerd; er zijn geen dependencies aangepast.
