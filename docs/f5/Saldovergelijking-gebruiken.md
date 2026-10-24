# Saldovergelijking — voorbereiding zonder boekingen

Het CC-scherm `/app/bucks/reconciliatie` is standaard uit en vereist `manageRewards` plus de actuele databasebevoegdheid. Een vrijgegeven beheerder kan later een consistente CC-snapshot downloaden, een genormaliseerd bestand lokaal kiezen en een privé controleverslag opslaan. Geen bestand wordt vanaf dat scherm naar een extern platform gestuurd; er bestaat geen import- of boekknop.

Het offline pakket biedt dezelfde vergelijking met Node.js 24.14 of nieuwer:

```text
node ops/balance-compare.mjs --snapshot <CC-stand.json> --external <genormaliseerd.csv> --total <gecontroleerd-extern-totaal> --output <nieuw-verslag.json>
```

Dit leest uitsluitend de genoemde lokale bestanden en schrijft een nieuw verslag zonder overschrijven. Het maakt geen netwerk-, database-, account- of saldowijziging. Gebruik een afgeschermde map buiten chat/Git en gewone gebruikersrechten.

Verplichte CSV-kolommen: `external_id,cc_user_id,bucks`. `external_id` is bijvoorbeeld `twitch:123` of `discord:111111111111111111` (**TESTFIXTURE**). `cc_user_id` is een expliciet gecontroleerde bestaande account-UUID, of leeg als de koppeling nog onbekend is. Geen namen/e-mailmatch, decimalen, negatieve bedragen of formules. Maximum 10.000 regels en 2 MB. De CC-snapshot ondersteunt maximaal 5.000 accounts en 100.000 ledgerregels in de fingerprint; bij overschrijding stopt de voorbereiding.

Het verslag toont technische somcontrole, bestandsfingerprint, oorspronkelijke CC-account-/ledgerfingerprints, verschillen, reserveringen en ontbrekende/dubbele koppelingen. De accountfingerprint wordt lokaal opnieuw berekend. Een opgegeven bronbestand is daarmee niet cryptografisch ondertekend of automatisch authentiek verklaard; bronherkomst, peildatum en mapping vragen menselijke controle. Records buiten het bestand worden niet uit CC verwijderd of vervangen.

`comparisonComplete=true` betekent alleen dat het genormaliseerde bestand technisch vergeleken is en het opgegeven externe controletotaal aansluit zonder de opgesomde technische problemen. Het betekent niet dat beide saldi gelijk zijn, dat de mapping is bewezen of dat een overname is goedgekeurd. `mappingVerifiedBySystem=false`, `executionAuthorized=false`, `wouldWrite=false` en `requiresDecision=true` blijven altijd staan.

Een daadwerkelijke externe export, cutoff, mappinggoedkeuring, somcontrole met die bron en eventuele saldo-overname blijven afzonderlijke F6-besluiten. Bestaande reserveringen, historiek en correcte CC-boekingen blijven behouden.
