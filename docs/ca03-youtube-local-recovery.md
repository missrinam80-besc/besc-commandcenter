# CA03 — lokale duurzame aanvraagopslag en herstel

Deze stap voegt een expliciet te kiezen lokale bestandsadapter en eigenaargebonden herstel toe aan de standaard uitgeschakelde YouTube-module. Er zijn geen routes, serverinstellingen, providers, taken of databases gewijzigd. De adapter wordt nergens automatisch ingeschakeld.

## Opslag en onderbrekingen

Aanvraagrevisies bevatten alleen een revisienummer en de bestaande AES-256-GCM-versleutelde inhoud. De sleutel blijft buiten de opslagmap. Elke revisie wordt eerst naar een eigen tijdelijk bestand geschreven en met `FileHandle.sync()` gesynchroniseerd. Een hardlink publiceert vervolgens atomair de definitieve, onveranderlijke revisienaam zonder een bestaande revisie te vervangen. Daardoor kan van meerdere processen met dezelfde verwachte revisie slechts één schrijver winnen. Verouderde schrijvers krijgen `false`; een onzekere bevestiging wordt niet gelijkgesteld aan een ontbrekende revisie.

Herstart vóór publicatie laat hoogstens een tijdelijk bestand achter; dat telt niet als vastgelegde aanvraag. Herstart na publicatie ziet de nieuwe revisie, ook wanneer de schrijver geen bevestiging meer heeft ontvangen. Onvolledige revisiereeksen, ongeldige bestanden en verwijzingen via symlinks/junctions worden geweigerd. Slechts een expliciete absolute lokale opslagmap is toegestaan; geen netwerkpad. Op POSIX moeten map- en bestandsrechten privé zijn.

Op Windows kan deze adapter geen portable directory-fsync of volledige ACL-controle uitvoeren. De lokale proeven bewijzen herstel na **procesbeëindiging**, geen garantie bij stroomuitval, een defect bestandssysteem of een teruggezette schijfsnapshot. De applicatieaccount en beheerder blijven verantwoordelijk voor exclusieve toegangsrechten op de opslagmap. Gebruik op een netwerkbestandssysteem of tussen meerdere hosts is niet ondersteund. Zie [Node-bestandssysteemdocumentatie](https://nodejs.org/docs/latest-v24.x/api/fs.html).

## Herstelgedrag

- Annulering en opruiming worden eerst als versleutelde intentie vastgelegd, vóór de intrekkingspoort wordt aangeroepen. Een crash tijdens intrekking kan daardoor veilig opnieuw worden opgevolgd.
- `recover(jobId, browserNonce)` vereist dezelfde organisatie, gebruiker, actieve sessie en browserbinding als de oorspronkelijke aanvraag. Een nog geldige `pending`- of `running`-aanvraag wordt niet overgenomen.
- Een verlopen aanvraag of onafgehandelde opruiming kan met dezelfde sleutel en een nieuwe opslag-/coördinatorinstantie verder worden afgehandeld. Herstel wisselt **nooit** de autorisatiecode opnieuw in en hervat geen publicatie, synchronisatie of meting.
- Bij een al vastgelegde geslaagde afronding geeft herstel die bevestigde status terug. Anders trekt de bestaande kern lokaal in en wordt de provideruitkomst afzonderlijk bewaard: `pending`, `failed`, `blocked_isolation`, `uncertain` of `complete`.
- Alleen een bevestigde `complete`-uitkomst geeft `recovered`. Mislukte, onbekende en geblokkeerde uitkomsten blijven `cleanup_pending`, ook na een herstart. Een latere herstelactie controleert de actuele kernstatus opnieuw, zodat laat in quarantaine geplaatste tokens geen oude opruimbevestiging kunnen hergebruiken.

## Wat dit nog niet oplost

Een crash nadat een provider een grant/token heeft afgegeven maar vóór lokale ontvangst of opslag kan niet door deze adapter worden teruggedraaid. In de echte kern blijft zo'n onbekend antwoord open voor opruiming; het wordt niet als voltooid verzonnen. Duurzame opvang van providerantwoorden, providerreconciliatie en een definitieve aanpak voor verkeerde kanaal-/scopegrants blijven nodig vóór live gebruik.

Herstel is nu expliciet en per bekende aanvraag. Er is geen scanner, automatische planner of beheerdersfunctie die de oorspronkelijke eigenaar-/sessiecontrole omzeilt. Herstel na verlies van de browserbinding, definitief sessieverlies of verlies van de sleutel vereist nog een afzonderlijk ontworpen beperkte beheerroute. De sleutel wordt in de herstartproeven opnieuw aangeleverd door de testfixture; productie-sleutelbeheer en rotatie zijn niet gebouwd.

De adapter bewaart versleutelde revisiehistorie en negeert niet-gepubliceerde tijdelijke bestanden. Er is geen automatische verwijdering; oude revisies kunnen ook oude versleutelde verifiers bevatten. Retentie, opruimen van tijdelijke bestanden, schijflimieten en sleutelvernietiging moeten daarom vóór activering worden vastgesteld. Een partij die de private map en de sleutel beheert kan oude snapshots terugzetten; deze lokale adapter levert geen externe bescherming tegen rollback door zo'n beheerder.

De provider en Vault blijven nagebootst. Echte Google-projectisolatie, HTTP-/cookiebeveiliging en gedeelde inzage blijven buiten deze stap. De oudere [protocolbeschrijving](ca03-youtube-oauth-attempt.md) blijft gelden; de in-memory aanvraagopslag daarin is nu aangevuld met deze expliciete lokale adapter, niet met een productie-databaseadapter.

## Controle

`node --test tests/creator-youtube-durable.test.mts tests/creator-youtube-oauth-attempt.test.mts tests/creator-youtube-kernel.test.mts` controleert onder meer vier concurrerende processen, werkelijke procesbeëindiging rond het schrijfmoment, herstart tijdens aanmelden/intrekken en de SQL-keten bij een laat providerantwoord. Alle fixtureaccounts, sleutels en providerantwoorden zijn fictief. Alleen eigen tijdelijke testmappen worden na de proef verwijderd.

Op 7 november 2026 slagen 59 gerichte proeven en alle 1.472 algemene tests. De 14 opslagproeven slagen zowel op Windows als in een netwerkloze Linux-container, inclusief directory-fsync op Linux. De 26 kerntests slagen ook op PostgreSQL 17.11 en de vier bestaande echte transactieraces blijven groen. TypeScript, ESLint en de lokale productiebuild slagen. De bouw meldt dezelfde 27 afhankelijkheidsbestanden buiten de uitvoermap door de bestaande gedeelde node_modules-koppeling; er is geen uitrolbare image gebouwd of gevalideerd.
