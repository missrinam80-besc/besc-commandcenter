# F5.1 — eigen campagnes via de Discordbot

24 oktober 2026. Gebouwd na het voorbereidingspakket in CC PR #122. Dit is code voor afzonderlijke review, geen Cloud-migratie, serverdeploy, scope-toekenning, activering of Discordregistratie.

## Resultaat

`/besc campagne mijn` geeft een privéantwoord met maximaal vijf eigen actuele campagnes en links naar de bestaande CC-campagnepagina. Alleen geaccepteerde, niet-verlopen, niet-ingetrokken eigen deelname met een actueel doel telt mee. Het commando geeft geen inzage in andere deelnemers, metingen, documenten of saldi en haalt geen Twitchgegevens op. Indienen, beoordelen en toestemming blijven in CC.

CC-route: `GET /api/v1/bot/campaigns`, nieuwe afzonderlijke scope `campaigns:own:read`. Alleen `guild_id`, `discord_user_id` en `offset` zijn toegestaan. De organisatie komt uitsluitend uit de bestaande serverclientconfiguratie. Het resultaat bevat alleen `schemaVersion`, `campaigns` (`id`, `title`, `synthetic`, `path`) en `nextOffset`. Antwoorden zijn `no-store`.

## Toegang en gegevensgrens

De route hergebruikt bestaande keyvalidatie, clientverval/intrekking, rate limiter, guildbinding, actuele native Discord-identiteit en organisatiecontrole. Een beperkte machine-RPC controleert opnieuw de Discord-identiteit, bevestigde/niet-verwijderde/niet-geblokkeerde Auth-gebruiker, actief organisatielid, actuele persoonsbinding, deelname, doel en campagne. In-flight actorwijzigingen worden met transactionele leeslocks afgewacht; daarop volgen verse controles onder READ COMMITTED. De route controleert de accountbinding na de eerste bronlezing en haalt de campagneprojectie daarna opnieuw op.

De machinefunctie krijgt uitsluitend service_role-uitvoerrechten via een invokergrens en afgeschermde helpers met lege search_path. Er zijn geen nieuwe tabellen, directe tabelgrants, deelnemers, roles of saldo-/campagneboekingen. De bestaande browser-RPC `f3_my_campaigns` blijft verboden voor service_role. De bot gebruikt alleen HTTPS naar CC, zonder Supabase-client of managementcredential. Er wordt geen gebruikerssessie nagebootst.

Dit is actuele autorisatie tijdens de afhandeling, geen belofte dat een intrekking ná de laatste controle een al geleverd privéantwoord terughaalt. De bot bewaart geen campagnecache; een volgende aanvraag controleert opnieuw.

## Standaard uit en afzonderlijk uitleveren

- CC: `BESC_CAMPAIGNS_BOT_ENABLED=false`. Bij afwezigheid of een andere waarde dan exact `true` wordt geen clientregister geparsed of store geconstrueerd.
- De bestaande F3-flags voor proef en echte campagnes bepalen daarnaast welke campagnes mogen verschijnen. Officiële Twitch-ophaling blijft onafhankelijk.
- Bot: `BESC_CAMPAIGN_COMMANDS_ENABLED=false`. Het nieuwe command verschijnt alleen in de expliciet ingeschakelde definitie. De runtime sluit het command bij ontbrekende scope; registratie controleert de scope voordat zij Discord aanroept.
- De commandregistratie blijft standaard een voorbeeld. Alleen een apart vrijgegeven `--apply` werkt het eigen `/besc` bij; overige commands worden niet vervangen.
- Website, Caddy, tickets, slots, Bucks en hun bestaande instellingen blijven buiten dit pakket. De bot krijgt geen extra gatewayintents of worker.

## Migratie en releasevoorbereiding

Lokaal gegenereerd met de Supabase-CLI: `20261024150408_f5_own_campaigns_bot.sql`. Alleen drie begrensde functies; geen seed of bestaande functiebody wordt vervangen. [Releasemanifest](../../ops/f5-own-campaigns-release-manifest.json) bevat hashes en grenzen. De laatst operatorbevestigde Cloud DEV-historie was 133; alleen als een nieuwe voorcontrole die baseline bevestigt, zou deze ene migratie tot 134 registraties leiden. Er is nu geen Cloudcontrole of toepassing uitgevoerd.

CC en bot krijgen afzonderlijke PR’s, imagebouwen en uitrolpakketten. Daarna volgen eventuele afzonderlijke vrijgaven voor migratie, beide serverimages, scopes, flags en commandregistratie. Eerst deploy met flags uit. Een terugval sluit de flags en gebruikt de bewaarde images/configuratie; geen neerwaartse SQL, gegevensverwijdering of saldoherstel.

## Gerichte verificatie en bewijsgrens

Lokaal uitgevoerd: CC-API/default-uit/toegangschecks plus de bestaande beperkte bot-API-regressie; één geïsoleerde PGlite-databaseketen met eigen/ander account, organisatiegrens, ingetrokken/verlopen/niet-geaccepteerde deelname, ingetrokken doel, gesloten campagne en functie-/tabelgrants. De SQL-proef is ook beschikbaar voor native PostgreSQL 17 met een echte lock-wachttijd en tijdens die wachttijd gecommitteerde deelname-intrekking. Een aparte F5-CI-job voert uitsluitend die databaseproef uit.

Bot: gerichte contract-, privéantwoord-, veilige link/titel- en default-uit-controles, samen met de bestaande gecombineerde opt-incontrole. TypeScript, gerichte CC-lint en de botproductiebuild zijn lokaal gecontroleerd. Volledige appacceptatie, echte Discordinteracties, providerwerking, live rolwissels en serverterugval zijn niet uitgevoerd. Native CI-uitkomst wordt in de PR gecontroleerd en is geen Cloud- of productieacceptatie.

Geen echte campagne, deelnemer, clientcredential of scope is aangemaakt of gewijzigd. Eerdere F0–F4-openings- en productievoorwaarden blijven staan.
