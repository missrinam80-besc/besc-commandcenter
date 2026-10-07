# Eventfiche

[← Gebruik en richtlijnen](Gebruik-en-richtlijnen.md)

De eventfiche heeft acht tabbladen. De titel, status en knop **Bewerken** blijven boven de inhoud staan. Wisselen gebeurt via de appnavigatie zonder een volledige paginaherlading. Een tabblad is rechtstreeks bereikbaar via bijvoorbeeld `/app/events/<event-id>?tab=planning`.

| Tabblad | Huidige inhoud |
|---|---|
| Overzicht | Beschrijving, basisgegevens, annuleren en dossierbeheer. |
| Planning & crew | Betrokken personen en rollen; acties voor een taak of campagne. Schema's en shifts volgen later. |
| Materialen | Eventmaterialenlijst met registeritems of zelf omschreven materiaal, aantallen, herkomst, verantwoordelijke en opvolging. |
| Giveaways | Voorbereide plek; registratie van items en uitdeling volgt later. |
| Inschrijvingen | Bestaande Eventbrite-link indien geregistreerd. Werkwijze, capaciteit en eigen inschrijvingen volgen later. |
| Financiën | Gekoppelde budgetten, kosten en inkomsten. |
| Documenten & koppelingen | Documenten, links, gerelateerde dossiers, eventmap, dossiergeneratie en Google Calendar. |
| Communicatie | E-mailopvolging en Gmail-concepten. |

Giveaways, schema's/shifts en inschrijvingsinstellingen hebben nog geen invoer of opgeslagen instellingen. Aan- of uitzetten per event wordt later toegevoegd. Een ontbrekende Eventbrite-link bewijst niet dat het event zonder inschrijvingen werkt.

## Materialen per event

Kies **Materiaal toevoegen** om een item uit het centrale register te kiezen of ander materiaal zelf te omschrijven. Bij een registeritem hoef je de naam niet opnieuw in te voeren. Geef een positief geheel aantal, de herkomst (eigen, geleend, gehuurd of voorzien door partner/locatie) en eventueel de leverancier, verantwoordelijke en ophaal-/retourlocatie op.

Ophalen en terugbrengen zijn geplande momenten in Europe/Brussels. Onbekende tijden blijven leeg. Een retourmoment mag niet vóór ophalen liggen. De opvolging is afzonderlijk: Nog te regelen, Geregeld, Klaar voor vertrek, Op het event, Teruggebracht of Vervallen. Statuswijzigingen gebeuren via bewerken.

De lijst beschrijft de behoefte en opvolging voor dit event. Zij reserveert geen voorraad, controleert geen overlap met andere events en wijzigt de globale inventarisstatus of waarde niet. Verwijderen haalt alleen de regel uit de eventlijst; het centrale registeritem blijft bestaan. Een eerder gekoppeld registeritem of verantwoordelijke die niet meer beschikbaar is, blijft herkenbaar in de historie.

Een actief account met Events-bevoegdheid kan de lijst beheren. Actieve leden kunnen de lijst bekijken. Gegevens en verwijzingen blijven beperkt tot dezelfde organisatie. Voor ingebruikname is migratie `20261007193759_event_materials.sql` nodig; voer die op Cloud DEV uit vóór deployment van deze versie.

Bestaande links voor personen, documenten en Drive blijven werken. Na zo'n actie verschijnt het passende tabblad. Toegangsrechten en bevestigingen voor wijzigingen blijven gelden.
