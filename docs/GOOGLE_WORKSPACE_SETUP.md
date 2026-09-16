# Google Workspace-integratie instellen

Deze integratie gebruikt Google Workload Identity Federation. De app logt dus niet in met een gewoon Google-wachtwoord, maar ruilt een Vercel OIDC-token om voor tijdelijke Google API-toegang.

## Huidige lokale waarden

De app gebruikt lokaal deze variabelen uit `.env.local`:

```env
GOOGLE_CLOUD_PROJECT_ID=besc-command-center
GOOGLE_CLOUD_PROJECT_NUMBER=154027614837
GOOGLE_WORKLOAD_IDENTITY_POOL_ID=besc-vercel
GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=besc-vercel
GOOGLE_SERVICE_ACCOUNT_EMAIL=besc-command-center@besc-command-center.iam.gserviceaccount.com
```

De foutmelding:

```text
The target service indicated by the "audience" parameters is invalid.
```

betekent dat Google dit doel niet vindt of niet actief ziet:

```text
projects/154027614837/locations/global/workloadIdentityPools/besc-vercel/providers/besc-vercel
```

## Controle in Google Cloud

1. Open Google Cloud Console.
2. Selecteer project `besc-command-center`.
3. Open `IAM & Admin`.
4. Open `Workload Identity Federation`.
5. Controleer of er een pool bestaat met ID:

```text
besc-vercel
```

6. Open die pool.
7. Controleer of er een provider bestaat met ID:

```text
besc-vercel
```

8. Controleer dat de pool en provider niet disabled zijn.

## Als beide actief lijken

Controleer dan de echte resource name. Let op: Google toont soms een naam/label en een technische ID. De app heeft de technische ID nodig.

Open rechtsboven in Google Cloud de Cloud Shell en voer uit:

```bash
gcloud iam workload-identity-pools describe besc-vercel \
  --location=global \
  --project=besc-command-center \
  --format="yaml(name,state,disabled)"
```

Voer daarna uit:

```bash
gcloud iam workload-identity-pools providers describe besc-vercel \
  --workload-identity-pool=besc-vercel \
  --location=global \
  --project=besc-command-center \
  --format="yaml(name,state,disabled,issuerUri,allowedAudiences,attributeMapping,attributeCondition)"
```

De `name` van de provider moet eindigen op:

```text
projects/154027614837/locations/global/workloadIdentityPools/besc-vercel/providers/besc-vercel
```

Als het projectnummer, de pool-ID of provider-ID anders is, pas dan `.env.local` aan.

De provider moet minstens deze issuer gebruiken:

```text
https://oidc.vercel.com/besc-s-projects
```

Als `allowedAudiences` is ingevuld, moet deze waarde toegelaten zijn:

```text
https://vercel.com/besc-s-projects
```

De lokale Vercel-token gebruikt als subject:

```text
owner:besc-s-projects:project:besc-command-center:environment:development
```

Als er een `attributeCondition` ingesteld is, moet die subject of de gemapte attributen hiermee overeenkomen.

## Als de naam anders is

Pas dan lokaal `.env.local` aan:

```env
GOOGLE_WORKLOAD_IDENTITY_POOL_ID=<juiste-pool-id>
GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=<juiste-provider-id>
```

Herstart daarna de webapp-container.

## Als de pool/provider nog niet bestaat

Maak in Google Cloud een Workload Identity Pool en Provider aan voor Vercel OIDC.

Gebruik als issuer:

```text
https://oidc.vercel.com/besc-s-projects
```

De exacte subject/audience-regels moeten overeenkomen met het Vercel-project `besc-command-center` en de environment `development` of `production`.

## Serviceaccountrechten

Het serviceaccount:

```text
besc-command-center@besc-command-center.iam.gserviceaccount.com
```

moet via Workload Identity toestemming krijgen om geïmpersoneerd te worden.

Daarna moet dit serviceaccount toegang hebben tot:

- de gedeelde Drive;
- de rootmap;
- de gebruikte Google Docs-templates;
- de Google Calendar.

## Lokale test

Controleer eerst of de lokale Vercel OIDC-token nog geldig is. Een lokaal opgehaalde token is tijdelijk. Is die verlopen, haal dan een nieuwe op.

Veilige werkwijze:

1. Maak eerst een kopie van `.env.local`.
2. Haal daarna de Vercel development-variabelen opnieuw op.
3. Controleer of je lokale extra waarden, zoals Discord, nog aanwezig zijn.
4. Herstart de webapp-container.

Gebruik:

```powershell
Copy-Item .env.local .env.local.backup
pnpm dlx vercel env pull .env.local --yes --environment=development
```

Let op: `vercel env pull` kan `.env.local` volledig vervangen. Voeg lokale waarden die niet in Vercel staan daarna opnieuw toe.

Na correctie:

1. Herstart de webapp-container.
2. Ga naar `http://localhost:3001/app/integraties`.
3. Klik opnieuw op `Verbinding testen` bij Google Workspace.
