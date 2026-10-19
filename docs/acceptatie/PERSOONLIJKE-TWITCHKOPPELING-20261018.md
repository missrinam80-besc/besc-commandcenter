# Persoonlijke Twitchkoppeling - verificatie en DEV-acceptatie

Datum: 18 oktober 2026. Branch `codex/personal-twitch-identity`, basis CC-main `aac0b85b55a986b67cc5331a8d836e76670b81b8`.

## Lokale verificatie

- `pnpm test`: **915 geslaagd**, geen mislukt of overgeslagen; hiervan 31 nieuwe gedragstests voor Twitchidentiteit/callback/ontkoppelen en twee voor de algemene auth-retourbestemming. De bestaande Discord-, tickets-, events-, slot- en rewards-tests blijven slagen.
- Gerichte account/Twitch-tests plus auth-redirecttests: 43 geslaagd.
- `pnpm run lint`: geslaagd zonder meldingen.
- `pnpm exec tsc --noEmit`: geslaagd.
- `pnpm exec next build --webpack`: volledige productiebuild geslaagd, inclusief de nieuwe dynamische callbackroute. Hiervoor alleen fictieve Supabase-instellingen en uitgeschakelde koppelflag gebruikt. Bestaande Google Fonts opgehaald met Node's Windows-systeem-CA; TLS-validatie bleef aan.
- Vier lokale HTTP-controles tegen de gebouwde app: disabled callback met ontbrekende code, gewone code, dubbele code/externe next en providerweigering retourneert telkens 303 naar de vaste interne foutpagina, met no-store en no-referrer. Geen OAuth- of Cloud-aanroep nodig. Tijdelijke lokale server daarna gestopt.
- Beide dossiergeneratorcontroles: geslaagd na lokale LF-normalisatie van het gecontroleerde JSON-bestand. Dat bestand is vervolgens hersteld; geen generator- of schemawijziging in de PR.
- `git diff --check`: geslaagd.

## Omgevingsgrenzen

De standaard `pnpm run build` met Turbopack kan in deze lokale worktree de gedeelde `node_modules`-junction buiten de ingestelde projectroot niet volgen. De productiebuild is daarom met Webpack gecontroleerd; next.config is niet aangepast. De eerste Webpack-poging kon Google Fonts niet verifiëren via de standaard Node-certificaatopslag. De geslaagde poging gebruikte `NODE_OPTIONS=--use-system-ca`, zonder certificaatcontroles te omzeilen. De normale Linux/Turbopack-build blijft onderdeel van PR-CI.

De 31 nieuwe tests voeren de callback- en unlinkbeslissingen uit met expliciete lokale Auth-/membership-testdoubles. Ze bewijzen afwijzing, vaste bestemmingen, hercontrole en behoud van andere identiteiten, niet de echte Twitch/Supabase-uitwisseling of Cloud-provideruniciteit. De bestaande databasegedragstests gebruiken hun eigen lokale fixtures; er is geen nieuwe SQL-migratie.

De twee aanvullende redirecttests controleren de bestaande algemene auth-callbackbestemmingen: interne Discord-, herstel- en e-mailpaden blijven behouden; externe, protocolrelatieve, backslash- en control-character-varianten worden geweigerd na URL-normalisatie.

## GitHub en DEV-uitrol

PR [#108](https://github.com/missrinam80-besc/besc-commandcenter/pull/108) is na expliciete goedkeuring en groene controles gemerged als `6756a80315fd4c54e1c6f47996e35a39edf60436`. De GitHub-controles omvatten de 915 tests, database/API-concurrencycontroles en de Linux/Turbopack-build. De DEV-imagebouw is geslaagd.

De gebruiker heeft de nieuwe CC-image op BESCSRVDEV uitgerold en een gezonde webservice en aanwezige Twitchroute bevestigd. Daarna heeft de gebruiker de afzonderlijke Twitch OAuth-app en Supabase DEV-provider opgeslagen, met behoud van de bestaande Discord-provider en redirects. De exacte CC-return-URL is toegevoegd. Er was geen SQL-migratie nodig.

De afzonderlijke activering bevestigde `BESC_TWITCH_IDENTITY_LINKING_ENABLED=true`, dezelfde webimage, ongewijzigde Caddy, botclients en overige instellingen, en een gezonde webservice. Handmatige configuratieback-up: `.env.production.backup-twitch-link-20261018T203621817756Z`. Het voorbeeldbestand blijft standaard `false`.

## Door gebruiker bevestigde DEV-proeven

- Persoonlijk Twitchaccount koppelen vanuit Mijn account: werkt. De bestaande Discordkoppeling bleef werken en het Bucks-saldo bleef gelijk.
- Twitch ontkoppelen en opnieuw koppelen: door de gebruiker bevestigd als volledig werkend na de instructie om ook sessie, Discord en saldo te controleren.
- Twitchtoestemming annuleren/weigeren: door de gebruiker bevestigd als werkend na de instructie om terugkeer zonder nieuwe koppeling en behoud van BESC-sessie, Discord en saldo te controleren.

Dit is acceptatie van de normale persoonlijke gebruikersflow op DEV, gebaseerd op de terugmeldingen van de gebruiker; geen onafhankelijke herhaling van iedere UI-stap.

## Resterende live controles en grenzen

Nog niet afzonderlijk live bewezen: een Twitchaccount dat al bij een ander BESC-account hoort, een verlopen of gewisselde echte sessie, bescherming van de laatste inlogidentiteit door Cloud Auth en expliciete visuele controle in lichte en donkere modus. De geslaagde OAuth-flow bewijst geen afzonderlijke adversariële state/PKCE-test. Zie het [DEV-controleplan](../wiki/Persoonlijke-accountkoppelingen.md).

Deze ronde wijzigde geen botserver, clientscopes, Bucks-saldi, StreamElements-instellingen of Streamer.bot-acties. Automatisch verdienen en de Discord-slotkeuze blijven uit. Saldo-overname is niet uitgevoerd. De persoonlijke Twitchkoppeling staat op DEV aan; een productieactivering is niet uitgevoerd. Een gekoppelde Auth-identiteit bewijst op zichzelf geen doorlopende providerautorisatie voor toekomstige verdienregels.
