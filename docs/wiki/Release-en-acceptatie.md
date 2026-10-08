# Release en acceptatie

[← Wiki-startpagina](README.md)

De acceptatieomgeving is Cloud DEV. Gebruik onderstaande werkwijze voor nieuwe wijzigingen; oudere vinkjes of momentopnamen bewijzen geen actuele acceptatie.

## Actuele releasewerkwijze

1. Controleer de wijziging lokaal: tests, lint, gegenereerde editorbronnen en productiebuild.
2. Maak een GitHub-PR en laat de kwaliteitscontrole slagen.
3. Merge na akkoord en wacht op de GitHub-imagebouw. Bouw geen losse gewijzigde code op de server.
4. Voer uitsluitend de eventuele nieuwe migratie op Cloud DEV uit; behoud de bestaande migratiebestanden.
5. Deploy de GitHub-image met de bestaande serverprocedure en controleer health en versie.
6. Controleer op DEV de gewijzigde schermen en workflows met de benodigde rollen, in licht/donker en op een smal scherm.

Voor dossierwijzigingen: controleer aanmaken, bewerken, tabwissels, behoud van koppelingen, gezamenlijke opslag en fouten zonder gedeeltelijke opslag. Goedkeuren, betalen en externe communicatie blijven afzonderlijke acties.

Nieuwe betaalde diensten of agentruns vragen een afzonderlijk besluit. De PDF-proef en nieuwe uploads in de lokale Storage-herstelomgeving vallen buiten de huidige DEV-acceptatie volgens het scopebesluit van 7 oktober.

## Historische controles

## Handleidingen

- [V1 releasechecklist](historie/EERSTE_RELEASE_CHECKLIST.md)
- [Fase 1 — release candidate voorbereiden](historie/FASE_1_RELEASE_CANDIDATE_VOORBEREIDING.md)
- [Eventrechten: DEV-uitrol en acceptatie](historie/EVENT_RECHTEN_DEV_ACCEPTATIE.md)
- [V1 cleanup- en structuuraudit](historie/V1_CLEANUP_AUDIT.md)
- [Roadmapstatus BESC Command Center](historie/ROADMAP_COMPLETION_STATUS.md)
