# BESC bot-API: lokale proef v0.1

> Dit document beschrijft de oorspronkelijke leesproef. De uitspraak dat alle schrijfmethoden uitstaan geldt alleen voor die scope, niet voor de huidige ticket- en slot-API. Zie [Discordbeheer](../Discordtickets-en-botbeheer.md) en [huidige DEV-status](../Huidige-DEV-status.md).

Deze beperkte lees-API is voorbereid en gereviewd op broncommit `e18456fb9490da090ea3a2e74b27ca9600c04234`. De code is geen bewijs van een live Discord- of Cloud-koppeling. Er is geen databasewijziging nodig voor deze leesproef.

## Waarom binnen Next.js

De bestaande DEV-app draait op BESCSRVDEV met Cloud Supabase voor database, Auth en Storage. De webapp bevat accountkoppeling, eventbeheer, bestaande API-routes en een aparte MCP-toegang voor agents. Deze proef voegt drie kleine API-resources toe aan dezelfde app. Zo blijft de serverconfiguratie bij Command Center en wordt het huidige rechtenbeleid hergebruikt.

Een aparte Express-API, eigen PostgreSQL en de drie-serverindeling uit het ecosysteemplan zijn nog architectuurvoorstellen. Deze proef vereist geen infrastructuurmigratie. De bestaande MCP-token/grants worden niet voor de bot gebruikt: zij hebben een andere doelgroep en rechtenstructuur.

## API-contract

Alle resources vereisen `Authorization: Bearer <eigen clientkey>` en `guild_id`. De server bepaalt de organisatie op basis van de clientconfiguratie. Alle antwoorden bevatten `Cache-Control: no-store`; er is geen publieke CORS-toegang.

| GET-resource | Extra query | Clientrecht | Antwoord |
| --- | --- | --- | --- |
| `/api/v1/bot/identity` | Geen | `identity:read` | clientId, scopes, readOnly |
| `/api/v1/bot/account` | discord_user_id | `account:read` | linked, activeMember, canReadEvents |
| `/api/v1/bot/events` | discord_user_id, optioneel offset | `events:read` | Maximaal vijf events, nextOffset |

`offset` is 0 t/m 99999. Een `nextOffset` wordt uitsluitend teruggegeven als die ook binnen deze grens valt. Vanaf offset 99995 is er dus geen vervolglink, ook als de lookahead nog een rij vindt. Deze begrensde proef biedt geen toegang via startoffsets boven 99999. Onbekende of dubbele queryparameters worden geweigerd, waaronder `organization_id` en `user_id`. De bot neemt de actor uitsluitend uit `interaction.user.id`; er is geen optie om iemand anders te selecteren. DM's en andere Discordservers worden in de bot en API geweigerd.

Een clientkey bestaat uit `bb_<client-id>.<32 random bytes in base64url>`. Alleen de SHA-256-hash staat in `BESC_BOT_CLIENTS_JSON`; de bot bewaart de oorspronkelijke sleutel als servergeheim. Vergelijking gebeurt constant-time. Iedere client krijgt een eigen organisatie, server, scopes, vervaldatum en intrekkingsstatus. Lees `.env.bot.example` voor het onbruikbare configuratievoorbeeld.

De client vertegenwoordigt een vertrouwde automatisering. De API vertrouwt dat die client de echte Discordactor doorgeeft; een gestolen clientkey kan geldige Discord-IDs binnen deze organisatie aanbieden. Bewaar de key daarom alleen op de botserver, houd scopes beperkt en trek hem bij incidenten direct in. Deze leesproef bevat geen aanvullend Discord-interaction signatureprotocol tussen bot en API.

## Gedeelde toegang en data

De API controleert bij elke account- en eventaanvraag:

1. Een `profiles.discord_user_id`-match.
2. De actuele Discord-identity via Auth `getUserById`, met de bestaande helper `discordIdentityDetails`; een zelf ingevulde profielwaarde is onvoldoende. Een verwijderde identity of actieve Auth-ban weigert toegang.
3. Een actief lidmaatschap in de organisatie uit de clientconfiguratie.
4. Voor events: dezelfde `canViewInternalPath('/app/events', membership)` als de webapp.

Crew (`member`), bestuur en admins mogen Events lezen. Vrijwilligers hebben volgens het huidige webroutebeleid geen Events-paginatoegang, ook als een maatwerkrol `manageEvents` bevat. De bot vergroot deze toegang niet. Een gewenste uitbreiding vraagt een gezamenlijke aanpassing en acceptatie van web- en API-beleid.

Eventinformatie is intern en wordt alleen als privéantwoord teruggegeven. Er bestaat nog geen bevestigd publicatieveld voor Discord. Daarom worden dezelfde niet-verwijderde eventstatussen als in de webapp getoond, inclusief ideeën en planning, aan bevoegde accounts. De bot publiceert geen community-agenda. Alleen `id,title,status,event_type,start_at,start_date,location,is_online` worden geselecteerd en teruggegeven; beschrijvingen, eigenaars, financiële gegevens, Drive-links, registraties en persoonsgegevens vallen buiten dit contract.

De server gebruikt de bestaande `createAdminClient`, waarvan de sleutel alleen binnen Command Center blijft. De helper accepteert nu optioneel een custom fetch voor deze API; alle bestaande aanroepen zonder argument houden hun oorspronkelijke instellingen. Deze serverclient omzeilt RLS; daarom vormen de expliciete actor-, lidmaatschap-, organisatie- en veldfilters de API-beveiligingsgrens. Tests controleren die filters. Elke nieuwe resource moet deze grens opnieuw bewijzen. De bot bevat geen Supabase-library, databaseverbinding of beheersleutel.

Elke bot-API-aanvraag heeft een gezamenlijk serverbudget van vijf seconden voor profiel-, Auth-, lidmaatschap- en eventaanvragen, inclusief het lezen van responsebodies. `withBotUpstream` geeft één AbortSignal via de officiële Supabase `global.fetch`-optie door aan zowel PostgREST als Auth. Bij timeout of annulering van de inkomende aanvraag worden echte HTTP-aanvragen afgebroken. Een race begrenst daarnaast de API-responstijd; nieuwe SDK-fetches na annulering worden vóór netwerkverkeer geweigerd. Het budget begint niet opnieuw bij iedere query. Timers en listeners worden bij succes en fouten opgeruimd. De API antwoordt bij timeout met een geredigeerde 503 `upstream_unavailable` en requestId. De bottimeout van acht seconden blijft bestaan.

Dit is lokaal getest met de geïnstalleerde Supabase SDK 2.110.2 en vastlopende lokale endpoints, inclusief een onvolledige Auth-body. De tests controleren dat de upstreamsocket vóór testcleanup sluit. De officiële [custom fetch-configuratie](https://supabase.com/docs/reference/javascript/initializing) ondersteunt deze transportkoppeling. Er worden geen Cloud-aanvragen uitgevoerd in deze tests.

## Fouten en operationele grenzen

| HTTP | code | Betekenis |
| --- | --- | --- |
| 400 | invalid_query / invalid_discord_id / invalid_offset | Ongeldige invoer |
| 401 | invalid_client | Ontbrekende, verkeerde, verlopen of ingetrokken key |
| 403 | insufficient_scope / guild_not_allowed | Client heeft geen recht |
| 403 | membership_required / events_forbidden | Account heeft geen toegang |
| 404 | account_unavailable / not_found | Geen verifieerbare koppeling of resource |
| 405 | read_only of standaard Next.js-antwoord | Schrijfmethode niet beschikbaar |
| 429 | rate_limited | Maximaal 60 requests per client per minuut per proces |
| 503 | upstream_unavailable / server_configuration_unavailable | Data of serverconfiguratie ontbreekt |

Bij API-fouten bevat `error` een code en requestId; dezelfde requestId staat in de responseheader. Logging bevat resource, clientId, status en requestId; geen key, actor-ID, eventinhoud of querystring. De bot toont begrijpelijke fouten en logt geen SDK-foutobjecten met tokens.

De limiet is in geheugen en wordt gereset bij een herstart. Multi-replica-uitrol vereist eerst een gedeelde limiter. Intrekken of roteren gebeurt door de afzonderlijke clientconfiguratie te wijzigen en de bestaande webcontainer opnieuw te laten inlezen; deze proef heeft geen beheer-UI voor keys. Rotation/expiry/revocation zijn lokaal getest, maar operationele containerrotatie nog niet.

Binnen deze oorspronkelijke leesproef waren alle API-schrijfmethoden uitgeschakeld; de huidige ticket- en slotroutes hebben afzonderlijke beperkte schrijfscopes. De botdeduplicatie geldt alleen per proces gedurende vijftien minuten en voorkomt dubbele leesantwoorden. Dat is geen duurzame bescherming voor ticket- of Bucks-mutaties. Die toekomstige resources mogen pas aan na een database-transactie met unieke idempotency key, opgeslagen requesthash, actor/organisatiebinding en atomische resultaatopslag (zie de roadmap in de overdracht).

## Lokaal controleren en reviewen

```powershell
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit --incremental false
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/bot-api.test.mts tests/bot-api-store.test.mts tests/bot-api-upstream.test.mts
pnpm build
node scripts/check-bot-api-local.mjs
```

De smokecheck start tijdelijk een Next.js-server en synthetische upstream op loopback, gebruikt uitsluitend willekeurige synthetische credentials en stopt beide servers na afloop. Naast routing en foutafhandeling test hij een vastlopende upstream met het echte vijfsecondenbudget en controleert hij daadwerkelijke socketannulering. Geen Cloud-data worden benaderd. Start deze check alleen na `pnpm build`.

De gedeelde helper `src/lib/supabase/admin.ts` accepteert optioneel custom fetch-injectie voor de begrensde botaanvragen. De volledige testsuite controleert ook de bestaande functies. De GitHub-kwaliteitscontrole voert de lokale routecheck na de productiebuild uit; daarbij worden uitsluitend loopbackvoorzieningen en synthetische credentials gebruikt. Dit bewijst geen live verbinding.

## Live acceptatie na toestemming

Nodig: bevestigde organisatie-ID, uitsluitend een test-Discordserver, eigen botapplicatie/token, een gekoppeld crewaccount, vrijwilliger zonder eventtoegang en een niet-gekoppeld account. Deel geen token of clientkey in chat.

Na code-review en toestemming voor DEV-configuratie/uitrol: configureer een afzonderlijke kortelevende testclient, rol alleen de bestaande DEV-webapp uit, voeg de bot met minimale rechten aan de testserver toe, registreer uitsluitend `/besc` en bewijs identity/account/events, geweigerde accountgevallen, expiry en intrekking. Controleer MEE6 op commandconflicten zonder instellingen te wijzigen. Leg de echte resultaten vast voordat deze bot operationeel wordt genoemd.
