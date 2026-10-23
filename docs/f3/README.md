# F3 — campagneproef: uitvoeringspakket

Status: voorbereid ter goedkeuring op 23 oktober 2026. Geen F3-applicatiecode gebouwd, geen migratie uitgevoerd en geen live accounttoegang uitgebreid.

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

Pakketcontrole: `node docs/f3/validate-preparation.cjs`. Dit valideert 53 geplande gevallen in zeven pakketten, acht fictieve rekenvoorbeelden, bronhashes en lokale links. Het voert geen product- of platformproeven uit.

## Wat gereed betekent

Voorbereid betekent dat opdracht, impact, volgorde, gegevensgrenzen en toetsbare oplevercriteria beoordeelbaar zijn. Gebouwd, geïsoleerd getest, gemigreerd, gedeployed en live aanvaard krijgen later elk eigen bewijs. Geen gepland acceptatiegeval is nu als geslaagd aangemerkt.

Na inhoudelijk akkoord begint F3.0 met actuele, alleenlezende Cloud- en accountinventarisatie. De bouw kan vervolgens met fictieve gegevens starten. Echte deelnemers, platformaccounts en meetvensters worden pas gebruikt wanneer hun benoemde besluiten en toegang zijn bevestigd.
