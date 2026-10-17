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

Voor [bulkacties op materialen](Materialen-en-bulkacties.md): voer `20261009100412_bulk_asset_actions.sql` uit vóór deployment. Controleer selectie, afzonderlijke en gecombineerde locatie-/statuswijzigingen, bevestigingen voor archiveren/verwijderen en volledige terugdraaiing bij fouten.

Voor [beheerbare keuzevelden](Keuzevelden.md): voer `20261009074806_managed_dossier_choices.sql` uit vóór deployment van de bijbehorende app-image. Controleer toevoegen, hernoemen, kiezen in een fiche en de verwijderbeveiliging voor gebruikte opties. Vaste werkstroomkeuzes blijven beschermd.

Voor beheerbare soorten agendaonderdelen: aanvullend `20261009095014_managed_agenda_types.sql` vóór deployment. Controleer een nieuwe soort in het agendaformulier, de uniforme editor, filters en gekleurde blokken. Hernoemen behoudt koppelingen en kleur; gebruikte soorten blijven tegen verwijderen beschermd.

Nieuwe betaalde diensten of agentruns vragen een afzonderlijk besluit. De PDF-proef en nieuwe uploads in de lokale Storage-herstelomgeving vallen buiten de huidige DEV-acceptatie volgens het scopebesluit van 7 oktober.

## Historische controles

## Handleidingen

- [V1 releasechecklist](historie/EERSTE_RELEASE_CHECKLIST.md)
- [Fase 1 — release candidate voorbereiden](historie/FASE_1_RELEASE_CANDIDATE_VOORBEREIDING.md)
- [Eventrechten: DEV-uitrol en acceptatie](historie/EVENT_RECHTEN_DEV_ACCEPTATIE.md)
- [V1 cleanup- en structuuraudit](historie/V1_CLEANUP_AUDIT.md)
- [Roadmapstatus BESC Command Center](historie/ROADMAP_COMPLETION_STATUS.md)

## Stand van 17 oktober 2026

De [huidige DEV-status](Huidige-DEV-status.md) en het [ticketverslag](../acceptatie/TICKETING-V2-DEV-20261016.txt) bevatten de bevestigde live resultaten en open proeven. De slotproef is afgesloten met beide opt-ins uit. Historische release-instructies hierboven zijn geen opdracht om reeds uitgevoerde migraties opnieuw toe te passen. Een geslaagd lokaal contract of CI is geen live bewijs; overgeslagen, alleen lokaal geteste en bevestigde DEV-proeven blijven onderscheiden.
