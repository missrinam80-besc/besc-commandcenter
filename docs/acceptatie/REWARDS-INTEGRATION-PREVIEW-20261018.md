# Centrale verdien-API — lokale previewverificatie

18 oktober 2026. Branch `codex/rewards-integration-preflight`, basis CC-main `6756a80315fd4c54e1c6f47996e35a39edf60436`. Scope: synthetische controlemodus, geen daadwerkelijke activiteitverwerking of puntentoekenning. Zie het [contract](../contracts/rewards-integration-preview-v1.md).

## Geslaagde controles

- Volledige testsuite: **935 geslaagd**, geen mislukt of overgeslagen. Daarvan 20 nieuwe tests voor de preview-API.
- Authenticatie, afzonderlijke scopes, bron-/broadcasterbinding, intrekking/verval en strikte registervalidatie getest. Bestaande Discordtokens en vrije bedragen/organisatie-/userkeuzes worden geweigerd.
- Preview uit: 404 zonder configuratielezing. Preview aan: nooit award-, opslag-, account- of providerbewijsclaim. Alleen synthetische follow-/cheerfeiten; toekomstige activiteitsoorten worden geweigerd.
- Veldvolgorde en client-/bronrecordrotatie behouden sleutels; gewijzigde feiten veranderen de inhoudshash. De vaste hashvector is aanvullend onafhankelijk met Python SHA256 gecontroleerd. Er is geen opslag of financiële deduplicatieclaim.
- 8 KiB bodygrens, strikte UTF-8, leesdeadline/readerannulering, afgebroken request, exacte tijdgrenzen, rate limiting en veilige foutprojectie getest.
- `pnpm run lint`: geslaagd.
- `pnpm exec tsc --noEmit`: geslaagd.
- Volledige productiebuild met `pnpm exec next build --webpack`: geslaagd, inclusief de nieuwe dynamische API-route.
- Lokale HTTP-proeven tegen de gebouwde app: uitgeschakeld 404; ingeschakeld authenticatie vereist; beperkte config; synthetische validatie zonder award; identieke retry geeft identieke hashes; verkeerde broadcaster, vrije Bucks en liveclaim worden geweigerd; geen activity-write-route in preview. Beide tijdelijke servers gestopt en gesloten poorten gecontroleerd.
- `git diff --check`: geslaagd.

## Omgeving en grenzen

De lokale worktree gebruikt een gedeelde `node_modules`-junction. Daarom is de build met Webpack uitgevoerd; de repositoryconfiguratie is niet veranderd. Alleen voor de font-download gebruikte Node de Windows-systeem-CA (`--use-system-ca`), met TLS-validatie aan. Lokale appinstellingen waren fictief (`example.invalid`); de HTTP-preview heeft geen database- of externe netwerkafhankelijkheid. Tijdelijke willekeurige previewtokens bestonden uitsluitend in de testprocessen, niet in Git, uitvoer of configuratiebestanden.

Geen Cloud-migratie, DEV-configuratie, scope, botservice, Streamer.bot-instelling, StreamElements-saldo of automatische verdienregel gewijzigd. De nieuwe previewflag blijft in het voorbeeld uit. De documentatie van de eerder door de gebruiker geaccepteerde Twitchkoppeling is mee bijgewerkt; die terugmelding is geen test van deze nieuwe preview op DEV.

Nog niet gebouwd/bewezen door dit werkpakket: echte bronadapter en providerbewijs, actuele account-/lidmaatschapsresolutie voor rewards, duurzaam ontvangstregister, financiële deduplicatie/atomaire boeking, quota, bronrevisies, bridge/herstel, website-/socialadapters en saldo-overname. De volgende stap is de duurzame CC-intake met die controles, gevolgd door geïsoleerde database-/concurrencytests. Live activering en uiteindelijke StreamElements-omschakeling blijven afzonderlijke stappen.
