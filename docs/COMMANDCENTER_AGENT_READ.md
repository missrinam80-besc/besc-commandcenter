# Command Center-leeskoppeling en verbeteronderzoek

## Gebouwde eerste stap

Afzonderlijke MCP-route `/mcp/commandcenter`, met eigen OAuth-scope `commandcenter:read`, eigen sleutel, toestemmingen en tokentabellen. De bestaande social-koppeling blijft ongewijzigd. Alleen actieve beheerders en bestuursleden kunnen deze eerste versie toestaan; iedere aanvraag controleert de actuele gebruiker en het lidmaatschap. De server kiest de BESC-organisatie. Agents kunnen geen organisatie-ID, tabel of willekeurige velden invoeren.

De eerste versie biedt drie leesacties:

- `get_commandcenter_capabilities`: de 21 ondersteunde dossiertypen, geselecteerde velden en datastatus.
- `read_commandcenter_records`: dossierkoppen, type/status, relevante datums en relaties, record-ID, versie en modulelink. Maximaal 100 rijen per pagina. Geen contactgegevens, vrije notities, mailinhoud, financiële bedragen of integratiegeheimen. Geen volledige dossierinhoud.
- `get_commandcenter_optimization_brief`: een concreet protocol en voorstelvelden voor verbeteronderzoek. Geen registratie, opdrachtverzending of wijziging.

## Testdata en opschoning

`COMMANDCENTER_MCP_DATA_STATE=test` is standaard. De capability- en verbeteracties werken, maar dossierreads stoppen vóór een databasequery. Pas na gecontroleerde opschoning én readback mag een beheerder `ready` instellen. Dit is een expliciete vrijgave, geen automatische detectie dat inhoud echt is. Nieuwe synthetische data mag later niet zonder classificatie opnieuw in deze omgeving worden ingevoerd.

Een volledige database-reset is niet geschikt: accounts, rollen, templates of integraties kunnen verdwijnen. Maak een exact tenantgebonden wismanifest, back-up buiten Git en herstelproef. Wis geselecteerde rijen en afhankelijkheden in één transactie, zonder TRUNCATE CASCADE. Behoud schema, Auth, Storage en werkende configuratie. De goedgekeurde opschoning is op 4 oktober 2026 uitgevoerd: 182 testrijen zijn verwijderd na een gerichte back-up en herstelproef. Accounts, rechten en koppelingen zijn behouden. Een toekomstige synchronisatie kan nieuwe socialmetingen toevoegen.

## Verbeterrol voor de negen agents

Management beoordeelt voorstellen voor scope en prioriteit. Project onderzoekt project-/taakflows; Content de redactionele flows; Creative briefs en assetoverdracht; Eventplanning eventflows; Finance & Assets financiële en assetprocessen; Technical technische werking, toegang en uitvoerbaarheid; Reporting definities, volledigheid en meetbaarheid; Commerce shop- en partnerflows. De persoonlijke assistent bundelt overlap en bereidt de overdrachten voor.

Ieder voorstel bevat domeinagent, module, probleem, herhaalbare evidence, classificatie van gebruikte gegevens, gewenst gedrag, acceptatiecontrole, voorgestelde prioriteit, afhankelijkheden en benodigde beslissing. Gebruik testrecords uitsluitend voor functionele controles; trek er geen operationele BESC-conclusies uit. Technische en UX-problemen kunnen wel met schema-, code-, test- of browserbewijs worden gemeld. Een voorstel of toolbrief bewijst geen werkelijk verstuurde agentopdracht. Automatische dispatch is nog niet gebouwd.

## DEV activering

1. Review en toepassen van de nieuwe migratie. Geen bestaande social-grants/scopes aanpassen.
2. De zes `COMMANDCENTER_MCP_*`-variabelen server-side configureren volgens `.env.example`; eigen signing key, geen gedeeld service-/cron-/socialgeheim.
3. Op DEV deployen. Geen productieactie in deze stap.
4. Resource- en issuer-discovery, 401 zonder token, OAuth PKCE/consent en intrekking controleren.
5. In ChatGPT een afzonderlijke app verbinden met `https://cc-dev.belgianstreamerscommunity.be/mcp/commandcenter`. Bij die stap wordt concreet toestemming gevraagd voor deze nieuwe dossierleestoegang.
6. Testmodus live bewijzen, vervolgens opschoning/readback en bewuste vrijgave. De app aan geselecteerde agents koppelen met uitsluitend de drie leesacties.

De code is lokaal gebouwd en getest (254 tests en productiebuild). Migratie 20261004202223 is op 4 oktober 2026 op Cloud DEV toegepast en onafhankelijk gecontroleerd: beide nieuwe tabellen hebben RLS en uitsluitend servertoegang, de functie is SECURITY INVOKER en alleen voor service_role uitvoerbaar. Bestaande openbare tabelkolommen zijn behouden; de nieuwe tabellen zijn leeg. Deployment, OAuth-grant en ChatGPT-koppeling moeten daarna afzonderlijk worden bewezen.

## Grenzen

Paginering is ondertekend en gebonden aan gebruiker, organisatie, entiteit, zoekterm en paginagrootte, en verloopt na een uur. De lezing is geen databasesnapshot: tussentijdse wijzigingen kunnen records verplaatsen; vergelijk recordversies opnieuw voor een voorstel. De limiter werkt per proces; meerdere servers vereisen een gedeelde gatewaylimiet. Service-role blijft uitsluitend op de server en leest pas na managercontrole, met vaste tenant- en kolomfilters. RLS op de OAuth-tabellen wordt niet geopend voor eindgebruikers.

Bronnen: [OpenAI MCP/plugins](https://learn.chatgpt.com/docs/plugins), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase read-only schemaquery](https://supabase.com/docs/reference/api/v1-read-only-query).
