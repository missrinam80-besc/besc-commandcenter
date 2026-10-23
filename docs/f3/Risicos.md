# Risico's en beslispoorten

| Risico | Gevolg | Beheersing en stopvoorwaarde |
| --- | --- | --- |
| Brede oude snapshotinzage of adminexport | Privéinzichten bij onbevoegde lezer. | Actuele policies plus alle serviceprojecties controleren; echte private data pas na A01–A12/M12. |
| Organisatiebrede doelcode gebruikt als campagne-scope | Intrekking raakt verkeerde campagne of oude verwerking herleeft. | A/B-isolatie en tekst-/scopeversie expliciet ontwerpen; regressie met F1 vereist. |
| Ontbrekende platformtoegang | Code lijkt werkend terwijl benodigde metric niet leverbaar is. | Capability per account/metric bewijzen; adapter blijft geblokkeerd of exportfallback apart besluiten. |
| Verkeerde som of venster | Misleidend sponsor-/campagneresultaat. | Definities, noemer, kwaliteit en vergelijkbaarheid in rapport; geen unieke reach uit optelsom. |
| Postidentiteit en eigendom verward | Dubbele of onjuiste creatorbijdrage. | Canonieke identiteit los van ownership en verificatie; conflicten naar review. |
| Export/bronbestand als aanvalsvector | SSRF, formule-injectie of geheimenlek. | Geen generieke URL-fetch; bron-/CSV-/bestandstoegang en logging gericht toetsen. |
| Oude image tegen nieuw privémodel | Rollback verruimt toegang. | Vooraf native compatibiliteitsproef; veilige uitschakeling gaat vóór automatisch terugzetten. |
| Kleine DEV-server | Geen ruimte voor image én rollback. | Actuele capaciteit vlak vóór uitrol; niet blind images/back-ups verwijderen. |
| Echte gegevens zonder inhoudelijke afspraken | Ongewenste verwerking/bewaring. | Doeltekst, deelnemers, ontvangers en bewaarbehandeling vóór echte pilot vaststellen. |
| Open F1/F2-varianten verdwijnen uit beeld | Onterecht complete acceptatie. | Oorspronkelijke IDs behouden; F3-eigen bewijs en formele afsluiting per scope. |

Er zijn nog geen eigenaren, deadlines of budgetten voor deze risico's toegewezen. De werkpakketten benoemen de benodigde verantwoordelijke functies; concrete toewijzing valt onder D02/D05.
