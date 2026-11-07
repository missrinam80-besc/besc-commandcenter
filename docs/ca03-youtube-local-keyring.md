# CA03 — lokale sleutelopslag en rotatie

Deze stap voegt een expliciete lokale sleutelring toe voor versleutelde YouTube-aanvragen. De koppeling blijft standaard uitgeschakeld; er zijn geen routes, taken, serverinstellingen of migraties toegevoegd. Alle sleutels, accounts en providerantwoorden in de proeven zijn fictief.

## Bescherming en opslag

De aanvraaggegevens worden met een willekeurige gegevenssleutel versleuteld. Die gegevenssleutels staan samen in een sleutelring die zelf met AES-256-GCM is versleuteld onder een **afzonderlijke hoofdsleutel**. In de lokale proeven levert de fixture die hoofdsleutel opnieuw aan na een herstart. De hoofdsleutel wordt niet naast de gegevenssleutels opgeslagen, niet uit bestaande instellingen gelezen en niet automatisch aangemaakt.

De sleutelring gebruikt de bestaande lokale bestandsadapter met onveranderlijke, gesynchroniseerde revisies en atomair publiceren zonder overschrijven. De proeven gebruiken afzonderlijke privémappen voor aanvragen en sleutelring. Domein, sleutelring-ID en revisie zijn geauthenticeerd; versleutelde aanvragen binden bovendien aan hun aanvraag-ID, revisie en sleutel-ID. Een gewijzigde sleutel-ID kan dus geen andere sleutel selecteren zonder dat de controle faalt.

De serverpoort geeft alleen versleutelen, ontsleutelen, beschikbaarheid en niet-geheime metadata vrij. Er is geen sleutel-exportfunctie. De hoofdsleutel staat in een private JavaScript-field; sleutelringinhoud wordt alleen intern ontsleuteld. Logs, browserresultaten en opslagbestanden bevatten geen onversleutelde sleutelwaarden. De gebruikte AES-GCM-functies zijn beschreven in de [Node 24-documentatie](https://nodejs.org/docs/latest-v24.x/api/crypto.html).

## Rotatie en oudere aanvragen

- `initialize` is een afzonderlijke expliciete handeling en weigert een bestaande sleutelring te vervangen. `open` maakt bij een ontbrekende of beschadigde sleutelring geen nieuwe aan. Een ontbrekende of verkeerde hoofdsleutel geeft geen toegang.
- `rotate(requestId)` maakt een nieuwe actieve gegevenssleutel en bewaart eerdere sleutels om oude aanvragen te lezen. Er wordt niets vernietigd. Herhalen van dezelfde aanvraag-ID maakt geen extra sleutel en activeert een eerder gebruikte sleutel niet opnieuw.
- Verschillende processen kunnen tegelijk roteren; revisiecontrole voorkomt dat een schrijver de sleutels van een andere schrijver verliest. Elke versleuteling leest de sleutelring opnieuw. Een reeds lopende schrijfhandeling kan nog haar eerder gelezen sleutel gebruiken; die blijft leesbaar. Er is geen atomaire transactie over zowel sleutelring als aanvraagbestanden.
- Nieuwe aanvragen via de sleutelring gebruiken een herkenbaar versie-2-formaat met sleutel-ID. Aanvragen van vóór deze stap, zonder sleutel-ID, worden alleen gelezen wanneer de oorspronkelijke gegevenssleutel expliciet als legacy-leessleutel is ingevoerd. Er wordt niet op andere sleutels gegokt.
- Een oude aanvraag wordt bij de volgende toegestane statuswijziging met de dan geselecteerde actieve sleutel opgeslagen. Historische revisies blijven behouden. Er is geen bulkconversie of automatische herschrijving van bestaande bestanden.
- Er is een grens van 32 bewaarde sleutels per ring. Als die is bereikt, wordt verdere rotatie geweigerd totdat retentie en veilige sleutelafbouw afzonderlijk zijn ontworpen. Er worden geen oude sleutels verwijderd om ruimte te maken.

## Ontbrekende sleutels en onderbrekingen

Voor een nieuwe aanmeldreservering controleert de coördinator of de sleutelring beschikbaar is. Bij een onleesbare bestaande aanvraag worden geen codewisseling, intrekking of vervangende schrijfacties uitgevoerd. De bestaande aanvraag blijft behouden. Een onderbreking vóór publicatie van een sleutelringrevisie laat de vorige revisie actief; na publicatie kan een herstart dezelfde rotatie herkennen, ook wanneer de oorspronkelijke bevestiging verloren ging.

Annulering en openstaande opruiming blijven na rotatie herstelbaar met de eerdere leesbare sleutel en dezelfde eigenaar-/sessie-/browserbinding. De bestaande SQL-kern blijft zelfstandig de toestemming en generatie controleren. Rotatie verleent geen rechten en hervat geen providerverzoek, meting of publicatie.

## Grenzen vóór live gebruik

Vervolg: [lokale opvang van providerantwoorden](ca03-youtube-provider-inbox.md) gebruikt de sleutelring voor ontvangen codewisselantwoorden. Dit sluit het gat vóór de eerste lokale vastlegging niet af.

Dit levert lokale opslag en rotatie van **gegevenssleutels**, geen productiebron of rotatie van de hoofdsleutel. De keuze en inrichting van een OS-kluis of externe sleutelbeheerder, toegang voor de applicatieaccount, hoofdsleutelbackup en herstel bij sleutelverlies blijven open. Er is geen DPAPI-, KMS- of andere sleutelservice aangeroepen en er zijn geen echte sleutels geïmporteerd.

Dezelfde [bestandsopslaggrenzen](ca03-youtube-local-recovery.md) blijven gelden: procesuitval is getest, geen garantie bij stroomuitval, een teruggezette schijfsnapshot, verloren sleutel of toegang door een beheerder die de sleutel en bestanden bezit. Windows-ACL-beleid moet vóór activering worden vastgesteld. Oude versleutelde revisies, sleutelretentie, vernietiging en schijflimieten zijn niet automatisch geregeld.

Alle toekomstige workers moeten dezelfde sleutelring, hoofdsleutelbron en formaatondersteuning gebruiken; oudere workers met uitsluitend een losse sleutel kunnen versie-2-aanvragen niet lezen. Er is geen live overgang of gemengde uitrol getest. Duurzame opvang van verloren providerantwoorden, echte Google-projectisolatie en HTTP-/cookiebeveiliging blijven eveneens open.

## Lokale controle

De sleutelproeven testen herstarten met dezelfde sleutelring, ontbrekende of verkeerde hoofdsleutels, ontbrekende oude gegevenssleutels, expliciet lezen van legacy-aanvragen, gelijktijdige rotatie, echte procesbeëindiging vóór/na publicatie, manipulatie van sleutel-ID/revisie/inhoud en herstel van openstaande opruiming. De bestaande kerntests controleren ook rotatie tijdens de callback en een verdwenen sleutelring vóór codewisseling.

`node --test tests/creator-youtube-keyring.test.mts tests/creator-youtube-durable.test.mts tests/creator-youtube-oauth-attempt.test.mts tests/creator-youtube-kernel.test.mts`

Op 7 november 2026 slagen alle 82 gerichte proeven en 1.495 algemene tests. De 21 sleutelproeven en 14 opslagproeven slagen op Windows én in een netwerkloze Linux-container. De 28 kerntests slagen ook op PostgreSQL 17.11; vier bestaande echte transactieraces blijven groen. TypeScript, ESLint en de lokale productiebuild slagen. De bouw meldt dezelfde 27 afhankelijkheidsbestanden buiten de uitvoermap door de bestaande gedeelde node_modules-koppeling; dit bewijst geen uitrolbare image.
