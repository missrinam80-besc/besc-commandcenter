# Persoonlijke Twitchkoppeling - lokale verificatie

Datum: 18 oktober 2026. Branch `codex/personal-twitch-identity`, basis CC-main `aac0b85b55a986b67cc5331a8d836e76670b81b8`.

## Resultaat

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

## Open live acceptatie

Nog niet uitgevoerd: Supabase Twitch-providerconfiguratie, echte OAuth-consent/PKCE, providerconflict tussen twee BESC-accounts, gewijzigde sessie met echte provider, laatste-identiteitbescherming door Cloud Auth, ontkoppelen/herkoppelen en visuele controle in lichte/donkere modus. Zie het afzonderlijke [DEV-controleplan](../wiki/Persoonlijke-accountkoppelingen.md).

Er zijn geen Cloud-migraties, live accountkoppelingen, flags, clientscopes, saldi, StreamElements-instellingen, Streamer.bot-acties of botserverinstellingen gewijzigd. De featureflag is standaard false. Geen merge of deploy uitgevoerd.
