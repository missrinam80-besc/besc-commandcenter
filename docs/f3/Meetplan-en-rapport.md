# Meetplan en intern rapport

## Definities vóór meten

Leg per gekozen platform vast: eigen account, metricnaam/definitieversie, eenheid, scope (account/post), semantiek (cumulatieve teller of periodewaarde), tijdzone, twee begin-/eindvensters, toegestane gegevens, bron, quota en peildatum. Vensters zijn UTC halfopen [start,einde); toon Brussel daarnaast voor mensen. Een dag rond klokwissel heeft niet vanzelf 24 uur.

Twee ophaalmomenten zijn geen bewijs van twee periodewaarden. Een cumulatieve teller mag alleen als verschil worden gebruikt wanneer dezelfde post, definitie, bron en tellersemantiek vergelijkbaar zijn. Negatieve delta, reset of revisie wordt conflict, geen negatief bereik en geen nul. Account-/postniveau en lifetime-/periodemetrics niet mengen. Ophaaldatumfilter in bestaande export is geen metricperiodefilter.

## Waarde en kwaliteit

Waarde 0 is een bekende gemeten nul. `null` met reden is ontbrekend, niet toegankelijk, niet ondersteund of fout. Daarnaast zijn partial, stale en conflicted kwaliteitslabels mogelijk; die blijven zichtbaar naast een aanwezige waarde. Freshnessgrens per metric vooraf vastleggen; niet één willekeurige TTL voor alle platformen. Bewaar recente fout en laatst geldige historische meting apart.

Rapport toont per KPI: definitie, bron, meetperiode, gemeten unieke bijdragen, aantal verwacht/toepasselijk, ontbrekend, uitgesloten, verouderd en conflicten. Denominator voor dekking wordt vastgezet op geverifieerde en toepasselijke geselecteerde bijdragen; kandidaten, ontbrekende deelname en verwijderde bijdragen afzonderlijk tellen. Geen ongedocumenteerde noemerverkleining om dekking mooier te maken.

Som alleen optelbare waarden met dezelfde definitie, eenheid en niet-overlappende scope. Bereik over posts/platforms nooit als uniek campagnebereik optellen. Engagementrate alleen bij expliciet gekozen noemer en bekende inputs; bij noemer 0 is de rate niet berekenbaar. Vergelijking met ontbrekend basisvenster is onbekend. Procentuele verandering met basis 0 is niet berekenbaar; absolute verandering kan wel bekend zijn.

## Vereist intern rapport

Campagne/context; deelname en geverifieerde bijdragen; twee vensters en vergelijking per metric; bron-/freshness-/dekkingsstatus; uitgesloten en verwijderde bijdragen; benchmarkverschillen; beperkingen en opvolgtaken. Toon eigen accountmetingen en creatorbewijs gescheiden. Geen sponsor-ROI of conversies zonder daarvoor geaccepteerd meetcontract.

HTML en CSV gebruiken dezelfde geautoriseerde inputrevisie. CSV beschermt tegen formule-injectie en exporteert ontbrekend niet als nul. Geen tokens, private bron-URL's, interne notities of persoonscontacten in veilige rapportprojectie. Een gedownloade export kan niet technisch worden teruggehaald; toegang begrenzen en de ontvanger-/retentiebehandeling vastleggen. Geen publieke rapportlink in F3.

Officiële bronvergelijking per gekozen platform en twee vensters vastleggen. Als API geen benodigde metric levert, mag een gecontroleerde bronexport als duidelijk gelabelde fallback dienen. Dit maakt de ontbrekende live adapterproef niet geslaagd. Metricool blijft benchmark; geen vervanging claimen. Fictieve [rekenvoorbeelden](meetvoorbeelden.json) zijn specificatie, geen echte BESC-resultaten.
