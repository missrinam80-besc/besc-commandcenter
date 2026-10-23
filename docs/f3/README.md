# F3 — campagneproef: uitvoeringspakket

Actuele bouwstand: [Bouwafronding met Twitch als eerste bron](Bouwafronding-Twitch.md). Op 23 oktober vroeg Linda de resterende functies te bouwen en uitgebreide acceptatie tot vóór productie uit te stellen. De fictieve DEV-proef is uitgevoerd en gesloten; de nieuwe bouw wordt afzonderlijk opgeleverd, zonder nieuwe live wijzigingen.

Het oorspronkelijke [fictieve bouwverslag](Implementatie-en-testbewijs.md), de [resultaten per geval](resultaatgevallen.json) en de onderstaande voorbereidingsstukken blijven bewaard met hun eigen bewijsgrens. Voorbereidingsaannames gelden niet als de actuele uitvoeringsstatus.

F3 levert één interne BESC-campagneketen: campagnefiche → geselecteerde creator → aantoonbare deelname en doelbinding → handmatig ingediende postlink → verificatie → bronmetingen in twee vergelijkbare vensters → gecontroleerd intern rapport. De bestaande campagne- en socialmodules blijven de basis. De publieke website blijft gesloten; Metricool blijft beschikbaar als benchmark.

F2 is voor de bewezen DEV-kern door Linda aanvaard, vastgelegd in website-PR3, merge `3c3a841a183c8f04f4e2394d41db1da5754ede01`. De 38 gedeeltelijk gedekte gevallen en P10 blijven afzonderlijk zichtbaar. Dit pakket neemt die niet over als geslaagde F3-proeven.

## Leesvolgorde

1. [Scope en beslispunten](Scope-en-besluiten.md).
2. [Bestaande code en voorgestelde wijzigingen](Fit-gap-en-code-impact.md).
3. [Rechten, doelbinding en gegevens](Gegevens-en-toegang.md).
4. [Postlinks en verificatie](Postlinks-en-verificatie.md).
5. [Meetdefinities en rapport](Meetplan-en-rapport.md).
6. [Afhankelijkheden van F1 en F2](Afhankelijkheden.md).
7. [Werkpakketten en uitvoering](Uitvoering-en-terugval.md).
8. [Acceptatie en bewijs](Acceptatie.md), [geplande gevallen](acceptatiegevallen.json), [rekenvoorbeelden](meetvoorbeelden.json).
9. [Bronmanifest](bronmanifest.json), [ongewijzigde F2-openpunten](f2-open-afhankelijkheden.json).
10. [Risico's en stopvoorwaarden](Risicos.md).

Pakketcontrole: `node docs/f3/validate-preparation.mjs`. Dit valideert 53 geplande gevallen in zeven pakketten, acht fictieve rekenvoorbeelden, bronhashes en lokale links. Het voert geen product- of platformproeven uit.

## Wat gereed betekent

Gebouwd, gericht gecontroleerd, gemigreerd, uitgerold en live aanvaard zijn afzonderlijke statussen. De actuele bouwafronding maakt resterende uitgebreide acceptatie niet automatisch geslaagd. De oorspronkelijke geplande gevallen blijven ongewijzigd.

Echte deelnemers, bronaccounts en meetvensters worden pas gebruikt wanneer de benoemde besluiten en toegang zijn vastgelegd. De nieuwe Twitch-ophaalactie staat standaard uit.
