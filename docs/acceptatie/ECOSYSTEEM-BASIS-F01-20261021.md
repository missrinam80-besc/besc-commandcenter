# Werkpakket F0.1: controle en acceptatie

21 oktober 2026, Europe/Brussels. Opdracht: starten met het eerste werkpakket van het gezamenlijke ecosysteemtraject. Dit verslag beschrijft lokale codecontroles en een alleenlezende Cloud-inspectie. Merge, deployment en DEV-schermacceptatie volgen afzonderlijk.

## Opgeleverd

- [Bronregister, migratieverschillen en releaseprocedure](../wiki/Ecosysteem-basis-en-uitvoering.md).
- [Rechtenmatrix en minimale contracten](../contracts/ecosysteem-basis-v1.md) voor governancebewijs, toestemming, partnerrollen en publieke publicatie; nog niet als live rechten of schema ingevoerd.
- Correctie voor campagne-impressies en klikken in sponsorportal, sponsor- en eventrapporten en hun CSV's. Nul blijft nul; onbekend wordt ontbrekend; gedeeltelijke totalen tonen dekking. Geen schema- of dataconversie.
- Alleenlezende schema-inventaris en lokale scripts voor bronmanifest en verschillenlijst. Geen automatisch repair- of migratiecommando.
- README, wiki en de intakecontractstatus bijgewerkt aan de hand van eerder bevestigde uitvoering.

## Controles

| Controle | Uitkomst |
| --- | --- |
| Volledige Node-testsuite | 970 geslaagd, 0 mislukt, 0 overgeslagen. Inclusief 11 nieuwe controles voor campagnewaarden, gerenderde rapporten, sponsorportal, CSV en exportweigering voor vrijwilliger. |
| Volledige ESLint-controle | Geslaagd. |
| TypeScript zonder uitvoer | Geslaagd. |
| Gegenereerd editorschema en transactiecataloog | Beide check-modus geslaagd, 22 dossiermodellen. Windows-CRLF in het lokale JSON-bestand tijdelijk naar LF omgezet voor de bytevergelijking; daarna oorspronkelijke checkoutbytes hersteld. Geen gegenereerd schema of historische migratie gewijzigd in de diff. |
| Lokale productiebuild | Next.js 16.2.10 met webpack geslaagd, inclusief TypeScript en 36 statische pagina's. Fictieve Supabase-instellingen zoals in CI; geen live credentials gebruikt. |
| Certificaatprobleem tijdens build | Eerste pogingen konden Google-lettertypen niet ophalen. Opgelost door Node de vertrouwde Windows-certificaten te laten gebruiken met `--use-system-ca`; TLS-controle bleef aan. Geen bron- of systeemconfiguratie gewijzigd. |
| Metadata-inventaris Cloud DEV | Read-only transactie; gecontroleerd project sjvzrsmrtcxxtmaxigtn. 118 tabellen met RLS, 143 functies, 1 view, 84 migratieregistraties. |
| Verschillenlijst | 118 Git-migraties, 34 zonder Cloud-registratie, geen Cloud-only versies en geen naamverschillen bij de geregistreerde versies. Alle herkende objectzoekhints aanwezig; geen bewijs van volledige SQL-effectequivalentie. |
| Nieuwste intakefunctie | Bodyfingerprint gelijk aan migratie 20261019221404; browserrollen uitgesloten, service_role toegestaan, lege search_path. |
| Git diff-check | Geen witruimtefouten. |

De lokale build gebruikt webpack om onafhankelijk van de verplaatste dependencycache te bouwen. De bestaande GitHub-workflow blijft de standaard Linux-build met Turbopack en de bestaande PostgreSQL-concurrency- en HTTP-proeven uitvoeren. Die proeven zijn niet allemaal opnieuw lokaal uitgevoerd. Actuele CI-uitkomsten horen bij de PR, niet bij de bovenstaande lokale resultaten.

## Afbakening van het bewijs

De rendertests gebruiken synthetische data en gecontroleerde mocks. Ze bewijzen de gewijzigde weergave en dat de bestaande filters/rolweigering in deze routes behouden blijven; ze bewijzen geen volledige live tenantisolatie of praktijkwerking van alle dashboards. Er is geen account-, saldo-, formulier- of campagnegegeven voor de proef aangemaakt.

De read-only query is op Cloud uitgevoerd, maar geen Cloud-object, policy, migratieregistratie of bedrijfsrij gewijzigd. Geen serverdeploy, botactie, OAuth-toegang, runtimeflag, automatische back-up, saldo-overname of DNS-wijziging uitgevoerd.

De lokale inventaris bevat SHA256 van de ongewijzigde Git-migratiebestanden. Ruwe Cloud-metadata en lokale test/buildlogs blijven buiten de repository. De databasecontrole leest geen secrets of bedrijfsrijen en vervangt geen herstelback-up. Het masterplan en gesynchroniseerde projectbronnen zijn ongewijzigd.

## Resterende stappen

1. Review en groene GitHub-controles voor dit pakket, daarna afzonderlijk mergebesluit.
2. Normale CC-webdeploy na goedgekeurde release. Voor deze correctie geen database-migratie, botdeploy of scopewijziging.
3. Praktijkproef van nul/ontbrekend/gedeeltelijk op beide rapporten, CSV en sponsorportal, inclusief smal scherm en light/dark mode.
4. Per migratie de ontbrekende historieregistratie inhoudelijk beoordelen. Geen bulk repair uitvoeren op basis van objectnamen.
5. De genoemde bevoegdheids- en gegevenskeuzes bevestigen voordat governancebewijs, partnerrollen of publicatie als schemawijziging wordt gebouwd.

F0.1 heeft hiermee een concrete eerste correctie en beoordeelbare vervolgstappen. De volledige F0-poort is nog niet gesloten: historieherstel en formele bevoegdheidskeuzes blijven open.
