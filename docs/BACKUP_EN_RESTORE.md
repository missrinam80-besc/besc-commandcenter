# Backup en restore

Deze gids legt uit hoe je lokaal een veilige databasebackup maakt en hoe dezelfde aanpak later op de VPS of productieomgeving gebruikt wordt.

## 1. Wat wordt geback-upt?

Voor het BESC Command Center zijn er drie soorten gegevens:

- Code: staat in GitHub.
- Configuratie en secrets: staan in `.env.local`, later in `.env.production` of Vercel/VPS-env.
- Databasegegevens: staan in Supabase/PostgreSQL.

GitHub is dus geen databasebackup. GitHub bewaart de code, niet de gebruikers, rollen, sponsors, projecten, events of rapportagedata.

## 2. Veilige afspraken

- Zet echte `.env`-bestanden nooit in Git.
- Bewaar databasebackups niet in Git.
- Maak voor restore-tests eerst een aparte testbackup.
- Voer geen restore uit op productie zonder expliciete bevestiging en recente backup.
- Test restore eerst lokaal of op staging.

## 3. Backupmap lokaal maken

Maak op de D-schijf een lokale backupmap:

```powershell
New-Item -ItemType Directory -Force "D:\BESC\Backups\Command Center"
```

Deze map staat buiten de repository. Daardoor komt ze niet per ongeluk in GitHub terecht.

## 4. Lokale Supabasebackup maken

Zorg eerst dat Docker Desktop draait en dat de lokale Supabase-stack actief is.

Ga daarna in PowerShell naar de projectmap:

```powershell
cd "D:\BESC\Command Center"
```

Maak een schema-backup:

```powershell
pnpm dlx supabase db dump --local -f "D:\BESC\Backups\Command Center\local-schema.sql"
```

Maak een databackup:

```powershell
pnpm dlx supabase db dump --local --data-only --use-copy -f "D:\BESC\Backups\Command Center\local-data.sql"
```

Wat dit betekent:

- `local-schema.sql` bevat de databasestructuur.
- `local-data.sql` bevat de data.
- Secrets uit `.env.local` worden hiermee niet geback-upt.

## 5. Extra backup van lokale env

Maak ook een lokale kopie van je env-bestand:

```powershell
Copy-Item ".env.local" "D:\BESC\Backups\Command Center\.env.local.backup"
```

Bewaar dit bestand veilig. Hierin kunnen geheime sleutels staan.

## 6. Restore-test lokaal

Een restore-test is bewust voorzichtig. De makkelijkste veilige test is:

1. Maak eerst de backups uit stap 4.
2. Controleer dat `local-schema.sql` en `local-data.sql` bestaan.
3. Stop hier als je niet zeker bent dat de huidige lokale database gewist mag worden.

Pas wanneer de lokale database gewist mag worden:

```powershell
cd "D:\BESC\Command Center"
pnpm dlx supabase db reset
```

Daarna staat de database opnieuw op de migratiestaat uit `supabase/migrations`.

Voor een volledige datarestore is `psql` nodig. Die stap voeren we best pas samen uit wanneer we bewust een testmoment kiezen, omdat die data terugschrijft naar de database.

## 7. Productiebackup later

Voor productie zijn er twee mogelijke routes.

### Managed Supabase

Aanbevolen voor de eerste liveversie.

- Gebruik de ingebouwde Supabase backups indien beschikbaar op het gekozen plan.
- Maak daarnaast handmatig dumps voor belangrijke releases.
- Bewaar productiebackups versleuteld of op een afgeschermde plek.

Voor een handmatige productiebackup gebruikt Supabase dezelfde CLI-aanpak, maar met een productie-database-URL:

```powershell
pnpm dlx supabase db dump --db-url "<PRODUCTIE_DATABASE_URL>" -f "D:\BESC\Backups\Command Center\production-schema.sql"
pnpm dlx supabase db dump --db-url "<PRODUCTIE_DATABASE_URL>" --data-only --use-copy -f "D:\BESC\Backups\Command Center\production-data.sql"
```

Zet de productie-database-URL nooit in Git of documentatie.

### Self-hosted Supabase op VPS

Dit kan later, maar vraagt meer beheer:

- automatische dagelijkse databasebackup;
- aparte backup van volumes;
- opslag buiten de VPS;
- periodieke restore-test;
- updateprocedure voor Supabase-containers.

Voor V1 blijft managed Supabase eenvoudiger en veiliger, tenzij er een duidelijke reden is om alles zelf te hosten.

## 8. Minimale backupkalender

- Voor grote wijzigingen: handmatige backup.
- Dagelijks: automatische databasebackup zodra productie live staat.
- Wekelijks: controleren of backups bestaan.
- Maandelijks: restore-test op lokale of stagingomgeving.
- Voor elke VPS-update: backup maken en update pas daarna uitvoeren.

## 9. Checklist

- [ ] Lokale backupmap bestaat.
- [ ] Lokale schema-backup gemaakt.
- [ ] Lokale databackup gemaakt.
- [ ] `.env.local` veilig gekopieerd buiten Git.
- [ ] Restore-test gepland.
- [ ] Productiekeuze gemaakt: managed Supabase of self-hosted.
- [ ] Productiebackupstrategie vastgelegd.
- [ ] Restoreprocedure op staging of lokaal getest.
