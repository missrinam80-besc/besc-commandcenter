# Materialen selecteren en aanpassen

Onder **Organisatie → Materialen & resources** staan de acties boven de inventaris. De onduidelijke rijacties zijn vervangen door selectievakjes en knoppen met tekst.

1. Vink één of meer items aan, of kies **Alles** voor de geladen lijst.
2. **Bewerken** opent de fiche van precies één geselecteerd item. Bij meerdere selecties is deze knop uitgeschakeld.
3. **Locatie / status aanpassen** werkt op alle geselecteerde items. Vink locatie, status of beide aan. Niet aangevinkte velden blijven behouden. Een aangevinkte lege locatie wist de bestaande locatie.
4. **Archiveren** zet alle gekozen items op Gearchiveerd. **Verwijderen** haalt ze uit de operationele inventaris met de bestaande zachte verwijdering; er worden geen materiaalrecords fysiek vernietigd. Beide acties tonen eerst een bevestiging met de geselecteerde items.

Zonder selectie zijn de wijzigacties uitgeschakeld. Gewone kijkers zien de inventaris zonder selectievakjes en wijzigknoppen. De bestaande materiaalrechten blijven gelden. Gegevens zoals verantwoordelijke, waarde, koppelingen, type, notities en serienummer blijven bij bulkacties behouden. Een gearchiveerd item blijft met die status in de materiaallijst staan, zoals bij de eerdere archiveeractie.

De selectie en ingevulde velden blijven bij een mislukte opslag behouden. Een succesvolle actie meldt het aantal aangepaste items, wist de selectie en vernieuwt de lijst. De databank verwerkt de hele selectie gezamenlijk: ontbrekende, reeds verwijderde of ontoegankelijke items en andere fouten draaien de volledige actie terug. Er kan geen gedeeltelijk succesvolle bulkactie worden gemeld.

## DEV-uitrol en acceptatie

Voer `20261009100412_bulk_asset_actions.sql` uit vóór deployment van de bijbehorende app-image. Deze migratie voegt één RPC toe en bewaart bestaande tabellen, RLS en records. De functie gebruikt de bestaande organisatie- en materiaalrechten. Test uitsluitend met daarvoor aangemaakte testitems.

Controleer op DEV: nul/één/meerdere selecties, alles selecteren en deselecteren, één fiche openen, alleen locatie wijzigen, locatie wissen, alleen status wijzigen en beide velden samen wijzigen. Controleer dat andere gegevens behouden blijven. Annuleer eerst een archiveer-/verwijderbevestiging en controleer dat niets gebeurt; bevestig daarna voor testitems. Controleer de aantallen en dat kijkers geen beheeracties krijgen. Controleer ook licht/donker en een smal scherm.

Lokale en automatische tests gebruiken synthetische data. Ze bewijzen geen uitgevoerde DEV-migratie of live gebruikersacceptatie.
