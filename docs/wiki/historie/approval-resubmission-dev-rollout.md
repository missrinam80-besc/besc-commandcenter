# Herindiening in de goedkeuringswerkvoorraad

> Historische notitie. Dit document bewaart het ontwerp of de controle op de genoemde datum; het is geen actuele werkvoorraad. Zie de [wiki](../README.md) en [huidige releasewerkwijze](../Release-en-acceptatie.md).

## Probleem en herstelling

De FoM-bronproef op Cloud DEV van 7 oktober 2026 bevestigde het volgende: na
een wijzigingsverzoek, herindiening en weigering toonde het contentdossier de
laatste weigering correct, maar de werkvoorraad telde de eerdere wijzigingsronde
nog als open. Mijn open aanvragen telde bovendien ook de geweigerde aanvraag.

De werkvoorraad selecteert nu eerst de laatste ronde per dossiertype en dossier,
en past daarna de status-, module- en persoonlijke filters toe. Alleen pending en
changes_requested tellen als eigen open werk. Een bron die onder de bestaande
sessie/RLS niet beschikbaar is of softdeleted is, komt niet in de actuele
werkvoorraad. De controles blijven binnen de bestaande organisatie en gebruiken
de ingelogde Supabase-client; er komen geen nieuwe rechten of privileged clients.

Eerdere aanvragen en beslissingen blijven ongewijzigd in de database. Deze
wijziging betreft de actuele werkvoorraad, geen permanente geschiedenispurge.
Voor bronnen zonder deleted_at (nieuwsbrieven en Google-resourcekoppelingen)
wordt beschikbaarheid via de bestaande bronrij gecontroleerd.

## Validatie en uitrol

- Regressieproeven voor meerdere rondes, eigen open tellingen, brontypes,
  organisatiefilters, verwijderde/ontbrekende bronnen en leesfouten.
- De echte goedkeuringspagina wordt uitgevoerd en gerenderd met gecontroleerde
  database-adapters: een oude wijzigingsronde mag niet via een statusfilter
  terugkomen en verwijderde bronnen mogen niet als open werk verschijnen.
- Geen schemawijziging of migratie nodig. Geen extra dienst of betaalde agentrun.
- Uitrol: review/merge op GitHub, bestaande DEV-imagebouw, serverdeploy,
  daarna live hercontrole. Lokaal slagen is geen bewijs van uitgerolde werking.

## Live hercontrole binnen punt 2

1. Maak een duidelijk gemarkeerd wegwerp-contentitem met bevestigde FoM-feiten.
   Het historische FoM-event blijft behouden; onbekende tijden, aantallen,
   resultaten en mediarechten worden niet ingevuld.
2. Leg het item voor, vraag wijzigingen en dien opnieuw in. Verwacht één actuele
   pending ronde, geen oude changes_requested ronde in de actuele werkvoorraad.
3. Weiger de nieuwe proefaanvraag met toelichting. Verwacht nul eigen open
   aanvragen voor dit dossier, nul actuele wijzigingsverzoeken en één afgehandeld
   dossier. Het contentdossier moet dezelfde laatste beslissing tonen.
4. Verwijder alleen het proefitem uit werkweergaven. Verwacht geen actuele
   werkvoorraadrij of doorklik naar die verwijderde bron. De twee oorspronkelijke
   aanvraagrondes en beslissingen blijven in de database behouden.
5. Controleer dat actuele aanvragen voor andere dossiers zichtbaar blijven.
   Ruim overige proefrecords op. Geen verzending, publicatie of betaling.

De eerste bronproef is een beperkte beheerdersproef met werkrecords op basis van
echte bevestigde gegevens. Zij bewijst geen volledige financiële, sponsor-,
nieuwsbrief- of externe publicatieflow en rondt punt 2 niet af.
