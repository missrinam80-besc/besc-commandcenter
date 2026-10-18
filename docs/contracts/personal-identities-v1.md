# Persoonlijke identiteiten V1

Status: eerste CC-implementatie, geen nieuwe bot- of rewards-intake-API. De bestaande Discordclient, scopes en events/ticket/rewards-contracten blijven ongewijzigd. Geen bridge, Streamer.bot-code of website-repository gewijzigd.

## Canonieke rekening en autoriteit

De rekening blijft `(organization_id, auth.users.id)`. Discord- en Twitchidentiteiten zijn gekoppelde provideridentiteiten van dezelfde Auth-user, geen afzonderlijke rekeningen. Een rekening ontstaat niet door alleen een Twitchnaam, profiel-URL, aangeleverde provider-ID of OAuth van de broadcaster.

| Gegeven | Autoriteit | Niet toegestaan als vervanging |
| --- | --- | --- |
| BESC-gebruiker | Serverzijdige `auth.getUser()` met actuele Auth-validatie | User-ID uit formulier, ongevalideerde cookie of `user_metadata` |
| Lidmaatschap/rechten | Actieve `organization_members` voor de betreffende organisatie, bestaande rechtenlaag | Provideridentiteit of login alleen |
| Persoonlijk Twitch-ID | `twitch`-identity in de actuele Auth-response; numerieke `identity_data.sub`/`provider_id` | Identity UUID, e-mailadres, Twitchnaam, `profiles`-spiegel of clientclaim |
| Discordidentiteit | Bestaande actuele Discordidentitycontrole | Een Twitchkoppeling of oudere profielwaarde |
| Twitchbron/kanaal | Later afzonderlijk organisatie-/broadcastergebonden integratiecontract | Persoonlijke identiteit of willekeurige bodyparameter |

`twitchIdentityDetails()` aanvaardt alleen string-ID's van 1-20 cijfers zonder voorloopnul. Indien zowel `sub` als `provider_id` aanwezig zijn moeten ze gelijk en geldig zijn. Ontbrekende, afwijkende of ongeldige waarden falen gesloten. Naam is alleen presentatie. Roep deze helper alleen aan met door Auth bevestigde identities; hij valideert zelf geen OAuth-token of extern JSON-bewijs.

Provideridentiteiten zijn accountbreed, terwijl bevoegdheden en Bucks organisatiegebonden blijven. Een Twitchkoppeling maakt geen lid in een tweede organisatie en verplaatst geen rekening. Supabase beheert de provideruniciteit en conflicten; deze release kopieert of merge't geen accounts. De bestaande automatische geverifieerde-e-maillinking van Supabase is providerbeleid, geen nieuwe CC-matchroutine.

Een actuele Auth-identity betekent dat die koppeling nu in Supabase bestaat; het is geen voortdurende Twitch-tokenvalidatie of bewijs dat een eerder gegeven Twitchautorisatie niet extern is ingetrokken. Deze release bewaakt geen Twitchrevocation-webhooks en kent geen beloningen toe. Een latere rewards-bron moet zijn eigen actuele bronautorisatie, intrekking en acceptatie aantonen.

## Koppelflow

- Alleen de ingelogde actieve gebruiker kan de serveractie `linkTwitchIdentity` starten.
- `BESC_TWITCH_IDENTITY_LINKING_ENABLED` moet exact `true` zijn; anders wordt geen OAuth-link gestart.
- De return-origin komt uitsluitend uit gevalideerde `NEXT_PUBLIC_SITE_URL`. Productie-HTTP, userinfo, paden, query's en fragmenten worden geweigerd; localhost-HTTP is voor lokale ontwikkeling toegestaan.
- Native `auth.linkIdentity({ provider: "twitch" })` gebruikt de bestaande Supabase SSR-/PKCE-flow. CC vraagt geen door de gebruiker ingevoerd Twitch-ID en gebruikt geen tweede eigen Twitch-tokenuitwisseling.
- App-callback: `GET /auth/twitch-link/callback?code=…`. Dit is niet de provider-callback in de Twitch-app. Supabase valideert providerstate en PKCE. Ontbrekende, dubbele of te lange codes worden geweigerd.
- De callback valideert Auth-user en actief lidmaatschap vóór codewisseling en opnieuw daarna. Een gewijzigde gebruiker krijgt geen succesmelding en wordt lokaal afgemeld. Geen door de caller bepaalde `next`, organisatie, rekening of redirectbestemming wordt gebruikt.
- Callbackantwoorden zijn `303` naar een vaste interne pagina, met `Cache-Control: no-store` en `Referrer-Policy: no-referrer`; ontbrekende/ongeldige siteconfiguratie geeft `503`. Er worden geen providerfouten, codes of tokens gereflecteerd of gelogd.
- Een providerweigering resulteert in een generieke melding. Native Supabase kan identiteit-linking al vóór de app-callback uitvoeren. Callbackfalen draait dat niet terug; de actuele Auth-state blijft de waarheid. Geen succes alleen op basis van URL-parameters.

## Ontkoppelen

De eigen ingelogde actieve gebruiker haalt de actuele identities op; uitsluitend de gevonden Twitchidentity wordt aan `auth.unlinkIdentity` doorgegeven. Minstens één andere Auth-identiteit moet overblijven en Supabase moet de operatie accepteren. Er is geen clientveld voor een andere gebruiker of provider. Fouten worden niet als succes gepresenteerd. Dit muteert geen profiel, rol, organisatie, Discordkoppeling, beloning, ledger of oude importclaim. Verwijderen is ook toegestaan als het starten van nieuwe koppelingen uitstaat.

## Grens voor toekomstige rewards-API

Deze PR introduceert geen actorlookup voor externe clients en geen extra clientscopes. Een latere rewards-adapter moet de bronclient, organisatie, broadcaster, provider-user-ID, actuele Auth-identiteit en actuele organisatiegeschiktheid gecontroleerd samenbrengen. Een eerdere positieve koppeling of cached gebruikersnaam is geen permanente machtiging. Ontkoppelen stopt toekomstig gebruik van die identiteit; historische ledgerboekingen worden niet verwijderd. Hernoemen maakt geen nieuw lid of nieuw importrecht. Unieke imports en echte provideractiviteit hebben aparte contractspecificaties en proeven nodig.

Een websiteclient of Streamer.bot mag geen Supabase managementsleutel krijgen of zelf Auth-users enumereren. Bestaande Discordvoorwaarden blijven gelden voor de huidige persoonlijke Bucks-module. Geen automatische beloningen of importrechten door alleen Twitch te koppelen.

## Datalaag en uitrol

Geen SQL-migratie, nieuwe tabel, RLS-policy, profielkolom, service-rolefunctie of credential nodig. De bestaande Supabase-identiteiten zijn de gegevenslaag. Om de feature live te testen zijn later afzonderlijke provider-/redirectconfiguratie en de uitgeschakelde CC-flag nodig. Geen van deze Cloud-/DEV-aanpassingen is met de lokale tests uitgevoerd.
