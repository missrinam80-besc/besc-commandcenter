# Eventdatum en tijd afzonderlijk

Het eventformulier heeft startdatum, starttijd, einddatum en eindtijd. Tijden zijn optioneel. Een historische datum wordt niet als middernacht of als een hele-dagafspraak geïnterpreteerd.

`events.start_date` en `events.end_date` bewaren datumfeiten. Bestaande `start_at` en `end_at` blijven precieze tijdstippen voor bekende tijden en Google Calendar. De migratie leidt bestaande datums af in Europe/Brussels zonder timestamps te veranderen. Een trigger houdt datumfeiten in overeenstemming met oudere schrijvers die nog timestamps gebruiken. De bestaande organisatiebeveiliging en RLS veranderen niet.

Het formulier toont bestaande tijden in Europe/Brussels. Een ongewijzigde tijd behoudt het oorspronkelijke tijdstip inclusief seconden en de juiste variant van het herhaalde uur bij overgang naar wintertijd. Ongeldige datums, omgekeerde volgorde, tijd zonder datum en een niet-bestaand uur bij overgang naar zomertijd worden geweigerd.

Datum-only events staan in dossier, eventlijst, interne kalender, dashboard, agentleestoegang, eventrapport/export en Google-documentgegevens. Bekende datum met onbekende tijd toont waar passend ‘Tijd onbekend’.

Opslaan publiceert geen nieuw Google Calendar-item. Een bestaande afspraak wordt alleen automatisch bijgewerkt met volledige start- en eindtijden. Bij ontbrekende tijden blijft de bestaande afspraak behouden; de handmatige synchronisatieknop is dan uitgeschakeld met uitleg. Een hele-dagafspraak is een afzonderlijke betekenis en wordt niet aangenomen.

## Installatie op DEV

1. Voer migratie `20261005213000_event_dates_without_times.sql` uit op de Cloud Supabase-database die DEV gebruikt.
2. Deploy vervolgens de appcode van dezelfde release. Een oude app blijft na de migratie werken; nieuwe code vereist de nieuwe kolommen.
3. Controleer nieuw historisch event zonder tijden, bestaand event met tijden, interne kalender en expliciete Calendar-publicatie.
4. Vul bij FoM 26.1 startdatum 2025-09-05 en einddatum 2025-09-07 in en laat de tijden leeg. De bestaande beschrijving en locatie blijven behouden. Dit gebeurt pas na DEV-installatie en readback.

De wijziging verplaatst geen Drive-bestanden, breidt geen rechten uit en past geen bestaande menselijke besluiten over status, rol of eigenaar aan.
