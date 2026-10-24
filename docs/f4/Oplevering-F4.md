# F4-oplevering: kandidaat voor review

F4 omvat creatorprofielen, Mijn BESC en private aanvragen, partnerpublicaties, vacatures en sollicitaties, partnerdelegatie, statische pagina’s, navigatie, inhoudsmigratie, oude redirects en algemeen contact. De bestaande nieuws- en eventketen wordt hergebruikt. CC beheert dossiers en vrijgaven; de website blijft een afzonderlijke private repository met een beperkte serververbinding.

## Wat het kandidaatpakket bevat

Zeven geordende SQL-migraties, de vingerafdrukken van de 126 verwachte historische registraties, zeven gekoppelde releasemanifesten, gelijkheidscontrole van zes gedeelde contracten, implementatiedocumentatie, het bestaande acceptatie- en afhankelijkhedenregister en de bronreview voor 98 oude URL’s. Alle acht nieuwe functies staan standaard uit. Een alleenlezende servervoorcontrole toont capaciteit, images en booleaanse instellingcontroles zonder geheime waarden.

Maak het pakket vanuit schone, gecommitte bronmappen met `node ops/package-f4-candidate.mjs --website <website-repo> --output <nieuwe-map>`. Met `--check` wordt niets geschreven. Controleer het uitgepakte pakket met `node verify-f4-candidate.mjs`. De bestandenlijst en SHA-256-controles detecteren overdrachtsfouten; ze vervangen geen bronreview of betrouwbare herkomst.

Dit is geen uitvoerbaar uitrolpakket. `deployment_ready` en `database_apply_authorized` blijven false, beide imageverwijzingen blijven leeg. Het pakket voert geen SQL uit en bevat geen wachtwoorden, omgevingsbestanden of back-ups.

## Volgorde na review

1. Beoordeel beide PR’s afzonderlijk, merge na toestemming en controleer de bestaande CI en beide imagebouwen. Leg de exacte goedgekeurde digests vast.
2. Controleer opnieuw uitsluitend lezend de Cloud DEV-historie, het schema, bestaande rijen, Auth en Storage. Verwacht 126 registraties; iedere afwijking vraagt beoordeling. Controleer capaciteit en de echte website-Composepaden op BESCSRVDEV.
3. Maak en controleer een nieuwe afgeschermde back-up, een kopie buiten de VPS en een geïsoleerde herstelproef. Behoud de afzonderlijke open bewijspunten uit F0–F3.
4. Maak op basis daarvan het begrensde migratie- en serverpakket met de exacte zeven migraties en image-digests. Vraag de afzonderlijke DEV-vrijgaven. Geen losse SQL plakken en geen algemene push die oude seed of onbekende migraties meeneemt.
5. Pas na vrijgave de migraties gecontroleerd toe met behoud van oude registraties en rijen; controleer 133 registraties en de postcondities. Stop bij onbekende uitkomst en inspecteer eerst.
6. Rol CC en website afzonderlijk uit met vastgelegde images en bewaarde terugvalconfiguratie. Behoud Caddy, Twitch en andere instellingen. Alle nieuwe F4-functies blijven uit tot de afzonderlijke activering is besloten.
7. Stel actuele teksten, toegang, behandelrollen, bronbeoordelingen en inhoudsvrijgaven expliciet vast. De 98 bronregels en drie concepten worden niet automatisch geïmporteerd of gepubliceerd. Beoordeel ook de huidige externe formulieren en links.
8. Voer de uitgebreide integrale acceptatie uit vóór productie. De oorspronkelijke 46 geplande gevallen en eerdere open bewijsgrenzen zijn niet door deze bouwfase afgetekend.

## Terugval

Bewaar beide huidige images en afzonderlijke configuraties vóór iedere vervanging. Een webterugval is geen databaseherstel. De migraties zijn additief maar hebben nog geen actuele live terugvalproef; leg de gecontroleerde combinatie met de vorige images vast vóór vrijgave. Geen automatische neerwaartse SQL of verwijdering van dossiers. Bij twijfel nieuwe functies sluiten en bewijs bewaren.

## Status

De implementatie kan worden gereviewd. Er is in deze F4-bouwfase niets live gemigreerd, gedeployd, geactiveerd, toegekend of gepubliceerd. Een geslaagde bouw maakt F4 niet formeel of productierijp afgerond.
