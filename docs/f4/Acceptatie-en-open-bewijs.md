# Acceptatie en open bewijs

De gebruiker wil beperkte noodzakelijke controles tijdens bouw en één uitgebreide hele-app-acceptatie vóór productie. Deze voorbereiding bevat **46 geplande gevallen**. Geen ervan is als productproef uitgevoerd of geslaagd aangemerkt.

## Drie bewijsgrenzen

1. **Pakketcontrole nu:** bronhashes, acht werkpakketten/afhankelijkheden, JSON-documenten/DTO-fixtures, 98 unieke URL-records, ongewijzigde F2-openpunten en geen uitvoeringsclaim. Dit bewijst geen werkende website/API/database.
2. **Minimaal tijdens bouw:** type/lint/build en gerichte controles waar een wijziging toegang, opslag, publicatiereview of contractcompatibiliteit raakt. Geen volledige handmatige browser-/actorwisselronde per onderdeel. Bestaande CI niet uitschakelen om een wijziging groen te tonen.
3. **Vóór productie:** uitgebreide gebruikers-/tenant-/sessie-/privacy-/media-/intrekkings-/export-/notificatie-/misbruik-/rollbackmatrix, toegankelijkheid en volledige inhoudscontrole. Nieuwe echte verwerkingen of tijdelijke extra rollen krijgen hun eigen expliciete context en toegang; uitstel is geen toestemming om die grens over te slaan.

Alle gevallen behouden hun ID. Bij uitvoering: exacte code/image/migratie, actorrol, omgeving, methode, resultaat en beperking vastleggen. Alleen specifiek bewezen gedrag krijgt bewijs; een geïsoleerde fixture bewijst geen provider, live toestemming of echte browserketen.

## Overgenomen punten

[Het open register](open-afhankelijkheden.json) bewaart de 38 gedeeltelijk gedekte F2-gevallen en P10. De specifieke F1-rolwissel/export/notificatievarianten blijven onderscheiden. F2-image-terugval sluit niet automatisch ieder ander herstelpad. De oorspronkelijke 53 F3-case-ID’s blijven zichtbaar; latere fictieve DEV-proef en afgebouwde Twitch-code maken echte provider-/campagneacceptatie niet compleet.

F3 is qua bouw en DEV-uitrol afgerond op basis van de door de gebruiker aangeleverde uitvoer. F4-voorbereiding heropent die bouw niet. Uitgestelde uitgebreide acceptatie wordt in F4.7 samengebracht voor de productiepoort; er is nu geen nieuwe testlogin, persoonlijke instemming of live provideroproep nodig.

## Voorbereid versus gereed

Dit pakket is reviewbaar wanneer alle acht onderdelen een uitwerking, bron, rechten-/API-grens, afhankelijkheid, migratie-/terugvalbehandeling en acceptatieplan hebben. **Gebouwd** vereist de daadwerkelijke code en gerichte minimale verificatie. **DEV-uitgerold** vereist de exacte migratie-/image-/configuratie-uitvoer. **Productierijp** vereist de gezamenlijke preproductieacceptatie en het F6-besluit. Geen van die latere statussen wordt door het voorbereidingspakket toegekend.
