# BESC Command Center

Interne werkplek voor BESC vzw met ledenbeheer, planning, projecten, events, campagnes, content, sponsors, communicatie, rapportage, social inzichten en portalen.

## Documentatiewiki

Open de [BESC Command Center-wiki](docs/wiki/README.md) voor handleidingen, integraties, agents, serverbeheer, importtemplates en historische uitrolnotities.

Rollenbeheer, bestuursfuncties en portaalprofielen staan in [Rollen en profielen](docs/wiki/Rollen-en-profielen.md).

## Lokale ontwikkelomgeving

De aanbevolen lokale setup draait op Windows met Docker Desktop en lokale Supabase:

1. Werk vanuit `D:\BESC\Command Center`.
2. Vul `.env.local` op basis van `.env.docker.example`.
3. Start Supabase lokaal.
4. Start de webapp met Docker Compose.
5. Open de app op `http://localhost:3001`.

Gebruik `docs/DOCKER_VPS_SETUP.md` voor de volledige beginnershandleiding.

## Configuratie

Belangrijke gidsen:

- `docs/SUPABASE_SETUP.md`
- `docs/GOOGLE_WORKSPACE_SETUP.md`
- `docs/YOUTUBE_INTEGRATION_SETUP.md`
- `docs/TWITCH_INTEGRATION_SETUP.md`
- `docs/META_INTEGRATION_SETUP.md`
- `docs/EERSTE_RELEASE_CHECKLIST.md`
- `docs/V1_CLEANUP_AUDIT.md`

Secrets horen nooit in Git. Gebruik lokaal `.env.local` en op de DEV-server de afgeschermde `.env.production`.

## Integraties beheren

Bestuur en beheerders gebruiken één overzicht op `/app/integraties`. Hier staan Google Workspace, Gmail-configuratie en de geregistreerde social accounts. Vercel AI Gateway, OpenAI en Claude maken geen deel uit van deze integratiepagina en kunnen er niet worden geregistreerd. Een geregistreerde verbinding of aanwezige serverconfiguratie bewijst nog geen werkende API-koppeling.

### Google Workspace en Gmail

**Verbinding testen** leest de ingestelde gedeelde Drive, hoofdmap, agenda en templates voor notulen, sponsorrapport en eventdraaiboek. Het overzicht toont de laatste teststatus en links naar gevonden bronnen. De Google-toegangsrechten blijven gelden. De sponsor-pitchdecktemplate heeft een afzonderlijke configuratiestatus.

Workspace gebruikt `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_OAUTH_USER_EMAIL`, `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_SHARED_DRIVE_ID`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `GOOGLE_CALENDAR_ID` en de `GOOGLE_TEMPLATE_*_ID`-variabelen. Gmail gebruikt dezelfde OAuth-configuratie en `GOOGLE_GMAIL_SENDER`; de afzender moet door het gekoppelde Google-account toegestaan zijn. Zie [Google Workspace instellen](docs/GOOGLE_WORKSPACE_SETUP.md).

Gmail-concepten worden vanuit een dossier op **E-mailcommunicatie** gemaakt. Een verbindingstest verzendt geen e-mail. De bestaande goedkeurings- en verzendstappen blijven afzonderlijk; social synchronisatie publiceert geen berichten.

### Social accounts

Gebruik **Account registreren** voor accountmetadata en **Beheren** voor het bestaande account, automatische synchronisatie, interval, bewaartermijn en interne quota. Registratie alleen koppelt het platform nog niet. Gebruik de OAuth-koppelactie om toegang te geven; daarna haalt **Nu synchroniseren** de beschikbare metingen op. De lijst toont verbindingsstatus, laatste synchronisatie, automatische planning, quota en eventuele foutmelding.

| Platform | Gebruik en configuratie |
| --- | --- |
| YouTube | Kanaal- en videometingen; `GOOGLE_YOUTUBE_CLIENT_ID` en `GOOGLE_YOUTUBE_CLIENT_SECRET`. [Instellen](docs/YOUTUBE_INTEGRATION_SETUP.md) |
| Facebook en Instagram | Pagina- en accountinzichten via Meta; `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION`. [Instellen](docs/META_INTEGRATION_SETUP.md) |
| Twitch | Live-status en kanaalplanning; `TWITCH_CLIENT_ID` en `TWITCH_CLIENT_SECRET`. [Instellen](docs/TWITCH_INTEGRATION_SETUP.md) |
| Threads, LinkedIn, TikTok en X | Geen bewezen V1-koppeling. Threads vereist afzonderlijke OAuth/appvoorwaarden, LinkedIn producttoegang, TikTok goedkeuring/audit en X een afzonderlijk budgetbesluit. Registratie betekent geen operationele ondersteuning. |

De OAuth-routes blijven onder `/app/integraties/social/{youtube,meta,twitch,threads}/{start,callback}` zodat bestaande callbackconfiguraties behouden blijven. De oude overzichts-URL `/app/integraties/social` verwijst door naar `/app/integraties`, met behoud van accountselectie en actiemeldingen.

### Planning en logs

Op DEV controleert `besc-social-sync.timer` iedere 15 minuten welke ingeschakelde accounts aan de beurt zijn. Het accountinterval bepaalt wanneer een account daadwerkelijk wordt gesynchroniseerd. `ops/run-social-sync.sh` roept de beveiligde route aan met `CRON_SECRET`; `--check-auth` controleert weigering zonder token en `--dry-run` bekijkt verschuldigde accounts zonder een sync uit te voeren. Handmatige runs blijven mogelijk als automatische synchronisatie uitstaat.

**Logs** opent `/app/integraties/logs`: de laatste 50 social synchronisatieruns, met account, tijd in Europe/Brussels, aanleiding, status, verwerkte aantallen en fouten. Dit zijn synchronisatielogs, geen volledig server- of Gmail-logboek. **Socialrapportage** opent de verzamelde metingen op `/app/rapportage/social`. Bij een fout: controleer eerst de run en accountstatus, daarna de platformrechten/configuratie en koppel zo nodig opnieuw.

### Sleutels en kosten

Google-appgeheimen en configuratie staan uitsluitend in afgeschermde servervariabelen; social OAuth-tokens worden door de bestaande callbacks versleuteld in Supabase Vault opgeslagen. Het integratieformulier bevat geen toegangstokens. Alleen metadata en synchronisatieresultaten worden in de gebruikelijke app-tabellen opgeslagen. Deel tokens niet in chat, README of Git.

Deze samengevoegde pagina activeert geen nieuwe betaalde dienst of agentrun. Bestaande platformquota en abonnementen blijven gelden; nieuwe platformtoegang of een apart API-budget vereist een afzonderlijk besluit.

## Kwaliteitscontrole

Gebruik voor afgeronde wijzigingen minimaal:

```powershell
pnpm test
pnpm run lint
pnpm run build
```

Voor de productiecontainer:

```powershell
docker build --target runner -t commandcenter-web:production-check .
```
