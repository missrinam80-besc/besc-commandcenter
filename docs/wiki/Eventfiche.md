# Eventfiche

[← Gebruik en richtlijnen](Gebruik-en-richtlijnen.md)

De eventfiche heeft negen tabbladen. De titel, status en knop **Bewerken** blijven boven de inhoud staan. Wisselen gebeurt via de appnavigatie zonder een volledige paginaherlading. Een tabblad is rechtstreeks bereikbaar via bijvoorbeeld `/app/events/<event-id>?tab=planning`.

| Tabblad | Huidige inhoud |
|---|---|
| Overzicht | Beschrijving, basisgegevens, annuleren en dossierbeheer. |
| Activiteiten | Activiteiten met uitleg; herbruikbaar bij meerdere programmaonderdelen. |
| Planning & crew | Dagschema, streams, draaiboek en crew-/vrijwilligersshiften; betrokken personen en rollen; acties voor een taak of campagne. |
| Materialen | Eventmaterialenlijst met registeritems of zelf omschreven materiaal, aantallen, herkomst, verantwoordelijke en opvolging. |
| Giveaways | Items, geplande/ontvangen/uitgedeelde aantallen, herkomst, verantwoordelijke en uitdeelafspraken. |
| Inschrijvingen | Boekbare crew-/streamerslots en aanvragen; daarnaast de bestaande algemene inschrijvingsinstellingen en deelnemerslijst. |
| Financiën | Eventbudgetten, kosten en inkomsten; toevoegen vanuit het event en opvolging via de financiële fiches. |
| Documenten & koppelingen | Documenten, links, gerelateerde dossiers, eventmap, dossiergeneratie en Google Calendar. |
| Communicatie | E-mailopvolging en Gmail-concepten. |

Een bestaand event heeft aanvankelijk geen gekozen inschrijvingswerkwijze. Een bestaande Eventbrite-link blijft zichtbaar totdat de werkwijze expliciet wordt ingesteld. Een ontbrekende link bewijst niet dat het event zonder inschrijvingen werkt.

## Materialen per event

Kies **Materiaal toevoegen** om een item uit het centrale register te kiezen of ander materiaal zelf te omschrijven. Bij een registeritem hoef je de naam niet opnieuw in te voeren. Geef een positief geheel aantal, de herkomst (eigen, geleend, gehuurd of voorzien door partner/locatie) en eventueel de leverancier, verantwoordelijke en ophaal-/retourlocatie op.

Ophalen en terugbrengen zijn geplande momenten in Europe/Brussels. Onbekende tijden blijven leeg. Een retourmoment mag niet vóór ophalen liggen. De opvolging is afzonderlijk: Nog te regelen, Geregeld, Klaar voor vertrek, Op het event, Teruggebracht of Vervallen. Statuswijzigingen gebeuren via bewerken.

Een gekoppeld registeritem valt onder de centrale beschikbaarheidscontrole: overlappende reserveringen en open hersteltaken blokkeren nieuwe selectie. Andere niet-overlappende datums blijven mogelijk. Zie [materiaalreserveringen](Materialen-en-bulkacties.md#dupliceren-en-beschikbaarheid). Een vrije omschrijving is geen reservering van een registeritem. De eventregel wijzigt de aankoopwaarde niet. Verwijderen haalt alleen de regel uit de eventlijst; het centrale registeritem blijft bestaan. Een eerder gekoppeld registeritem of verantwoordelijke die niet meer beschikbaar is, blijft herkenbaar in de historie.

Een actief account met Events-bevoegdheid kan de lijst beheren. Actieve leden kunnen de lijst bekijken. Gegevens en verwijzingen blijven beperkt tot dezelfde organisatie. Voor ingebruikname is migratie `20261007193759_event_materials.sql` nodig; voer die op Cloud DEV uit vóór deployment van deze versie.

Bestaande links voor personen, documenten en Drive blijven werken. Na zo'n actie verschijnt het passende tabblad. Toegangsrechten en bevestigingen voor wijzigingen blijven gelden.

## Planning en crew

Voeg een schemaonderdeel toe met een titel en type: Programma, Streamer/content creator, Draaiboek of Crew / vrijwilliger. Gebruik start- en eindmomenten in Europe/Brussels, ook voor meerdaagse events en nachtshiften. Onbekende tijden mogen leeg blijven; een eindtijd vereist een eerdere starttijd. Kies eventueel een persoon uit het centrale personenregister, locatie/streamkanaal en praktische afspraken. Voor meerdere personen op dezelfde shift maak je per persoon een onderdeel.

De eventagenda heeft een dag- en weekweergave met een urenrooster en dagkolommen, plus een lijstweergave. De agenda beperkt zich tot de relevante event-/planningsdagen. Ook onderaan een lange onderdelenlijst is een toevoegactie beschikbaar. Blokken staan op hun werkelijke tijden; gelijktijdige onderdelen staan naast elkaar. Gebruik de datumkiezer of pijlen om te navigeren. Nachtshiften lopen door op de volgende dag. Klik op een blok voor alle gegevens en de bewerkknop. Onderdelen zonder start- of eindtijd staan apart onder **Nog niet volledig ingepland**; de agenda verzint geen duur. De klok volgt Europe/Brussels, inclusief dagen van 23 of 25 uur bij de tijdswissel. Bij de herhaalde wintertijd wordt de UTC-offset bij de uuraanduiding vermeld. Programma is blauw, Streamer/content creator paars, Draaiboek amber en Crew / vrijwilliger groen. De typenaam blijft zichtbaar naast de kleur; de vlakken passen bij het lichte en donkere thema. Praktische afspraken staan bij de details. De filters tonen één type; soorten en hun benamingen zijn beheerbaar via Keuzevelden. Voorstel, Bevestigd, Uitgevoerd en Vervallen worden handmatig toegekend. Overlappende toewijzingen aan dezelfde persoon binnen dit event krijgen een waarschuwing, ook over verschillende types. Aansluitende shifts en vervallen onderdelen geven geen waarschuwing. Bij onbekende tijden is overlap niet te beoordelen. Controle tussen verschillende events en beschikbaarheidsbeheer volgen later.

Schemaonderdelen wijzigen geen bestaande dossierrollen, taken of Google Calendar. Draaiboekinstructies kunnen als praktische afspraken worden ingevoerd; bestaande documenten blijven op Documenten & koppelingen staan. Actieve leden kunnen bekijken; Events-bevoegdheid is nodig om te beheren. Verwijderen verwijdert uitsluitend het schemaonderdeel. Migratie `20261007205415_event_schedule.sql` is nodig op Cloud DEV vóór deployment.

## Giveaways per event

Kies **Item toevoegen** en vul een naam, gepland aantal, herkomst (eigen voorraad, sponsor/partner of aangekocht), eventuele leverancier en verantwoordelijke in. Ontvangen en uitgedeelde aantallen zijn optioneel: leeg betekent onbekend, 0 betekent bevestigd niets. Uitgedeeld mag niet hoger zijn dan ontvangen; voor een positief uitgedeeld aantal moet ontvangen bekend zijn. Het restant wordt alleen berekend als beide aantallen bekend zijn. Ontvangen mag hoger zijn dan gepland.

Opvolging is een handmatige keuze: Nog te regelen, Geregeld, Ontvangen, In uitdeling, Afgerond of Vervallen. Een status bewijst geen aantallen. Uitdeelafspraken en voorwaarden zijn vrije tekst en kunnen in de lijst worden opengeklapt. Deze stap registreert items en totaalaantallen, geen winnaars, persoonlijke deelnemersgegevens of automatische loting. Er wordt niets gepubliceerd en geen voorraad, sponsorafspraak of financieel dossier automatisch gewijzigd.

Actieve leden kunnen de lijst bekijken; Events-bevoegdheid is nodig om toe te voegen, te wijzigen of te verwijderen. Verwijderen verwijdert het item met zijn geregistreerde aantallen uit dit event. Organisatie- en dossiergrenzen blijven gecontroleerd. Voor deployment is migratie `20261008051115_event_giveaways.sql` op Cloud DEV nodig. De migratie gebruikt de bestaande organisatiegebonden sleutels uit de materialenmigratie.

## Algemene inschrijvingen

Kies **Instellingen**: Zonder inschrijvingen, Externe inschrijfpagina of Eigen deelnemerslijst. Bij een externe werkwijze is een HTTP(S)-link verplicht; er is geen automatische import of ticketverkoop. De bestaande Eventbrite-link uit de basisfiche kan worden overgenomen, maar daarna geldt de link in de inschrijvingsinstellingen. Aanpassen van de oude Eventbrite-link wijzigt deze instellingen niet.

Capaciteit is optioneel en staat los van het verwachte bezoekersaantal. Het is een planningwaarde: de app waarschuwt bij overschrijding, maar blokkeert geen inschrijving en reserveert geen tickets. Onbekende capaciteit blijft leeg. Afspraken worden handmatig geregistreerd.

Bij een eigen lijst registreer je een naam of groepsnaam, een positief aantal plaatsen, een status en eventuele afspraken. Ingeschreven en Aanwezig tellen mee in de bezetting; Wachtlijst en Geannuleerd niet. Aanwezigheid wordt handmatig bijgewerkt. Er is geen automatische promotie vanaf de wachtlijst. Gebruik bewerken voor opvolging en annuleren; verwijderen is definitief.

Een wijziging van werkwijze bewaart bestaande deelnemers. Nieuwe deelnemers toevoegen vereist Eigen deelnemerslijst; eerder geregistreerde deelnemers kunnen nog worden onderhouden. De lijst is intern en alleen zichtbaar voor actieve accounts met Events-bevoegdheid. Andere actieve leden kunnen de werkwijze en afspraken bekijken. Deze algemene deelnemerslijst heeft geen openbaar formulier, automatische mail of deelnemersportaal; de afzonderlijke crew-/streamerboekingen hieronder hebben wel een gedeelde pagina en berichten. Voor deployment is migratie `20261008052243_event_registrations.sql` nodig na de materialenmigratie.

## Financiën vanuit het event

Het tabblad toont alleen niet-verwijderde registraties die aan dit event gekoppeld zijn. Gepland budget sluit afgewezen en gearchiveerde budgetten uit. Vastgelegde kosten sluiten afgewezen, geannuleerde en gearchiveerde kosten uit. Betaald / terugbetaald telt alleen die twee statussen. Nog verwachte inkomsten bevat Verwacht en Gefactureerd; Ontvangen inkomsten bevat alleen Ontvangen. Budgetruimte is gepland budget min vastgelegde kosten; Actueel resultaat is ontvangen inkomsten min betaalde/terugbetaalde kosten. Zonder geldig gekoppeld budget blijft budgetruimte onbekend.

Financieel bevoegde accounts kunnen een budget of inkomst toevoegen. Kosten kunnen worden ingediend met de bestaande kostenbevoegdheden. De formulieren vullen event en eventueel project vooraf in; na opslaan kom je terug op Financiën van dit event. Voor bewerken, bewijsstukken, goedkeuring en betalingsopvolging open je de bestaande financiële fiche. De app voert geen bankbetaling uit en de giveawaylijst maakt geen kosten automatisch aan.

Accounts zonder financieel inzagerecht krijgen geen eventtotalen en kunnen hun eigen kost via de bestaande kostenroute indienen. Bij een laadfout verschijnen geen misleidende nullen of lege lijsten. Deze uitbreiding van Financiën gebruikt de bestaande tabellen en vereist geen nieuwe financiële migratie.

## Activiteiten en programma

Voeg op **Activiteiten** een activiteit met titel en uitleg toe. Je kunt dezelfde activiteit aan meerdere programmaonderdelen in Planning & crew koppelen. De activiteitenlijst toont de gekoppelde planning; een activiteit op zichzelf reserveert nog geen tijdslot of persoon. De technische uitbreiding staat in `20261012195715_event_activities_agenda.sql`.

## Afdrukken en PDF

Kies in de eventagenda **Afdrukken / PDF**, selecteer één categorie of alle categorieën en kies Lijst of Dagagenda. Gebruik vervolgens de browserafdrukfunctie en eventueel **Opslaan als PDF**. Dit is een browserexport, geen servermatig gegenereerd Drive-document. Geannuleerde boekingsregels verdwijnen uit de actieve agenda en de afdruk; de boekingshistorie blijft behouden. Controleer categorie, tijden en indeling vóór delen.

## Crew- en streamertijdslots boeken

De actieve eventeigenaar beheert op **Inschrijvingen → Tijdslots en boekingen** de slots, het aantal personen per slot en de publicatie van een gedeelde inschrijfpagina. Iedereen met de link kan aanvragen met e-mailverificatie; persoonsgegevens van boekers worden niet openbaar getoond. Verificatie verloopt na 30 minuten. Ongeverifieerde aanvragen houden geen plaats vast; voorlopige en bevestigde aanvragen tellen wel mee.

Na verificatie verschijnt de aanvraag voorlopig in de agenda en krijgt de eigenaar een CC-melding. De eigenaar bevestigt, wijst af of annuleert. Hij kan ook **Namens iemand boeken**; dat is geen bewijs van e-mailverificatie door die persoon. De inschrijver ontvangt aanvraag- en beslissingsberichten. Geannuleerd geeft de plaats vrij en verwijdert de actieve agendavermelding. Een slot met voorlopige/bevestigde boekingen heeft beschermde planningsvelden; sluit het en maak zo nodig een nieuw slot.

De boekingslijst toont een opvallende status en compacte berichticonen: groen verzonden, geel in verwerking, rood controle nodig. Wijs een icoon aan of selecteer het voor uitleg. Na een onzekere verzending niet blind opnieuw sturen; controleer eerst het bestaande effect.

E-mail is standaard. Discordkeuze verlangt een ingelogd, actueel gekoppeld account met bevestigd overeenkomend e-mailadres en beide afzonderlijke opt-ins. Gesloten DM's vallen terug op e-mail; verificatie blijft per e-mail. De Discordkeuze en slotworker staan na de afgeronde DEV-proef weer uit. Zie [huidige status en testgrenzen](Huidige-DEV-status.md) en het [technische slotcontract](../contracts/event-slot-bookings.md).

Deze slotcapaciteit staat los van de algemene deelnemerscapaciteit hierboven. Er is geen automatische slotwachtlijst. Slotboekingen hebben geen automatische 180-dagenretentie; die termijn geldt voor Discordtickets.
