# CA06: lokale controle van bronmetingen en rapportexport

Gecontroleerd op 7 november 2026 met fictieve, gemarkeerde gegevens. Dit is geen live campagneacceptatie en geen bevestiging van echte accountmetingen.

## Uitkomst

93 gerichte lokale controles slagen. De bestaande 71 gevallen zijn uitgebreid met 22 controles van de daadwerkelijke rapportpagina en CSV-route, waarbij authenticatie en databronnen door lokale fixtures zijn vervangen. Er zijn geen nieuwe applicatiefouten aangetoond en geen runtime-, SQL- of configuratiewijzigingen nodig. TypeScript, ESLint en diffcontrole slagen.

De nieuwe controles bewijzen voor de onderzochte gevallen:

- Scherm en CSV behouden bekende nul, vaste bron-URL, meetdefinitie, eenheid, bronreferentie, meetmoment en exact dezelfde meetvensters. Kandidaten worden niet als geverifieerd resultaat meegeteld.
- Ontbrekende metingen blijven onbekend. Gedeeltelijke dekking blijft zichtbaar en geeft geen vergelijkingspercentage alsof beide vensters volledig zijn.
- Een exportselectie neemt een nieuwere officiële API-waarneming niet stilzwijgend over. De bronselectie blijft zowel in de uitvoer als in de downloadlink behouden.
- Een vastgelegde rapportrevisie wordt met het eigen revisie-ID opgehaald, ook als de actuele metingen verschillen.
- Bij downloaden worden sessie, lidmaatschap, actuele rapportrechten en ingeschakelde campagnevorm opnieuw gecontroleerd. Een eerder getoonde link geeft geen blijvend recht op export na intrekking. Fouten geven geen CSV-inhoud terug.
- Dubbele of onbekende queryvelden en ongeldige definities, bronnen en overlappende/toekomstige meetvensters worden geweigerd.
- CSV blijft `no-store`, een downloadbijlage met teksttype, en beschermt formuleachtige cellen. Meerregelige bronreferenties en aanhalingstekens blijven correct behouden.
- Cumulatieve tellerwijzigingen blijven verschillen per bijdrage; ze worden geen periodeoptelsom of uniek campagnebereik.

## Bewijsgrens en vervolg

De vaste voorbeelden controleren de rapport-/exportroutes met echte berekeningen en echte componenten; vervangen databronnen bewijzen geen live providerkwaliteit. Bestaande bronintrekking-, meetversie-, doel- en bevroren-rapportcontroles zijn als lokale regressies meegenomen. Er is in deze ronde geen aanvullende native PostgreSQL-proef gestart. Applicatiecode is gelijk aan de al geteste en uitgerolde versie van PR #142; daarom is geen nieuwe productiebuild nodig voor deze testuitbreiding.

Er is niets opgehaald bij YouTube, Twitch of andere providers en geen synchronisatie gestart. Er is geen Cloud-contact, geen nieuwe live registratie of toegang, geen publicatie, push, migratie of serveruitrol uitgevoerd.

Echte meetvensters, toegelaten bronbewijzen en een gecontroleerde live vergelijking blijven open. Daarvoor zijn eerst een expliciet gekozen campagne, geldige deelname, bronrechten en afzonderlijk goedgekeurde live uitvoering nodig. De uitgeschakelde campagneflags en uitgestelde CA02-praktijkproef worden door dit testverslag niet opgeheven.
