# Campagnekanalen behouden bij bewerken

## Probleem en herstel

De DEV-proef event → campagne → content bevestigde dat het Eventpromo-sjabloon Eventbrite toevoegt, terwijl het campagneformulier dit kanaal niet aanbiedt. Een gewone notitiewijziging overschreef de kanalen daardoor zonder Eventbrite.

Het campagneformulier biedt nu de standaardplatformen, alle kanalen uit campagnesjablonen en bestaande aanvullende kanalen aan, zonder dubbels. Opgeslagen kanalen blijven aangevinkt. Een gebruiker kan een kanaal bewust uitvinken. De platformkeuze voor social planning blijft gelijk.

## Validatie en uitrol

- Renderproeven met het echte formulier en de echte updateactie controleren behoud voor alle sjablonen, aanvullende kanalen, deduplicatie en bewust verwijderen.
- Bestaande schrijfbevestiging en rechten blijven intact; geen databasewijziging.
- GitHub merge → bestaande DEV-imagebouw → serverdeployment → live hercontrole. Geen migratie, nieuwe dependency, dienst of betaalde agentrun.
- Na uitrol: maak een gemarkeerde tijdelijke Eventpromo-campagne via het sjabloon. Controleer Eventbrite, wijzig alleen notities en controleer behoud. Vink Eventbrite bewust uit en controleer verwijdering. Ruim het proefrecord op.

De oorspronkelijke FoM-gegevens zijn niet aangepast. Punt 2 blijft open voor de resterende workflows; punten 3 en 4 zijn niet gestart.
