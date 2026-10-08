# Eventfiche

[← Gebruik en richtlijnen](Gebruik-en-richtlijnen.md)

De eventfiche heeft acht tabbladen. De titel, status en knop **Bewerken** blijven boven de inhoud staan. Wisselen gebeurt via de appnavigatie zonder een volledige paginaherlading. Een tabblad is rechtstreeks bereikbaar via bijvoorbeeld `/app/events/<event-id>?tab=planning`.

| Tabblad | Huidige inhoud |
|---|---|
| Overzicht | Beschrijving, basisgegevens, annuleren en dossierbeheer. |
| Planning & crew | Dagschema, streams, draaiboek en crew-/vrijwilligersshiften; betrokken personen en rollen; acties voor een taak of campagne. |
| Materialen | Eventmaterialenlijst met registeritems of zelf omschreven materiaal, aantallen, herkomst, verantwoordelijke en opvolging. |
| Giveaways | Items, geplande/ontvangen/uitgedeelde aantallen, herkomst, verantwoordelijke en uitdeelafspraken. |
| Inschrijvingen | Bestaande Eventbrite-link indien geregistreerd. Werkwijze, capaciteit en eigen inschrijvingen volgen later. |
| Financiën | Gekoppelde budgetten, kosten en inkomsten. |
| Documenten & koppelingen | Documenten, links, gerelateerde dossiers, eventmap, dossiergeneratie en Google Calendar. |
| Communicatie | E-mailopvolging en Gmail-concepten. |

Inschrijvingsinstellingen hebben nog geen invoer of opgeslagen instellingen. Aan- of uitzetten per event wordt later toegevoegd. Een ontbrekende Eventbrite-link bewijst niet dat het event zonder inschrijvingen werkt.

## Materialen per event

Kies **Materiaal toevoegen** om een item uit het centrale register te kiezen of ander materiaal zelf te omschrijven. Bij een registeritem hoef je de naam niet opnieuw in te voeren. Geef een positief geheel aantal, de herkomst (eigen, geleend, gehuurd of voorzien door partner/locatie) en eventueel de leverancier, verantwoordelijke en ophaal-/retourlocatie op.

Ophalen en terugbrengen zijn geplande momenten in Europe/Brussels. Onbekende tijden blijven leeg. Een retourmoment mag niet vóór ophalen liggen. De opvolging is afzonderlijk: Nog te regelen, Geregeld, Klaar voor vertrek, Op het event, Teruggebracht of Vervallen. Statuswijzigingen gebeuren via bewerken.

De lijst beschrijft de behoefte en opvolging voor dit event. Zij reserveert geen voorraad, controleert geen overlap met andere events en wijzigt de globale inventarisstatus of waarde niet. Verwijderen haalt alleen de regel uit de eventlijst; het centrale registeritem blijft bestaan. Een eerder gekoppeld registeritem of verantwoordelijke die niet meer beschikbaar is, blijft herkenbaar in de historie.

Een actief account met Events-bevoegdheid kan de lijst beheren. Actieve leden kunnen de lijst bekijken. Gegevens en verwijzingen blijven beperkt tot dezelfde organisatie. Voor ingebruikname is migratie `20261007193759_event_materials.sql` nodig; voer die op Cloud DEV uit vóór deployment van deze versie.

Bestaande links voor personen, documenten en Drive blijven werken. Na zo'n actie verschijnt het passende tabblad. Toegangsrechten en bevestigingen voor wijzigingen blijven gelden.

## Planning en crew

Voeg een schemaonderdeel toe met een titel en type: Programma, Stream, Draaiboek of Crew / vrijwilliger. Gebruik start- en eindmomenten in Europe/Brussels, ook voor meerdaagse events en nachtshiften. Onbekende tijden mogen leeg blijven; een eindtijd vereist een eerdere starttijd. Kies eventueel een persoon uit het centrale personenregister, locatie/streamkanaal en praktische afspraken. Voor meerdere personen op dezelfde shift maak je per persoon een onderdeel.

De eventagenda heeft een dag- en weekweergave met een urenrooster en dagkolommen. Blokken staan op hun werkelijke tijden; gelijktijdige onderdelen staan naast elkaar. Gebruik de datumkiezer of pijlen om te navigeren. Nachtshiften lopen door op de volgende dag. Klik op een blok voor alle gegevens en de bewerkknop. Onderdelen zonder start- of eindtijd staan apart onder **Nog niet volledig ingepland**; de agenda verzint geen duur. De klok volgt Europe/Brussels, inclusief dagen van 23 of 25 uur bij de tijdswissel. Bij de herhaalde wintertijd wordt de UTC-offset bij de uuraanduiding vermeld. Programma is blauw, Stream paars, Draaiboek amber en Crew / vrijwilliger groen. De typenaam blijft zichtbaar naast de kleur; de vlakken passen bij het lichte en donkere thema. Praktische afspraken staan bij de details. De filters tonen één type. Voorstel, Bevestigd, Uitgevoerd en Vervallen worden handmatig toegekend. Overlappende toewijzingen aan dezelfde persoon binnen dit event krijgen een waarschuwing, ook over verschillende types. Aansluitende shifts en vervallen onderdelen geven geen waarschuwing. Bij onbekende tijden is overlap niet te beoordelen. Controle tussen verschillende events en beschikbaarheidsbeheer volgen later.

Schemaonderdelen wijzigen geen bestaande dossierrollen, taken of Google Calendar. Draaiboekinstructies kunnen als praktische afspraken worden ingevoerd; bestaande documenten blijven op Documenten & koppelingen staan. Actieve leden kunnen bekijken; Events-bevoegdheid is nodig om te beheren. Verwijderen verwijdert uitsluitend het schemaonderdeel. Migratie `20261007205415_event_schedule.sql` is nodig op Cloud DEV vóór deployment.

## Giveaways per event

Kies **Item toevoegen** en vul een naam, gepland aantal, herkomst (eigen voorraad, sponsor/partner of aangekocht), eventuele leverancier en verantwoordelijke in. Ontvangen en uitgedeelde aantallen zijn optioneel: leeg betekent onbekend, 0 betekent bevestigd niets. Uitgedeeld mag niet hoger zijn dan ontvangen; voor een positief uitgedeeld aantal moet ontvangen bekend zijn. Het restant wordt alleen berekend als beide aantallen bekend zijn. Ontvangen mag hoger zijn dan gepland.

Opvolging is een handmatige keuze: Nog te regelen, Geregeld, Ontvangen, In uitdeling, Afgerond of Vervallen. Een status bewijst geen aantallen. Uitdeelafspraken en voorwaarden zijn vrije tekst en kunnen in de lijst worden opengeklapt. Deze stap registreert items en totaalaantallen, geen winnaars, persoonlijke deelnemersgegevens of automatische loting. Er wordt niets gepubliceerd en geen voorraad, sponsorafspraak of financieel dossier automatisch gewijzigd.

Actieve leden kunnen de lijst bekijken; Events-bevoegdheid is nodig om toe te voegen, te wijzigen of te verwijderen. Verwijderen verwijdert het item met zijn geregistreerde aantallen uit dit event. Organisatie- en dossiergrenzen blijven gecontroleerd. Voor deployment is migratie `20261008051115_event_giveaways.sql` op Cloud DEV nodig. De migratie gebruikt de bestaande organisatiegebonden sleutels uit de materialenmigratie.
