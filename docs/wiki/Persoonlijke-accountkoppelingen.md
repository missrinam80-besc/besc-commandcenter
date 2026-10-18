# Persoonlijke accountkoppelingen

Status 18 oktober 2026: persoonlijke Twitchkoppeling lokaal gebouwd, standaard uit. Geen Cloud-providerconfiguratie, migratie, deploy of echte Twitch-OAuth-proef uitgevoerd in dit werkpakket. De bestaande Discordkoppeling blijft werken zoals voorheen.

## Gebruiker

Onder **Mijn account** staat een Twitchkaart. Een actief BESC-lid kan, zodra de functie afzonderlijk beschikbaar is gesteld, zijn eigen Twitchaccount bij Twitch bevestigen. Het account wordt aan de bestaande Supabase-gebruiker gekoppeld. Er wordt geen tweede ledenrekening of Bucks-saldo gemaakt. Een andere Twitchnaam na hernoemen verandert de numerieke identiteit niet.

Een bestaande koppeling toont de door Auth bevestigde Twitch-ID en weergavenaam. Bij een ongeldige/onvolledige identiteit wordt geen bruikbare koppeling getoond. Ontkoppelen verwijdert alleen de eigen Twitch-inlogidentiteit; Discord, profielen, rollen, historiek en saldo worden niet aangepast. De laatste inlogidentiteit mag niet worden verwijderd. Eerst een andere werkende inlogmethode toevoegen. De flag blokkeert het starten van nieuwe koppelingen; een bestaande koppeling mag door de eigenaar nog worden verwijderd als de flag uitstaat.

De koppeling geeft op zichzelf geen extra organisatie-, ticket-, event- of financiële rechten. Een niet-actief lid krijgt geen accountbeheer. Er staat geen nieuwe Twitch-login- of registratieknop op de publieke loginpagina.

De bestaande algemene login-callback is aanvullend beperkt tot interne retourbestemmingen. De Discordkoppeling, wachtwoordherstel en e-mailbevestiging behouden hun bestaande interne pagina's; externe `next`-adressen worden geweigerd.

## Drie verschillende Twitchverbindingen

| Verbinding | Functie | Wie beheert de credentials? |
| --- | --- | --- |
| Persoonlijke Twitchidentiteit | Bewijst welk Twitchaccount bij een bestaand BESC-account hoort | Supabase Auth-provider |
| BESC-kanaalintegratie | Kanaalgegevens en socialrapportage in CC | Bestaande serverzijdige Twitchintegratie |
| Streamer.bot broadcaster/bot | Lokale chat en streambediening | Streamer.bot op de streampc |

De laatste twee zijn geen bewijs van de persoonlijke Twitchidentiteit van leden. Deze release wijzigt hun credentials, scopes, commando's en configuratie niet. De Discordbot blijft uitsluitend zijn bestaande beperkte CC-API gebruiken.

## Later: afzonderlijk DEV-acceptatievenster

Dit is een voorbereid controleplan, geen opdracht om nu instellingen te wijzigen.

1. Review en merge van de code afzonderlijk goedkeuren; nog geen productieactivering.
2. **Supabase DEV-dashboard:** lees eerst de bestaande Auth-providerconfiguratie. Configureer zo nodig de Twitch-provider met een gecontroleerde OAuth-app en behoud de bestaande Discord-provider. Handmatige identity linking moet beschikbaar zijn. Gebruik de door Supabase getoonde provider-callback-URL in de Twitch-app; dat is niet de CC-callback hieronder. Providersecrets blijven uitsluitend in de daarvoor bedoelde beveiligde configuratie.
3. **Supabase DEV-dashboard, Auth URL Configuration:** neem de exacte app-return-URL `https://cc-dev.belgianstreamerscommunity.be/auth/twitch-link/callback` op in de toegestane redirects. Gebruik geen wildcard als vervanging. Behoud de bestaande redirects. Controleer welke scopes de Twitch-provider werkelijk vraagt; deze flow voegt zelf geen chat-, moderatie-, kanaalbeheer- of beloningsscopes toe.
4. **CC-server BESCSRVDEV, `/opt/besc-dev/command-center`:** controleer `NEXT_PUBLIC_SITE_URL` en lees de nieuwe code via de normale, afzonderlijk goedgekeurde DEV-deploy in. Voor het gekozen venster `BESC_TWITCH_IDENTITY_LINKING_ENABLED=true` instellen en configuratie herladen. Dit hoort nooit op botserver BESCSRVDEV-02. Geen bestaande credentials of featureflags wijzigen. De flag staat in het voorbeeld op `false`.
5. **CC-browser:** met een actief testlid vanuit Mijn account koppelen. Bevestig bij Twitch het persoonlijke testaccount, niet stilzwijgend het kanaal- of botaccount. Account-ID, lidmaatschap, Discordkoppeling en Bucks voor/na vergelijken zonder secrets te kopieren. Dezelfde BESC-user moet behouden blijven.
6. Test weigeren, opnieuw beginnen, al aan ander BESC-account gekoppeld Twitchaccount, sessie verlopen/gewisseld, ontkoppelen, laatste-inlogmethodebescherming en opnieuw koppelen. Controleer donkere en lichte modus.
7. Controleer bestaande Discord-status/account/events/tickets en privé-Bucks. Automatisch verdienen, import, slotberichten en Streamer.bot blijven ongewijzigd. Geen scope aan live clients toevoegen.
8. Leg resultaten vast. Cloud/Supabase uniciteits- en OAuth-gedrag zijn pas na deze echte proeven bewezen. De callback doet geen profiel-/ledgerwrite. Supabase kan de native identiteit al tijdens de providerflow koppelen voordat de app-return wordt afgehandeld; een geweigerde callback is geen rollback van die providerhandeling. Controleer een onzekere uitkomst in Mijn account, start niet blind een accountverplaatsing of handmatige databasecorrectie.

Deze eerste versie slaat geen kopie van Twitch-ID's in `profiles` op en bewaart geen afzonderlijke provider-tokens voor rewards. Supabase beheert de OAuth-sessie volgens zijn bestaande SSR-opslag; tokens of authcookies nooit in chat, logs of fixtures opnemen. Automatische linking met een door Supabase geverifieerd e-mailadres blijft Supabase-providerbeleid; CC maakt geen eigen naam-/e-mailmatch.

Technisch contract: [persoonlijke identiteiten V1](../contracts/personal-identities-v1.md).

## Bronnen

- [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase Twitch-provider](https://supabase.com/docs/guides/auth/social-login/auth-twitch)
- [Twitch authorization code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow)

Geraadpleegd 18 oktober 2026. Changelog gecontroleerd: de aangekondigde TLS-cipherwijziging verandert deze JS/SSR-linkingflow niet; er zijn geen afhankelijkheden bijgewerkt.
