# BESC Command Center

Interne werkplek voor BESC vzw: dossiers, planning, events, community, sponsors, content, financiën, communicatie, rapportage en portalen.

## Documentatie

De [documentatiewiki](docs/wiki/README.md) is de bron voor de werkwijze en het beheer:

- [Dossiers aanmaken en bewerken](docs/wiki/Dossiers-aanmaken-en-bewerken.md)
- [Rollen en profielen](docs/wiki/Rollen-en-profielen.md)
- [Integraties](docs/wiki/Integraties.md)
- [Persoonlijke Twitch- en Discordkoppelingen](docs/wiki/Persoonlijke-accountkoppelingen.md)
- [Ontwikkeling en beheer](docs/wiki/Ontwikkeling-en-beheer.md)
- [Release en acceptatie](docs/wiki/Release-en-acceptatie.md)

Persoonlijke Twitchkoppeling is op DEV ingeschakeld; koppelen, ontkoppelen/herkoppelen en annuleren/weigeren zijn door de gebruiker bevestigd. Discord en Bucks bleven behouden. Automatisch verdienen en saldo-overname blijven uit. Zie het [acceptatieverslag en de resterende live controles](docs/acceptatie/PERSOONLIJKE-TWITCHKOPPELING-20261018.md).

Voorbereiding van de centrale verdien-API: een afzonderlijke, standaard uitgeschakelde [controlemodus voor integratiebronnen](docs/contracts/rewards-integration-preview-v1.md) valideert uitsluitend synthetische gebeurtenissen. Deze maakt geen ontvangstregister, accountmatch of puntenboeking. Discord blijft zijn bestaande API gebruiken; website/social en Streamer.bot-verwerking volgen afzonderlijk.

## Ontwikkelen

De acceptatieomgeving is de DEV-VPS met Cloud Supabase. Een lokale Supabase-omgeving is optioneel en staat los van Cloud DEV. Gebruik de [ontwikkelhandleiding](docs/wiki/handleidingen/DOCKER_VPS_SETUP.md) voor lokale inrichting; kopieer geen databaseback-ups naar Git.

Installeer afhankelijkheden met de vastgelegde pnpm-versie en `pnpm install --frozen-lockfile`. Configureer lokale omgevingsvariabelen via de voorbeeldbestanden. Secrets blijven buiten Git.

## Kwaliteitscontrole

```powershell
pnpm test
pnpm run lint
pnpm run build
node scripts/build-dossier-editor-schema.cjs --check
node scripts/build-dossier-editor-migration.cjs --check
```

Uitrol: GitHub → geslaagde imagebouw → eventuele Cloud DEV-migratie → serverdeploy → live controle. Zie de [DEV-handleiding](docs/wiki/handleidingen/DEV_DEPLOYMENT.md).
