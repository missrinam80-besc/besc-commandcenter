# Project-rechten: DEV-uitrol en acceptatie

## Bevestigde afwijking

Op 6 oktober 2026 zijn de actieve policies alleen-lezen gecontroleerd op de bevestigde Cloud DEV-database sjvzrsmrtcxxtmaxigtn. Projecten gebruiken nog manager project write (ALL); projectleden en mijlpalen gebruiken eveneens manager-write. De app gebruikt al manageProjects voor beheerder, bestuur, teamlid of een geldige toegewezen aangepaste rol met die capability.

## Wijziging

Migratie 20261006172315_align_project_permissions.sql laat de bestaande Project-bevoegdheid gelden voor aanmaken/bewerken, projectteam en mijlpalen. Beide nieuwe helpers zijn SECURITY INVOKER, gebruiken actuele actieve lidmaatschappen en geldige organisatiegebonden rollen. Anon/PUBLIC krijgt geen execute. De eigen-rol-leespolicy uit Event-migratie 20261006140627 is een voorwaarde.

Fysieke project-DELETE blijft uitsluitend voor managers; de oude ALL-policy wordt daarom gesplitst. Team- en mijlpaalacties vereisen een niet-verwijderd project; organisatie-overdracht wordt geweigerd. Toegevoegde projectaccounts moeten actieve, zichtbare leden van dezelfde organisatie zijn. Projectteamlidmaatschap verleent geen organisatierol of capability. Bestaande SELECT- en auditregels blijven behouden.

De bestaande leesbeperking op organisatieleden en profielen blijft gelden. Teamleden en vrijwilligers zien daardoor niet automatisch alle andere accounts als kandidaat; deze PR maakt geen brede ledendirectory toegankelijk. Beheerders/bestuur behouden hun bestaande kandidatenbereik. Een uitgebreidere kandidatenlijst vraagt een afzonderlijk ontwerp met minimale persoonsgegevens.

Project aanmaken/bewerken en archiveren/herstellen/zacht verwijderen controleren het daadwerkelijk opgeslagen record. Mijlpaal- en teamacties controleren databasefouten en lege resultaten. Zij werken niet op ontbrekende, verwijderde of organisatievreemde projecten. Mislukte projectupdates schrijven geen project_updated-activiteit. De schermen tonen de team-/mijlpaalknoppen uitsluitend met manageProjects; directe project- en mijlpaalbewerklinks blijven afgeschermd.

Scope: kernproject-, team- en mijlpaalopslag; Google Drive, taakbevoegdheden, dossierrelaties, organisatie-/profiel-leesrechten en formele lifecycle-statussen worden niet opnieuw ontworpen. Geen betaalde agentrun.

## Validatie en uitrol

- Echte Postgres-RLS-tests via PGlite: beheerder/bestuur/teamlid, vrijwilliger met/zonder capability, inactief lid, verwijderde/organisatievreemde rol, organisatie-overdracht, auteurvervalsing, buitenlandse teamkandidaat, verwijderd project, ingetrokken toegang en manager-only fysieke project-DELETE.
- Serveracties: toegestane/geweigerde rollen, nul rijen, databasefouten, ontbrekend project en ongeldige teamkandidaat; SSR-schermtest met directe bewerklinks.
- Volledige regressiesuite, TypeScript, lint en GitHub-build controleren voor merge.
- Live database alleen uitgelezen; migratie en deployment nog niet uitgevoerd. Echte ingelogde rolaccounts blijven een afzonderlijke acceptatiestap.

1. PR mergen en DEV-imagebouw afwachten.
2. Event-migratie controleren; Project-migratie toepassen en registreren op Cloud DEV.
3. Nieuwe DEV-image uitrollen via de bestaande Termius-procedure.
4. Met gemarkeerde TESTFIXTURE — NIET PUBLICEREN-records de kernacties per beschikbaar rolaccount testen; na afloop opruimen. Geen publicatie of externe Drive-mutatie.
