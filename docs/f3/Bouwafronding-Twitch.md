# F3 — bouwafronding, Twitch eerst

23 oktober 2026. Opdracht: resterende F3-functies afbouwen; uitgebreide praktijktesten bewaren voor de integrale acceptatie vóór productie. Twitch is door Linda gekozen als eerste echte bron. Deze oplevering bevat code en een aanvullende migratie, geen nieuwe live wijziging of echte gegevensophaling.

## Gebouwd

- Echte campagnes expliciet openen met een bestaand besluitdocument, naast de bestaande fictieve proef. Campagnegebonden taken, persoonlijke deelname, onafhankelijke review, intrekking en documentrechten blijven vereist. Een voorzittersmandaat geeft geen automatische privémeetinzage.
- Eigen campagnes bereikbaar via Mijn werk → Mijn campagnebijdragen en beoordelingen. De database geeft alleen actuele campagnetaken of eigen deelname terug; algemene campagnemanagerrechten worden hierdoor niet uitgebreid.
- Twitch-VOD-, clip- en kanaallinks veilig ontleden, naast YouTube-links. Een link indienen haalt geen gegevens op. Officiële bronregistratie is voor Twitch gebouwd; YouTube blijft handmatige/exportinvoer.
- Expliciete bronbinding aan deelnemer, gekoppelde Twitch-identiteit, bestaand aangesloten organisatieaccount en bronbewijs. Bestaande servercredentials worden hergebruikt; geen tokens in formulieren, rapporten of exports.
- Handmatig gestarte officiële bronregistratie met reservering, ontdubbeling, cooldown, dagbudget, time-out en begrensde respons. Tokenidentiteit wordt vóór en na het ophalen gecontroleerd. Alleen de server mag een officiële meting vastleggen. De database controleert bij vastleggen opnieuw sessie, taak, deelname, bron, credentialversie en bijdrageversie. Historische bronmetingen worden bij ingetrokken bronbinding niet meer getoond of geëxporteerd.
- Engagementpercentage met expliciete teller, noemer en definities. Teller kan engagements, likes + reacties, of likes + reacties + gedeeld zijn; noemer views, impressies of bereik. Alleen volledige, actuele periodewaarden worden gecombineerd. Noemer nul, ontbrekende of tegenstrijdige input geeft geen percentage. Bij bereik blijft het percentage per bijdrage; geen opgeteld uniek campagnebereik.
- Bronvergelijking van officiële waarden met een gecontroleerde export of handmatig bewijs, met afzonderlijke meetmomenten en referenties. Verschillen worden ter beoordeling getoond. HTML en CSV gebruiken dezelfde berekening en bronvoorwaarden.
- Cumulatieve tellers krijgen een verschil per bijdrage bij gelijke bron en definitie, zonder periodeoptelsom. Negatieve tellerwijzigingen blijven onbekend. Momentopnamen van huidige kijkers worden evenmin campagnebereik of viewer-hours.

## Twitch-capabilities

| Invoer | Officiële waarde | Betekenis |
| --- | --- | --- |
| VOD | `view_count` | Cumulatieve videoweergaven |
| Clip | `view_count` | Cumulatieve clipweergaven |
| Eigen kanaal | `viewer_count` | Huidige kijkers op één meetmoment; offline is bekende nul |

Een ontbrekende video/clip is een ontbrekende waarde, geen bewezen verwijdering. Deze endpoints leveren geen campagne-impressies, uniek campagnebereik of engagementteller. Die waarden vereisen aanvullend toegestaan bronbewijs. Er is geen automatische discovery, poller, tracking of publicatiefunctie toegevoegd. Iedere handmatige bronactie valideert de token; er wordt geen nieuwe continue OAuth-sessie of achtergrondsync gestart. Een ongeldig token vraagt herstel via de bestaande integratie en een nieuwe expliciete bronbinding. Twee remote validaties garanderen geen detectie van een providerintrekking ná de laatste validatie; dit blijft een grens van de providerketen.

Bronnen: [Twitch tokenvalidatie](https://dev.twitch.tv/docs/authentication/validate-tokens/), [Get Videos](https://dev.twitch.tv/docs/api/reference/#get-videos), [Get Clips](https://dev.twitch.tv/docs/api/reference/#get-clips), [Get Streams](https://dev.twitch.tv/docs/api/reference/#get-streams).

## Migratie en activering

Aanvulling: `20261023134550_f3_campaign_twitch_completion.sql`. Historische migraties blijven byte-inhoudelijk gelijk na normalisatie van regeleinden. Twee extra private RLS-tabellen; geen rechtstreekse client- of service-CRUD-grants. De nieuwe servercommit-RPC is uitsluitend voor service_role; gebruikers kunnen geen officiële meting via handmatige invoer vervalsen.

Het [aanvullende releasemanifest](../../ops/f3-completion-release-manifest.json) legt de hashes en de eerder gecontroleerde historie van 125 vast. Toepassing op die ongewijzigde baseline zou 126 registraties opleveren; de oude operationele seed blijft uitgesloten. Er is nu geen Cloudcontrole of migratie uitgevoerd. De oorspronkelijke [release](../../ops/f3-release-manifest.json) blijft ongewijzigd.

Nieuwe serverflags zijn standaard uit door afwezigheid of iedere andere waarde dan `true`:

- `BESC_CAMPAIGNS_ENABLED`: echte campagnewerkstromen.
- `BESC_CAMPAIGN_TWITCH_COLLECTION_ENABLED`: afzonderlijke officiële Twitch-ophaalactie; vereist ook de voorgaande flag.

`BESC_CAMPAIGNS_PILOT_ENABLED` blijft uitsluitend voor fictieve campagnes. Bestaande Twitch-accountkoppeling alleen geeft geen campagnebronbevoegdheid. Migratie, beoordeelde image, expliciete activering en benoemde echte campagne/account/deelnemer horen bij de latere gecontroleerde DEV-uitvoering. Er wordt geen rol, account, deelname of doeltekst automatisch toegevoegd.

## Beperkte verificatie en resterende acceptatie

Gerichte lokale controles dekken engagement/noemer nul/ontbrekend, cumulatieve tellerreset, bronvergelijking, veilige Twitch-links, tokenvalidatie vóór/na, eigenaarcontrole en een geïsoleerde databaseketen met servercommit en bronintrekking. Dat is geen echte Twitch- of Cloud-acceptatie. TypeScript, gerichte lint en historische releasehashes worden bij deze oplevering gecontroleerd; er wordt geen uitgebreide lokale regressie- of live browserronde gestart.

De brede praktijkmatrix, echte bronvensters, providerintrekking/quotavarianten, alle rollen en volledige terugval-/exportketen blijven voor de integrale acceptatie vóór productie. Het eerdere [register met 53 gevallen](resultaatgevallen.json), F1-openpunten en 38 gedeeltelijke F2-gevallen plus P10 blijven behouden. R03 is nu gebouwd en gericht op rekenniveau gecontroleerd. Geen formele productieacceptatie of echte campagneresultaten worden uit deze bouw afgeleid.
