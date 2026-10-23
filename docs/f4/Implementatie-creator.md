# F4 - eerste creator-mijlpaal

Status: lokaal gebouwd; geen Cloud-migratie, deploy, toegangstoekenning of activering uitgevoerd. Dit is niet heel F4. De historische voorbereiding en 46 geplande acceptatiegevallen blijven afzonderlijk bewaard. De bronvalidator controleert de vastgelegde Git-baseline.

## Gebouwd

- Mijn BESC: eigen concept, actuele doeltekst, persoonlijke instemming per veld, indienen en intrekken. Identiteit en organisatie worden door de server bepaald. Eigen toegang maakt niemand intern CC-lid.
- CC: onderbouwde eigen toegang met einddatum, onafhankelijke beoordeling en aparte vrijgave. Bestaande F1-doelteksten, toestemmingen, taakrollen en audit worden hergebruikt. Concepten vervangen een vrijgegeven versie pas na review en vrijgave.
- Afgeschermde creatorindex en detail, met zoeken en filters. Alleen expliciet vrijgegeven, goedgekeurde en nog geldige versies. Ongekozen velden ontbreken in het publieke contract; interne notities en identiteitssleutels worden niet doorgegeven.
- Optionele afbeelding via een bestaande BESC-mediareferentie; geen nieuwe uploadmogelijkheid. Bevoegde reviewers hebben een gecontroleerde CC-preview. Alleen de server kan het private bestandspad lezen. Rechten worden voor en na het ophalen gecontroleerd.
- Intrekking van toestemming, toegang, media of publicatie sluit betreffende uitlezing. Open creatorprofielen controleren opnieuw na 20 seconden en bij terugkeer. Geen gedeelde inhoudscache of ondertekende downloadlinks. De volledige live timingproef volgt voor productie.

## Releasegrens

Migratie `20261023204310_f4_creator_platform.sql` voegt zeven private tabellen toe met RLS en zonder directe client-CRUD. Geen bestaande businessrijen of historische migratie-SQL gewijzigd. Het releasemanifest bewaart de historische reeks: DEV 126 naar 127, uitsluitend na latere vrijgave en actuele voorcontrole. De oude seed blijft uitgesloten.

`BESC_CREATOR_PLATFORM_ENABLED=false` is standaard in beide apps. Nieuwe siteschakelaars en toegang staan eveneens standaard uit. Bouwen of mergen activeert geen site, account, rol, doeltekst of creator. CC en website blijven afzonderlijke repositories en deployments; nieuws en events behouden hun eigen keten.

## Werkelijk gebouwd contract

CC `src/lib/f4-contract.ts` en de bytegelijke websitekopie `src/lib/creator-contract.ts` beschrijven de gebouwde creatorvariant. De vier soorten en negentien operaties in `contracts/` blijven historische voorstellen voor het gehele F4-traject. Partner-, vacature-, pagina- en algemene intakeoperaties zijn hiermee niet gebouwd.

Eigen handelingen: `POST /api/v1/platform/workflow` met uitsluitend profile.save, profile.submit, consent.give, consent.withdraw en profile.withdraw. Eigen toestand: `GET /api/v1/platform/me`. Creatorpublicaties: `GET /api/v1/platform/publications/creators` en de slugroute; media via publications/media/id. De website gebruikt de beperkte CC-API met afzonderlijke websitesleutel en geverifieerd gebruikerstoken. Beheerhandelingen worden niet via de websiteworkflow toegelaten.

Writes gebruiken een vast verzoek-ID, invoerhash, versiecontrole en transactiereceipt. Bevoegdheid wordt opnieuw gecontroleerd voor receipt-hergebruik. Lees- en schrijflimieten staan duurzaam in de database. De reviewpreview geeft authenticated callers uitsluitend een boolean; de bestaande CC-servercredential leest daarna pas de private locator.

## Gerichte bouwcontrole

Geslaagd: een geisoleerde databaseketen met fictieve gegevens, zes API-contractgevallen, twee website-presentatiegevallen en beide productiecompilaties. De keten omvat eigen toegang zonder intern lidmaatschap, veldkeuze, onafhankelijke review, vrijgave, private media, idempotentie en intrekking. Dit bewijst geen live Auth-, Storage-, provider-, browser- of productieacceptatie. De bestaande CI blijft actief. De uitgebreide handmatige app-test blijft op verzoek voor productie.

## Resterend F4

Algemene intake en verdere Mijn BESC-functies, esports-/partnerprofielen, vacatures/vrijwilligers/sollicitaties, statische pagina's, inhoudsimport en redirects. De eerder vastgelegde F1/F2/F3-bewijsgrenzen blijven open. Voor echte publicatie zijn onder meer vastgestelde doelteksten, bewaarbehandeling, bevoegde reviewers, geverifieerde eigen binding en gecontroleerde inhoud nodig. De code kent deze besluiten niet zelf toe.

Bronnen: [Supabase functies](https://supabase.com/docs/guides/database/functions), [serverclient en Auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
