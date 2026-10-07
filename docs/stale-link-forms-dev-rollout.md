# Verouderde linkformulieren — DEV-acceptatie

## Herstel

Een linkformulier dat openstond voordat het dossier werd verwijderd, kon nog schrijven en daarna naar een ontbrekend detail navigeren met `succes=link-opgeslagen`.

Toevoegen, wijzigen en verwijderen van dossierlinks controleren nu na de bestaande bevoegdheidscontrole eerst het dossier: juiste organisatie, juiste ID en `deleted_at IS NULL`. Een ontbrekend of onleesbaar dossier blokkeert de linkbewerking en stuurt terug naar het moduleoverzicht met `fout=dossier-niet-beschikbaar`. Een mislukte controle gebruikt `fout=dossier-controleren`. De overzichten geven een begrijpelijke foutmelding. De bestaande controle op het ID van de daadwerkelijk gewijzigde of verwijderde link blijft behouden.

Deze controle herstelt een reeds verouderd formulier. Zij is geen databasevergrendeling tegen een dossierverwijdering die precies tussen de controle en de linkbewerking plaatsvindt. De bestaande relatievergrendeling is niet gewijzigd.

## Uitrollen

Geen databasemigratie of nieuwe configuratie nodig. Na merge laat GitHub de DEV-image bouwen; daarna de bestaande serverdeploy uitvoeren.

## Tests

- Geautomatiseerd: zeven dossiertypen, telkens toevoegen/wijzigen/verwijderen, met actief dossier, ontbrekend/verwijderd/ander-organisatie/onleesbaar dossier, fout bij controle, verkeerd teruggegeven ID en geweigerde bevoegdheid. Controleert nul writes bij weigering en exacte terugkeerroute.
- Bestaande servertests: ontbrekende link, verkeerd ID en schrijffout leveren geen succes; organisatie-, dossier- en linkfilters blijven verplicht.
- De browserbevestiging voor linkverwijdering liep tijdens de vorige DEV-controle vast in de browserbediening. Dit bewijst geen fout in de verwijderfunctie; live acceptatie blijft open tot die stap zichtbaar uitgevoerd kan worden.

## Live na deployment

Gebruik uitsluitend tijdelijke DEV-data met `TESTFIXTURE — NIET PUBLICEREN`.

1. Maak een tijdelijke campagne zonder sjabloon en voeg een testlink toe. Bewerk de link en lees de wijziging terug.
2. Open het linkbewerkformulier in een tweede tab. Verwijder de link in de eerste tab en bevestig. Controleer dat de link weg is. Dien het oude formulier in: foutmelding, geen succes en geen herstelde link.
3. Voeg opnieuw een tijdelijke link toe. Open een toevoeg-, bewerk- en verwijderformulier voordat het brondossier wordt verwijderd. Verwijder het dossier via de normale werkweergave. Dien de oude formulieren in: terug naar het campagneoverzicht met `dossier-niet-beschikbaar`, zonder 404 of linkbewerking.
4. Ruim tijdelijke dossiers via de normale werkweergave op. Bewaar historiek. Herhaal met andere rollen wanneer die beschikbaar zijn; lokale tests zijn geen bewijs van live rolacceptatie.

Geen betaalde BESC-agentrun nodig.
