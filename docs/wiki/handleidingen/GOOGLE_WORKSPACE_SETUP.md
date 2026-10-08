# Google Workspace-integratie instellen

De Docker-devserver gebruikt OAuth met een speciaal Google Workspace-account. Er is geen service-accountkey, Vercel OIDC of Workload Identity Federation nodig.

## Serverconfiguratie

Vul de volgende server-only variabelen in op BESCSRVDEV. Gebruik bij voorkeur Docker secrets of een beveiligde environment-configuratie; zet deze waarden nooit in `NEXT_PUBLIC_*` of in Git.

```env
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REFRESH_TOKEN=...
GOOGLE_OAUTH_USER_EMAIL=google-account@jouwdomein.be
GOOGLE_CLOUD_PROJECT_ID=besc-command-center
GOOGLE_SHARED_DRIVE_ID=
GOOGLE_DRIVE_ROOT_FOLDER_ID=
GOOGLE_CALENDAR_ID=
GOOGLE_TEMPLATE_MINUTES_ID=
GOOGLE_TEMPLATE_SPONSOR_REPORT_ID=
GOOGLE_TEMPLATE_EVENT_ID=
GOOGLE_TEMPLATE_SPONSOR_PITCHDECK_ID=
GOOGLE_GMAIL_SENDER=google-account@jouwdomein.be
```

De refresh token is server-only en mag nooit in Git of in de browser terechtkomen. Gebruik bij voorkeur Docker secrets of een beveiligde environment-configuratie.

## Google Cloud en Workspace

1. Selecteer project `besc-command-center` in Google Cloud.
2. Activeer Drive API, Docs API, Slides API, Calendar API en Gmail API.
3. Maak in Google Cloud bij **APIs & Services → Credentials** een OAuth-client aan voor een desktopapplicatie.
4. Autoriseer met het speciale Workspace-account minimaal Drive, Docs, Slides, Calendar en Gmail Compose.
5. Geef dit account toegang tot de Shared Drive, rootmap, Docs/Slides-templates en kalender.
6. Gebruik voor Gmail een afzender die overeenkomt met `GOOGLE_GMAIL_SENDER`.

## Eenmalige refresh token maken

1. Zet de OAuth-clientgegevens tijdelijk in je lokale PowerShell-sessie:

```powershell
$env:GOOGLE_OAUTH_CLIENT_ID="..."
$env:GOOGLE_OAUTH_CLIENT_SECRET="..."
```

2. Start vanuit de projectmap:

```powershell
node scripts/google-oauth-refresh-token.mjs
```

3. Open de URL die het script toont en meld aan met het speciale Workspace-account.
4. Kopieer de regel `GOOGLE_OAUTH_REFRESH_TOKEN=...` uit de terminal naar de beveiligde serveromgeving. Deel deze token niet in chat en commit hem niet.
5. Verwijder daarna de tijdelijke PowerShell-variabelen of sluit het venster.

## Functionele controle

Na het invullen van de serverconfiguratie:

1. Herstart de app-container op BESCSRVDEV.
2. Open `https://cc-dev.belgianstreamerscommunity.be/app/integraties`.
3. Klik bij Google Workspace op `Verbinding testen`.
4. Controleer daarna afzonderlijk Drive-maptoegang, Calendar-sync en het aanmaken van een Gmail-concept.

Bij een fout controleer je eerst de serverlog op de foutmelding, zonder tokens of secrets te delen. De meest voorkomende oorzaken zijn een verlopen of ingetrokken refresh token, ontbrekende API-activering of ontbrekende Drive-/Calendar-rechten.

## Lokale voorbereiding

Voor lokale tests mag dezelfde Cloud Supabase- en Google-configuratie in `.env.local` worden gebruikt. Start daarvoor alleen de applicatiecontainer; een lokale Supabase-stack is niet nodig. Er is geen Vercel CLI of Vercel-token nodig.
