# Pakket 7 — Meta-leesadapter en lokale ontvangstketen

Dit pakket bouwt voort op de inboxopslag van pakket 6. Het voegt een leesadapter en ontvangstcoördinator toe voor Facebook en Instagram via de bestaande Facebook Login-variant. Alle acceptatie gebruikt nagebootste providerantwoorden, fictieve credentials en geïsoleerde lokale databases. Er zijn geen echte berichten opgehaald of live credentials gelezen; niets is geactiveerd.

## Ontvangstketen

1. De aanroeper moet de huidige bevoegde sessie, organisatie, het gekozen verbonden account, de vastgelegde Page-/Instagram-binding, rechten en een actuele configuratierevisie aanleveren via de autorisatiepoort. Ontbrekende lokale rechten blokkeren al vóór het lezen van een credential. Een toekomstige runtime moet deze poort zelf aan echte sessie- en accountcontroles koppelen; een los meegegeven `authorized`-veld is geen zelfstandig autorisatiebewijs.
2. De adapter controleert via het nagebootste `debug_token`-antwoord de juiste app, geldigheid, verloop, vereiste scopes, het tokentype Page en het bijbehorende Page-ID. De vastgelegde Page wordt apart uitgelezen en moet het verwachte account bevatten. Er is geen terugval naar een andere Page, app, creatorcredential of het eerste gevonden account.
3. Privéberichten worden gelezen via de Page-conversaties voor het gekozen platform en de berichtenpagina's per gesprek. De gesprekspartijen en de ontvanger moeten bij het gekozen account passen. Uitgaande teksten worden geteld als overgeslagen; zij worden geen nieuwe inkomende vraag.
4. Reacties worden alleen gelezen voor maximaal vijf expliciet gekozen bronobjecten. Per object wordt eerst eigenaarschap gecontroleerd. Reacties en antwoordreacties blijven onder dat geverifieerde bronobject gegroepeerd. Er wordt geen algemene feed of verzameling willekeurige object-ID's afgezocht.
5. Elke tekst wordt genormaliseerd naar de bestaande inboxvorm, inclusief een eenduidige tijdzone. Alleen volledig gevalideerde inkomende tekst wordt aangeboden aan de bestaande `social_inbox_ingest`-functie. Ruwe providerantwoorden, tokens, pagineringslinks en bijlage-URL's worden niet opgeslagen.
6. Vóór opslag wordt de lokale sessie-/accounttoegang opnieuw gecontroleerd. Een gewijzigde revisie, scopekeuze, identiteit of ingetrokken toegang blokkeert de hele batch. De oorspronkelijke organisatie en het gekozen account blijven vaststaan.
7. De bestaande databasefunctie slaat de batch atomair op en maakt bij herhaalde ontvangst geen extra berichten of gebeurtenissen. Alleen een geldige opslagbevestiging levert een geslaagde ontvangst op. Een verloren bevestiging blijft een opvolgpunt; een latere herlezing hergebruikt de bestaande berichten zonder dubbelen.

## Paginering en harde grenzen

Alle aanvragen gebruiken uitsluitend GET naar `https://graph.facebook.com`, met expliciete API-versie, vaste velden, bearerheader, geen redirects en geen cache. De transportfunctie moet expliciet worden geïnjecteerd; er bestaat geen standaard `fetch` of automatische productieaanroeper.

De adapter volgt een ontvangen `paging.next` nooit rechtstreeks. Origin, pad, versie en cursor moeten bij dezelfde edge passen; de volgende aanvraag wordt opnieuw opgebouwd met dezelfde eigen parameters. Gelekte toegangstokens uit een volgende-URL worden niet overgenomen. Ontbrekende of herhaalde cursors worden een fout. Gespreks- en bericht-ID's kunnen geen URL, slash of padtraversal bevatten.

Een lokale uitvoering leest pagina's van maximaal 25 objecten, standaard maximaal 20 pagina's en 40 aanvragen, en biedt maximaal 50 unieke inkomende teksten aan in één batch. Elk antwoord heeft een grens van 262.144 bytes en elke aanvraag een afbreekbare tijdslimiet van 10 seconden, ook tijdens het lezen van de body. De aanroeper kan eerder annuleren. De tests mogen kleinere grenzen gebruiken.

Dit is een begrensde leesketen, geen onbeperkte archiefimport of dagelijkse synchronisatie. Wordt een grens bereikt, dan blijft de uitkomst onvolledig en wordt de verzamelde batch niet opgeslagen. Er wordt geen cursor, laatste-succestijd of voortgang voorbij onbevestigde berichten gezet. Een grote inbox die de grenzen overschrijdt vereist vóór live ingebruikname een afzonderlijk ontworpen incrementele aanpak; eindeloos opnieuw dezelfde te grote selectie uitvoeren is geen herstelprocedure.

## Fouten en privacy

- HTTP 401, verlopen/ongeldige tokens en ontbrekende rechten blijven afzonderlijke blokkades. Er wordt geen token vernieuwd en geen OAuth- of scopewijziging gestart.
- HTTP 429, aangegeven hoge Meta-belasting, tijdelijke providerfouten en time-outs geven een herkenbare opvolguitkomst. Er is geen automatische herhaling; een opgegeven wachttijd wordt begrensd.
- HTTP-fouten en afwijkende JSON zijn geen succesvolle lege inbox. Nul ontvangst wordt alleen bevestigd na een volledige geldige lege uitlezing en hercontrole van de toegang.
- De adapter downloadt geen media, volgt geen links en doet geen POST, like, antwoord-, verwijder- of moderatieverzoek. Bijlagen, verwijderde/verborgen of niet ondersteunde berichten worden een expliciet onvolledige uitkomst. Zij worden niet stilzwijgend weggefilterd om de run als compleet te kunnen aanduiden.
- Onbekende of gewijzigde inhoud op een bestaand bericht-ID wordt een conflict; bestaande tekst en historie blijven behouden. Interne afhandeling is nog steeds geen extern antwoord.
- Foutuitkomsten bevatten uitsluitend vaste codes en begrensde wachttijden; geen providerfouttekst, antwoordbody, URL, token, credential of stacktrace.

## Wat nadrukkelijk niet is aangesloten

`createMetaInboxReader` en `receiveMetaInbox` staan standaard uit en hebben alleen expliciet geïnjecteerde poorten. Geen apppagina, serveractie, webhook, cronroute of timer roept ze aan. De bestaande `BESC_SOCIAL_INBOX_ENABLED`-keuze wordt niet veranderd en activeert deze nieuwe leesketen niet zelfstandig. Er is geen nieuwe omgevingsvariabele, databasewijziging of migratie toegevoegd.

De bestaande Meta OAuth-start/callback, credentialopslag en statistiekensynchronisatie blijven ongewijzigd. Ook Instagram-publicatie en de YouTube-creatorkoppeling blijven buiten dit pakket. Het manifest `ops/meta-inbox-reader-local-release.json` bewaakt de exacte voorgaande bestanden en deze releasegrenzen.

## Providercontract en live acceptatie

De officiële Meta [Conversations API-collectie](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a) beschrijft afzonderlijke gesprek-, berichten- en accounttoegang voor Messenger en Instagram. De officiële [Instagram-collectie](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-3fe78620-2258-44b6-893f-42d76c7200d7) ondersteunt de Page/Instagram-koppeling en afzonderlijke commentaarrechten. Deze code kiest geen Instagram Login-variant.

De directe Meta-documentatie voor de actuele conversation- en detailcontracten was tijdens deze voorbereiding niet toegankelijk. De nagebootste vormen en gekozen velden vormen daarom een lokaal geteste, conservatieve contractimplementatie; zij bewijzen geen actuele live API-acceptatie. Met name het precieze Page-/IG-conversationpad, de beschikbare reply-/eigenaarschapsvelden, Page-token-diagnostiek, Page-taken, scoped grants, Advanced Access en Meta App Review moeten vóór een echte leesproef rechtstreeks worden bevestigd. Ontbrekende velden stoppen de adapter; er is geen stilzwijgende alternatieve route of brede uitlezing.

Voor activering zijn daarnaast een echte aanroeper met actuele sessie-/accountcontrole, afspraken over privacy en bewaartermijnen, gerichte behandeling van bewerkingen/verwijderingen/bijlagen en afzonderlijk goedgekeurde live acceptatie nodig. Dit pakket kent geen nieuwe toegang toe.

## Verificatie

De gerichte tests gebruiken uitsluitend geïnjecteerde providerantwoorden. De ketentests voeren de adapter, autorisatiepoorten, ontvangstcoördinator en echte bestaande SQL-opslag uit op fictieve accounts. Zij controleren beide platformen en berichttypen, dubbele ontvangst, verloren opslagbevestiging, mislukte volgende pagina, heropening, intrekking van sessie/rechten en ontkoppeling na lezen. Een afzonderlijke CI-proef herhaalt deze keten op PostgreSQL 17 en voert de bestaande zes inbox-gelijktijdigheidsproeven uit. Een lokale voorbeeldpagina of extra live testgegevens zijn voor dit pakket niet nodig.

[← Socialinbox](Socialinbox-pakket-6.md)
