# Dossiers aanmaken en bewerken

[← Wiki](README.md)

## Eén werkwijze

**Nieuw** opent een ruime pop-up met de tabbladen van de volledige fiche. Vul basisgegevens en onderdelen in en gebruik **Alles opslaan**. Een taak die vanuit een event of ander dossier wordt aangemaakt, neemt die dossiercontext mee.

**Bewerken** opent alle bewerkbare gegevens rechtstreeks op de dossierpagina. Wisselen tussen tabbladen bewaart de invoer. Bestaande onderdelen zijn inklapbaar; nieuwe onderdelen staan open. Eén knop **Alles opslaan** bewaart het hoofddossier én alle gewijzigde onderdelen samen.

Deze werkwijze geldt voor taken, projecten, events, campagnes, sponsors, communitycontacten, social posts, content, vergaderingen, inbox, kennisartikelen, budgetten, kosten, inkomsten, producten, lanceringen, materialen, nieuwsbrieven, VZW-leden, mandaten, deadlines en administratieve documenten.

## Tekst opmaken

Grote beschrijvingen, notities en andere inhoudelijke tekstvelden hebben een visuele editor. Selecteer tekst en gebruik de werkbalk voor titels, vet, cursief, opsommingen, genummerde lijsten, citaten en links. Ongedaan maken en opnieuw uitvoeren werken binnen het veld. Dezelfde opmaak verschijnt in de leesweergave, in het lichte en donkere thema.

De tekst blijft als Markdown opgeslagen. Bestaande Markdown blijft bruikbaar; bestaande gewone tekst krijgt pas opmaak wanneer je die zelf aanbrengt. Alleen openen verandert niets aan de opgeslagen tekst. Opmaak maakt deel uit van **Alles opslaan**, ook bij onderdelen binnen tabbladen. Technische invoer, korte namen en selecties blijven gewone velden.

Er is geen externe editordienst of API nodig en er zijn geen extra credits voor het gebruik van de editor.

## Toevoegen, verwijderen en fouten

Events hebben één startdatum en één einddatum, elk met een afzonderlijk optioneel tijdveld. Een onbekend uur blijft leeg. De einddatum kan niet vóór de startdatum liggen; op dezelfde dag kan de eindtijd niet vóór de starttijd liggen. De editor en server controleren dit vóór gezamenlijke opslag. Ongewijzigde precieze tijdstippen blijven behouden, ook rond de omschakeling van zomer- en wintertijd.

Toevoegen en verwijderen binnen de editor verandert eerst alleen de invoer. **Verwijderen bij opslaan** kan worden teruggedraaid vóór de gezamenlijke opslag. Annuleren verwerpt de invoer. Een opslagfout bewaart de invoer in de editor en draait de volledige databasewijziging terug.

Als een dossier of onderdeel ondertussen gewijzigd is, weigert de opslag de verouderde versie. Vergelijk de recente versie vóór je opnieuw probeert; de editor overschrijft haar niet stilzwijgend.

Bestaande koppelingen die je niet verandert, blijven behouden. Inkomende dossierrelaties kunnen via hun andere endpoint worden gewijzigd. Eventtaken gebruiken dossierrelaties; een taak kan daarnaast haar eigen project behouden.

## Rechten en afzonderlijke acties

De bestaande toegangsrechten blijven gelden voor de fiche én elk onderdeel. Onderdelen waarvoor je geen wijzigingsbevoegdheid hebt, blijven alleen leesbaar. Een vrijwilliger kan een eigen kost indienen zonder financiële beheerrechten.

Goedkeuren, betalen, publiceren/verzenden, Drive-documenten genereren en Google Calendar synchroniseren blijven afzonderlijke acties. De gezamenlijke opslaanknop start geen externe agentrun. Bij nieuwsbrieven bewaart ze eerst het lokale concept; gebruik daarna **Gmail-concept bijwerken** voordat je goedkeuring vraagt. Dat voorkomt goedkeuring van een oudere Gmail-versie.

Handmatig gewijzigde Google-documentregistraties verliezen hun oude claim dat de bronmetadata gecontroleerd is. Bronlinks kunnen afzonderlijk met het dossier worden opgeslagen. Google-registraties behouden de bestaande beperkingen per soort registratie.

## Uitrol en controle

Voer vóór gebruik de migratie `20261008094405_unified_dossier_editor.sql` uit en deploy vervolgens de bijbehorende GitHub-image naar DEV. De opslagfunctie werkt onder de aangemelde gebruiker met bestaande rijbeveiliging, een vaste veldcatalogus en één transactie. Er zijn geen nieuwe tabelrechten of verhoogde schrijfrechten toegevoegd.

De lokale proeven gebruiken synthetische gegevens en controleren alle 22 modellen, terugdraaien bij fouten, versieconflicten, toegangsgrenzen, eventonderdelen en de vrijwilligers-kostenroute. Een DEV-controle na uitrol blijft nodig voor echte dossiers, sessies en externe integraties.
