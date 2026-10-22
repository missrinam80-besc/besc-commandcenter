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
- [Ecosysteembasis: versies, rechten, migratieverschillen en eerste correctie](docs/wiki/Ecosysteem-basis-en-uitvoering.md)
- [Volledig F0-voorbereidingspakket en besluiten](docs/f0/README.md)
- [F0-uitvoering en DEV-acceptatie](docs/acceptatie/F0-UITVOERING-DEV-20261021.md)
- [F1: gebouwde gedeelde werkstromen en testbewijs](docs/f1/README.md)
- [F1: DEV-uitvoering, schermproeven en resterende afsluitvoorwaarden](docs/acceptatie/F1-DEV-20261022.md)

Persoonlijke Twitchkoppeling is op DEV ingeschakeld; koppelen, ontkoppelen/herkoppelen en annuleren/weigeren zijn door de gebruiker bevestigd. Discord en Bucks bleven behouden. Automatisch verdienen en saldo-overname blijven uit. Zie het [acceptatieverslag en de resterende live controles](docs/acceptatie/PERSOONLIJKE-TWITCHKOPPELING-20261018.md).

Voorbereiding van de centrale verdien-API: een afzonderlijke [controlemodus](docs/contracts/rewards-integration-preview-v1.md) valideert synthetische gebeurtenissen. De [duurzame intake](docs/contracts/rewards-intake-v1.md) bewaart bronclaims met vaste uitkomst, actuele accountcontrole en bescherming tegen herhaalde ontvangst. De basis en de vervolgwijziging voor exacte opaque providerbericht-ID’s zijn op DEV gemigreerd; de gebruiker bevestigde de webdeploy en blokkering van uitgeschakelde intake. Nieuwe invoer gebruikt versie 2, versie 1 is replay-only; historische UUID-ontvangstbewijzen blijven behouden. Bij de laatste bevestigde controle stonden controlemodus, intake en automatisch verdienen uit; dit is geen actuele serveruitlezing. Intake geeft geen XP/Bucks uit en verifieert nog geen providerbewijs. Discord blijft zijn bestaande API gebruiken; website/social, bronadapters, financiële verwerking en saldo-overname volgen afzonderlijk.

De [technische F0-uitvoering op DEV](docs/acceptatie/F0-UITVOERING-DEV-20261021.md) is op 21 oktober 2026 geaccepteerd: 33 historieregistraties hersteld, 117 totaal, de oude 84 behouden, gecontroleerd schema gelijk, webdeploy en meetweergave/CSV door Linda bevestigd. De vijf kennisbankconcepten zijn uitsluitend voorbereid; de oude seed blijft bewust uitgezonderd. Geen voorzittersaccount of nieuwe bevoegdheid toegewezen, geen productieacceptatie of automatische back-up.

Het [F1-pakket](docs/f1/README.md) bevat zes gebouwde en geïsoleerd geteste werkpakketten voor identiteit/mandaat, governancebewijs, toestemming, partnerrollen en interne publicatierevisies. De zes migraties zijn op Cloud DEV uitgevoerd (123 historieregistraties; oude seed uitgesloten), de webrelease is gedeployed en de exacte draaiende image is bevestigd. De voorzittersbinding en gerichte schermproeven zijn uitgevoerd. Zie het [actuele DEV-verslag](docs/acceptatie/F1-DEV-20261022.md) voor resultaten, bewijslagen en nog open afsluitvoorwaarden; de 62 scenario's zijn niet allemaal live afgevinkt. De eigen stagingwebsite en publieke keten volgen in F2.

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
