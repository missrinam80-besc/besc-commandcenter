# Centrale verdien-API — synthetische controlemodus V1

18 oktober 2026. Status: lokale implementatie ter review, niet gemerged of uitgerold. Dit is een eerste testbare bouwsteen voor de centrale API; geen volledige activiteitverwerking.

## Plaats in het ecosysteem

CC blijft eigenaar van accounts, regels, saldo, reserveringen, catalogus en historiek. De bestaande Discordbot gebruikt zijn guildgebonden `/api/v1/bot/rewards`-API. Deze preview verandert die API, scopes en credentials niet. Streamer.bot gaat later gebeurtenissen aanleveren via een afzonderlijk beoordeelde bronadapter/centrale service. De botserver krijgt geen directe databasetoegang.

Websiteprofiel, blog en social acties blijven voorziene bronnen voor dezelfde centrale boekingskern. Ze zijn hier bewust nog niet aanleverbaar: bewijs, bronauthenticatie, herhaling en eligibility moeten eerst worden vastgesteld. Een browserclaim van lezen of liken wordt geen verdienbewijs.

De persoonlijke Twitchkoppeling is op DEV normaal getest; zie het [acceptatieverslag](../acceptatie/PERSOONLIJKE-TWITCHKOPPELING-20261018.md). Dat is accountbewijs en geen bewijs van een follow, cheer of voortdurende providerautorisatie. Deze preview leest Auth, lidmaatschap en saldi niet.

## Werking en harde grens

Nieuwe namespace: `/api/v1/integrations/rewards/preview`.

| Route | Scope | Resultaat |
| --- | --- | --- |
| `GET /config` | `rewards:preview:read` | Alleen eigen Twitchbron, toegestane soorten en technische limieten. |
| `POST /validate` | `rewards:preview:validate` | Controle van een synthetische envelop, bronbinding en tijd; twee reproduceerbare hashes. |

De route heeft **geen opslag-, Auth- of ledgerafhankelijkheid**. Een 200 zegt alleen dat de synthetische envelop aan dit contract voldoet. Het antwoord is steeds `mode: "preview"`, `earningEnabled: false`, `persisted: false`, `awarded: false`. Validatie voegt `status: "validated_only"`, `identityChecked: false` en `proofVerified: false` toe.

Er zijn binnen de preview geen `/activities`- of `/receipts`-routes. Niets wordt hier in een wachtrij opgeslagen, gereconcilieerd of na herstart hersteld. Herhaalde validatie is toegestaan en verdient nooit punten. De inmiddels afzonderlijk voorbereide [duurzame intake](rewards-intake-v1.md) heeft haar eigen flag, credentials en contract, weigert deze simulaties en kent evenmin punten toe.

## Afzonderlijke serverconfiguratie

Standaard uit, ook als de bestaande Discord-activiteitvlag aan zou staan:

```dotenv
BESC_REWARDS_PREVIEW_ENABLED=false
BESC_REWARDS_PREVIEW_REGISTRY_JSON=
```

Alleen exact `true` maakt de preview bereikbaar. Uitgeschakeld antwoordt de route 404 zonder het register te lezen. Deze branch configureert geen bestaande omgeving of client.

Het server-only JSON-register heeft exact `sources` en `clients`. Geen secrets in `NEXT_PUBLIC_*`, Git, browser of logs. Een apart previewtoken heeft formaat `brp_<client-id>.<43 base64url-tekens>`. Alleen de SHA256 van het **volledige** token wordt opgeslagen. De later te gebruiken willekeurige secret moet uit 32 cryptografisch willekeurige bytes komen. Deze versie maakt of installeert geen echte tokens.

Bronvelden: `id`, `organizationId` (UUID), `platform: "twitch"`, `broadcasterId` (numerieke ID-string), `kinds` (een unieke selectie van `twitch.follow`, `twitch.cheer`), `revoked` (boolean).

Clientvelden: `id`, `sourceId`, `keyHash` (64 lowercase hextekens), `scopes` (unieke previewscopes), `expiresAt` (UTC met milliseconden), `revoked` (boolean). Een client verwijst naar precies één bestaande bron. Organisatie en bron komen uitsluitend uit dit register. Intrekken van de bron blokkeert alle daaraan gekoppelde clients; intrekken/verlopen van één client blokkeert alleen die client.

Maximaal 32 bronnen en 32 clients, maximaal 64 KiB configuratie. Onbekende velden, dubbele IDs/hashes/scopes/soorten, ontbrekende bron en dubbele organisatie/platform/broadcasterbinding zijn ongeldig. IDs bestaan uit 3–64 lowercase letters, cijfers of koppeltekens. De bestaande `BESC_BOT_CLIENTS_JSON`, botprefix en bot-/beheerscopes worden niet geaccepteerd.

## Envelop

Uitsluitend synthetische `twitch.follow` en niet-anonieme `twitch.cheer`. Gebruik de [uitvoerbare TESTFIXTURE](../../tests/fixtures/rewards-integration-preview-v1.json). De vaste fixturetijd is alleen bruikbaar met de testklok; voor een lokale HTTP-proef een actuele UTC-tijd gebruiken.

```json
{
  "schemaVersion": 1,
  "simulation": true,
  "kind": "twitch.cheer",
  "event_id": "30000000-0000-4000-8000-000000000001",
  "broadcaster_id": "123456789",
  "twitch_user_id": "987654321",
  "occurred_at": "2026-10-18T20:00:00.000Z",
  "facts": { "bits": 100, "is_anonymous": false }
}
```

Alle IDs en tijdstippen hierboven zijn TESTFIXTURE. `event_id` is in dit eerste adaptercontract een provider-bericht-UUID, geen vrij opnieuw gegenereerde retry-ID. Een latere Streamer.bot-adapter moet aantonen dat hij zo'n stabiele oorspronkelijke ID kan leveren. Die adapter is nu niet gebouwd. Numerieke Twitch-ID's zijn strings van 1–20 cijfers, zonder nul of voorloopnul. Usernames worden niet gebruikt voor identificatie.

`follow` heeft exact lege `facts: {}`. `cheer` heeft exact `bits` (geheel 1–1.000.000) en `is_anonymous: false`. Dit plafond is een technische invoergrens, geen vastgesteld tarief of providermaximum. Geen berichten, namen, bedragen, XP, Bucks, regelversie, interne user-ID, organisatie of bronkeuze uit de body. Onbekende of ontbrekende velden worden geweigerd. Geen vrijgeefveld kan de controlemodus verlaten.

Alle tijden zijn strikt ISO UTC met milliseconden, bijvoorbeeld `.000Z`. De synthetische gebeurtenis mag maximaal 120 seconden oud of 5 seconden toekomstig zijn, inclusief beide grenzen. Dit zijn testbare previewgrenzen, geen besloten herstelvenster voor toekomstige echte verwerking. Queryparameters zijn niet toegestaan.

Aanwezigheid, abonnementen/gifts/resubs, tips, raids, Discord en website/social zijn in deze namespace niet ondersteund. Daarvoor ontbreken nog eigen adapters en/of vastgestelde semantiek. Streamer.bot blijft gepauzeerd zoals afgesproken; StreamElements-saldo en verdieninstellingen worden niet gewijzigd.

## Stabiele observatiesleutel en inhoudshash

De SHA256-observatiesleutel wordt berekend over een UTF-8 JSON-array zonder witruimte:

```text
[1,"preview",lowercase-organisatie-UUID,"twitch",broadcaster-ID,kind,lowercase-event-UUID,Twitch-user-ID]
```

De inhoudshash is SHA256 over `[identity-array,occurred_at,facts-array]`, waarbij `facts-array` voor follow `[]` is en voor cheer `[bits,false]`. Veldvolgorde of witruimte van het aangeleverde JSON en rotatie van client-/bronrecord-ID veranderen deze hashes niet. Gewijzigde feiten behouden de observatiesleutel maar veranderen de inhoudshash. De API bewaart/vergelijk deze hashes niet: zij detecteert dus nog geen conflict met een eerdere request.

Dit identificeert een transportwaarneming en is **geen financiële deduplicatiesleutel**. Twee echte followmeldingen met verschillende bericht-IDs blijven hier twee observaties. Een toekomstig boekingsregister moet onder meer eenmaligheid van volgen, giftbomb/individuele gift, subscribe/resub, intervallen en campagnes afhandelen. Een regelwijziging of replay mag dan geen tweede recht op punten creëren.

## Transport en fouten

Bodies: maximaal 8192 bytes, ook zonder Content-Length; strikte UTF-8 en JSON, `application/json`, leesdeadline 3 seconden en annulering van de reader bij timeout/abort. Er zijn geen upstreamcalls. Alle antwoorden zijn `no-store` en `nosniff`; geen CORS-vrijgave of cookieauthenticatie. Methoden buiten GET-config/POST-validate worden geweigerd. De in-process limiter staat 60 requests per client per minuut toe, over beide routes samen; meerdere replica's vereisen later gedeelde rate limiting en netwerkbeveiliging. Dit is geen bescherming tegen algemene netwerkoverbelasting.

Foutvorm: `{"error":{"code":"...","requestId":"..."}}`; geen payload, token, hashconfiguratie of onderliggende foutmelding.

| HTTP | Codes |
| --- | --- |
| 400 | `invalid_fields`, `invalid_body`, `invalid_query` |
| 401 | `invalid_client` met Bearer-challenge |
| 403 | `insufficient_scope`, `source_unavailable`, `source_not_allowed`, `kind_not_allowed` |
| 404 | `not_found` (ook bij uitgeschakelde preview) |
| 405 | `method_not_allowed` met Allow |
| 408 / 413 / 415 | `body_timeout` of `request_aborted` / `body_too_large` / `json_required` |
| 422 | `event_time_out_of_range` |
| 429 | `rate_limited`, Retry-After 60 |
| 503 | `preview_unavailable`, bijvoorbeeld bij ongeldig serverregister |

## Volgende bouwstappen vóór punten verdienen

1. Bronadapter en numerieke ID van Belgianstreamerscommunity vaststellen; providerbewijs en beperkte bronautorisatie testen. Geen gebruikersnaam als autorisatiebinding.
2. Actuele provideridentiteit en lid-/Discordkoppeling worden in de aparte intake gecontroleerd; geen username-/e-mailmatch of onbegrensde Auth-userlijst. Live migratie-/Auth-acceptatie hiervan staat nog open.
3. Het aparte CC-ontvangstregister bewaart nu vaste uitkomsten en detecteert dubbele/gewijzigde providerberichten. De atomische boekingskern, financiële semantiek, regelrevisie en quota zijn nog te bouwen. Bridge-journal, hosting, credentials en retentie afzonderlijk uitwerken.
4. XP, tarieven, herhaling, caps en providersemantiek laten vaststellen. Website/social meten alleen aantoonbare acties. Geen fictief lees- of raidbewijs.
5. Geïsoleerde database-/concurrencytests en aparte DEV-acceptatie vóór bronactivering. Streamer.bot, website en Discord houden afzonderlijke credentials en deployments.
6. StreamElements-overname pas samen met de goedgekeurde Streamer.bot-omschakeling: staging, bronclaims, cutoff en somcontrole, behoud van bestaande CC-boekingen/reserveringen. Nu geen export/import of automatische backup.

## Bronnen

Geraadpleegd op 18 oktober 2026: [Twitch EventSub events](https://dev.twitch.tv/docs/eventsub/eventsub-reference/) voor minimale follow-/cheerfeiten en [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking) voor de bestaande accountkoppeling. Providerverificatie wordt door deze preview niet uitgevoerd. De [Supabase changelog](https://supabase.com/changelog) is gecontroleerd; deze wijziging bevat geen Supabase SDK-, Auth-, RLS- of schemawijziging.
