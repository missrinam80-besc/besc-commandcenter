# Technical Agent: tweewegkoppeling op DEV

## Reikwijdte

De bestaande BESC Technical Agent v1 ontvangt een opdracht vanuit `/app/ai-hub/agents`
en schrijft via MCP één evaluatie, voorstel of concept terug. Alleen dossierkoppen
(project of event) worden gedeeld. Documentinhoud en een volledige technische
evaluatie van het platform zijn hiermee nog niet beschikbaar. Accepteren van een
resultaat verandert geen dossier. Een ontvangstbevestiging van de agentdienst is
geen bewijs van een teruggeschreven resultaat.

## Uitrolvolgorde

1. Laat de GitHub-kwaliteitscontrole slagen en lever de code via GitHub.
2. Laat de bestaande `Build DEV Docker Image`-workflow de image bouwen. Deze
   workflow publiceert `:dev` en de exacte commit-SHA als tag. Gebruik die SHA
   voor verificatie; het etiket `dev` kan later naar een andere versie wijzen.
3. Pas `supabase/migrations/20261006051457_commandcenter_agent_jobs.sql` uitsluitend
   op de bevestigde DEV Supabase Cloud-database toe. De bestaande MCP OAuth- en
   dossiermigraties moeten aanwezig zijn. Geen databasewijziging tijdens de build.
4. Trek de gebouwde image op de server binnen met de bestaande uitrolprocedure.
   Bevestigde server: `/opt/besc-dev/command-center`, `docker-compose.server.yml`,
   servergeheimen in `.env.production`. Controleer de nieuwe route met de feature
   nog uitgeschakeld voordat je de verbinding activeert.
5. Voeg het token en kanaal uitsluitend op de server toe. Een Workspace Agent
   toegangstoken is nodig; een gewone OpenAI Platform API-sleutel is niet geschikt.
   Houd tokens buiten Git, image, chat, terminalgeschiedenis en logbestanden.
6. Activeer de feature pas nadat de migratie is gecontroleerd. Geef de bestaande
   ChatGPT-verbinding opnieuw expliciet toestemming voor de gecombineerde scope
   `commandcenter:read agent_results:write`. Bestaande leesrechten blijven alleen
   lezen. Zet `COMMANDCENTER_MCP_DATA_STATE=ready` uitsluitend als de DEV-bronnen
   werkelijk zijn vrijgegeven; dit is geen technische truc om testdata te omzeilen.
7. Voer één afgesproken DEV-proef uit: opdracht opslaan, bewust verzenden, resultaat
   teruglezen, audit controleren, resultaat beoordelen en vaststellen dat het
   oorspronkelijke dossier niet is veranderd. Geen automatische reeks agentruns.

## Serverinstellingen

```dotenv
COMMANDCENTER_AGENT_RESULTS_ENABLED=false
BESC_TECHNICAL_AGENT_CHANNEL_ID=agtch_6ac48b6b92a08191b06bb6ec50342498
BESC_WORKSPACE_AGENT_ACCESS_TOKEN=
```

Het kanaal hoort bij de bestaande agent
`agt_6ac27fb6af208191a789d9e3ba077ef6`. De feature staat standaard uit. Herstart
de webcontainer via de bestaande DEV-procedure nadat runtime-instellingen zijn
gewijzigd. Een opgeslagen token alleen start geen agentrun.

## Verborgen tokeninvoer via Termius

`scripts/besc-dev-agent-token.py` wordt via deze GitHub-versie geleverd. Het staat
niet in `/root` totdat het daar bewust uit de gecontroleerde GitHub-commit is
opgehaald. Gebruik dezelfde commit-SHA als de geslaagde imagebuild; haal het script
uit die commit zonder de servercheckout of uitrolbestanden te overschrijven.

De helper is voor uitvoering op de Linux-host, niet in de webcontainer. Eerst:

```sh
python3 /root/besc-dev-agent-token.py --check
```

Na controle kan dezelfde opdracht zonder `--check` het token met verborgen invoer
opslaan. De helper bewaart eigenaar en modus 0600, controleert dat de configuratie
buiten Git blijft, weigert dubbele instellingen of een bestaand token en vervangt
het bestand atomair. Hij activeert de feature niet, herstart niets en doet geen
API-aanroep. Een ontbrekend bestand betekent dat de GitHub-helper nog niet naar
dat pad is opgehaald; herhaal dan niet dezelfde opdracht.

## Kosten en grenzen

Deze private repository gebruikt bestaande GitHub Actions. Builds kunnen het
inbegrepen tegoed verbruiken en afhankelijk van de accountlimieten extra kosten
veroorzaken. Er wordt geen nieuw abonnement toegevoegd.

Elke bewuste agentuitvoering kan betaalde werkruimtecredits verbruiken bovenop
ChatGPT Business. Het verzendformulier toont daarom bij iedere uitvoering een
kostenmelding. Het Command Center kan het actuele kredietsaldo of de kostenlimiet
niet controleren. Deze koppeling koopt geen credits en schakelt geen automatische
aankoop in. Voor overige agents zijn nog aparte kanaal- en acceptatiecontroles nodig.

## Lokale controles

```sh
pnpm test
pnpm lint
pnpm exec tsc --noEmit
python3 tests/test_besc_dev_agent_token.py
```

De agenttests gebruiken synthetische fixtures en PGlite voor rechten, bronversies,
idempotentie en audit. Ze bewijzen geen live API-run, DEV-migratie of MCP-schrijfactie.
