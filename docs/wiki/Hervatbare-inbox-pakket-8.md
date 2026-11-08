# Pakket 8 — hervatbare inboxontvangst (lokaal)

Deze uitbreiding is lokaal gebouwd en getest met fictieve providerantwoorden. Er is geen echte inbox gelezen en geen activering, Cloud-migratie, uitrol, antwoord of moderatie uitgevoerd. De lokale branch is gebaseerd op `f608b37` (pakket 7).

## Wat is gebouwd

- Een duurzame leesronde met een wachtrij voor conversaties, berichten, reacties en vervolgreacties. Elke uitvoering verwerkt één providerpagina met maximaal 25 teksten; een nieuwe uitvoerder kan dezelfde wachtrij uit de database voortzetten.
- Een claim van 120 seconden met een willekeurig claimnummer. Slechts één uitvoerder heeft schrijfrecht; een vervallen uitvoerder kan na overname niets bevestigen.
- Eén transactie voor de bestaande inboxopslag, het nieuwe checkpoint, de historie en een duurzaam ontvangstbewijs. Een fout tussen opslag en voortgang draait beide terug. Er wordt geen cursor doorgeschoven na gedeeltelijke opslag.
- Herkenning van een verloren commitbevestiging via het ontvangstbewijs. Dit start geen tweede provideroproep of tweede opslag. Een herhaalde identieke commit geeft hetzelfde bewijs; afwijkende inhoud wordt geweigerd.
- Herlezen gebruikt de bestaande unieke berichtidentiteit. Dezelfde tekst levert geen tweede bericht of ontvangstevent op. Gewijzigde inhoud onder hetzelfde ID vereist opvolging en overschrijft niets.
- Tijdelijk wachten bij quota, storing, timeout of ontbrekende afgeschermde koppeling; blokkeren bij gewijzigde rechten/account; afzonderlijke opvolging bij onveilige cursors, onbekende vormen en conflicten.
- Een losstaande, alleen-lezen statuscomponent voor bevestigde pagina’s, pogingen, wachttijd en historie. Deze is nog niet aan een live pagina gekoppeld.

## Hervatten en opnieuw beginnen

Een claim, providerantwoord of fout schuift de voortgang op zichzelf niet door. Alleen een geslaagde opslagtransactie doet dit. Na een procesonderbreking kan een nieuwe uitvoerder de laatst bevestigde pagina vervolgen zodra de claim verloopt. Bij tijdelijk wachten blijft exact hetzelfde checkpoint bewaard.

Een verlopen, herhaalde of onveilige providercursor wordt niet automatisch gewist of overgeslagen. De leesronde krijgt een opvolgpunt. Een bevoegd beheerder kan expliciet vanaf het oorspronkelijke begin herstarten; bestaande berichten en ontvangstbewijzen blijven bewaard. De browser kan geen willekeurige begincursor indienen. Een herstart neemt de actuele aanvrager en diens echte sessie over.

## Afgeschermde opslag en rechten

De voorbereide migratie `20261108215708_resumable_inbox_local.sql` voegt uitsluitend drie private tabellen toe: `rs_jobs`, `rs_receipts` en `rs_events`. Alle hebben RLS en geen directe tabel- of sequentierechten voor anon, authenticated of service_role. De bestaande migraties en inboxopslag blijven behouden.

De eigenaarinterface vereist een actuele, bevestigde Auth-gebruiker, echte sessie en `manageInbox`. De serverinterface heeft uitsluitend service_role-uitvoerrechten. Toegang, organisatie, account, scopes en sessie worden opnieuw gecontroleerd vóór een claim en vóór opslag. Vergrendelingen beschermen tegen gelijktijdige intrekking. Een verloren ontvangstbewijs kan door de server afzonderlijk worden gelezen zonder nieuwe berichtopslag.

Checkpoints bevatten alleen versie, taakidentiteiten en cursors; geen toegangstokens of volledige vervolg-URL’s. Tokens worden pas na een geldige claim via een geïnjecteerde afgeschermde koppeling gevraagd. Providerfouten worden tot vaste codes beperkt. De eigenaarstatus bevat geen checkpoint of ruwe providerfout. Historie is met `events_before` volledig door te bladeren (maximaal 51 events per antwoord).

## Grenzen en resterende acceptatie

De wachtrij is begrensd op 1.000 taken, de ontdekte taken en gebruikte cursors op 10.000, het checkpoint op 1 MB. Het bereiken van een grens geeft opvolging: geen stille afkapping of valse voltooiing. De bestaande HTTP-grenzen blijven gelden: alleen geïnjecteerde GET-verzoeken, timeouts, beperkte antwoordomvang en validatie van account en geselecteerde bronobjecten.

De bewijzen gelden voor de nagebootste, stabiele gegevens en daadwerkelijk geteste databaseonderbrekingen. Een provider kan tijdens paginering eigen berichten wijzigen, verwijderen of zijn cursorcontract veranderen. Volledigheid van een veranderende echte inbox is hiermee nog niet live bewezen; daarvoor zijn later expliciete provideracceptatie en een afgesproken herleesstrategie nodig. Bijlagen en niet-ondersteunde vormen worden niet stil overgeslagen, maar blokkeren de pagina voor opvolging. Uitgaande eigen teksten worden bewust niet als inkomend bericht opgeslagen.

Er is geen productieaanroeper, live transportfactory, app-actie, webhook of automatische planner toegevoegd. De lokale worker en lezer vereisen expliciete inschakeling; standaard staan ze uit. Inbox, Instagram-publicatie en YouTube-creatorkoppeling zijn niet geactiveerd.

## Verificatie

De lokale controles omvatten volledige scans met meer dan 50 teksten voor beide platformen en beide inboxsoorten, 60 afzonderlijke gesprekken, gepagineerde vervolgreacties, procesherstart, verloren bevestiging, quota, ongeldige cursors, herstart zonder dubbelen, gewijzigde inhoud, huidige rechten en sessie-intrekking, annulering en paginering van historie.

Een afzonderlijke PostgreSQL 17-proef controleert acht echte gelijktijdigheids- en crashscenario’s, inclusief een fout tussen berichtopslag en checkpoint. De volledige migratieketen wordt daarnaast vanaf een lege lokale database herhaald; de 209 historische tabellen blijven behouden en het eindtotaal wordt 212. De CI-configuratie bevat een eigen lokale PostgreSQL-taak voor deze nieuwe proeven; deze is nog niet op GitHub uitgevoerd.

Resultaten en uitvoerlogs worden buiten de repository bijgehouden in `work/package8-resumable-inbox-20261108/`. Een concept-PR, merge, toepassing van de voorbereide migratie en uitrol vereisen een volgende afzonderlijke opdracht.
