> Actuele afsluiting (24 oktober 2026): [F4-bouw en DEV-oplevering](Afronding-DEV-20261024.md). Websitevrijgave en volledige productieacceptatie blijven open. Onderstaande voorbereiding en tussenstanden zijn historische momentopnamen.

Actuele bouwstatus: [contact](Implementatie-contact.md) en [F4-opleverkandidaat](Oplevering-F4.md). Review en live vrijgave blijven afzonderlijk.

> Vervolg: informatiepagina’s, bronbehandeling en tijdelijke stagingredirects zijn lokaal gebouwd. Zie [Implementatie inhoud](Implementatie-inhoud.md). De 98 URL’s en drie concepten blijven ongereviewd; niets is live geïmporteerd of gepubliceerd.

> Vervolg: partnerdelegatie en eigen profielvoorstellen zijn lokaal gebouwd. Zie [Implementatie delegatie](Implementatie-delegatie.md). Geen live toegang, migratie of uitrol uitgevoerd.

> Vervolg: vacatures en vacaturegebonden sollicitaties zijn lokaal gebouwd. Zie [Implementatie vacatures](Implementatie-vacatures.md). Geen live migratie, uitrol of activering uitgevoerd.

> Vervolg: partner- en esportsvermeldingen zijn lokaal gebouwd. Zie [Implementatie partners](Implementatie-partners.md). Geen live migratie, publicatie of uitrol uitgevoerd.

> Vervolg: de private samenwerkingsintake en eigen opvolging zijn lokaal gebouwd. Zie [Implementatie intake](Implementatie-intake.md). Overige F4-onderdelen blijven gepland; er is niets live geactiveerd.

> Bouwupdate: de eerste creatorketen is nu lokaal gebouwd. Zie [Implementatie creator](Implementatie-creator.md). Onderstaande voorbereiding, contractvoorstellen en geplande acceptatiegevallen blijven de historische scope; zij bewijzen geen volledige F4-uitvoering.

# F4 — publieke platformfuncties: volledig voorbereidingspakket

23 oktober 2026. Opdracht: F4 voorbereiden na afronding van de F3-bouw en DEV-uitrol. Dit pakket beschrijft bouwklare werkpakketten voor creatorprofielen, esports/partners, vrijwilligers, Mijn BESC en inhoudsmigratie. Er is in F4 nog geen applicatiecode of migratie gemaakt en geen live wijziging uitgevoerd.

De website blijft een afzonderlijke private repository. Het CC beheert brongegevens, behandeling en publicatie; de website gebruikt beperkte API’s. De bestaande publieke website blijft staan. Nieuwe platformfuncties blijven tijdens bouw achter afzonderlijke standaard uitgeschakelde schakelaars en gesloten stagingtoegang.

## Leesroute

1. [Scope, besluiten en open beleid](Scope-en-besluiten.md).
2. [Hergebruik en concrete code-impact](Hergebruik-en-code-impact.md).
3. [Werkpakketten en bouwvolgorde](Werkpakketten.md).
4. [Model, datacontracten en API](Datacontracten-en-model.md) en [voorgesteld contract](contracts/platform-contract.json).
5. [Rollen, eigen toegang en privacy](Rechten-en-privacy.md).
6. [Inhoud, media en redirects](Inhoud-en-migratie.md) met [alle 98 URL-records](content-migration-register.json).
7. [Release en terugval](Uitvoering-en-terugval.md).
8. [Minimale bouwchecks en latere acceptatie](Acceptatie-en-open-bewijs.md), [geplande gevallen](acceptatiegevallen.json), [F1/F2/F3-openpunten](open-afhankelijkheden.json).
9. [Bronnen en baselines](bronregister.json), [machineleesbare pakketstatus](manifest.json).

Eerste concrete bouwmijlpaal na uitvoeringsakkoord: F4.1 en daarna één creatorprofiel van eigen concept tot ingetrokken stagingprojectie. Geen nieuwe complete handmatige acceptatieronde per tussenrelease. De noodzakelijke controles op toegang, publicatie en duurzame opslag horen wel bij de bouw. De uitgebreide hele-app-acceptatie blijft vóór productie.

Pakketcontrole: `node docs/f4/validate-preparation.mjs`. Dit controleert alleen documenten, bronhashes, route-/veldcontracten en de volledigheid van het register; geen product-, Cloud- of live proeven.
