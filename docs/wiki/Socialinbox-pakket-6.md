# Pakket 6 — Socialinbox voor Instagram en Facebook

Dit pakket bouwt een lokale inbox voor ontvangen privéberichten en reacties. De acceptatie gebruikt uitsluitend `TESTFIXTURE - NIET PUBLICEREN`, een tijdelijke lokale database en nagebootste Meta-antwoorden. Er worden geen echte berichten gelezen, antwoorden verstuurd, webhooks geregistreerd, tokens vernieuwd, rechten aangevraagd of live instellingen gewijzigd.

## Bestaande Meta-koppeling

De code gebruikt Facebook Login met een Page-toegangstoken voor de gekoppelde Facebook-pagina of het professionele Instagram-account. De OAuth-start vraagt voor Facebook `business_management`, `pages_show_list`, `pages_read_engagement` en `read_insights`; voor Instagram vervangt de code die laatste scope door `instagram_basic` en `instagram_manage_insights`. Deze bestaande scopekeuze, callback en accountcredentialopslag zijn ongewijzigd.

Dat zijn rechten voor kanaalgegevens en metingen, geen bewijs van inboxrechten. Er is tijdens dit pakket geen token gelezen of gecontroleerd bij Meta. De werkelijk toegekende rechten, actuele Page-taken, Meta App Review en zakelijke verificatie zijn daarom niet live vastgesteld.

Meta's officiële [Conversations API-documentatie](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a) onderscheidt Messenger-gesprekken (`pages_manage_metadata`, `pages_read_engagement`, `pages_messaging`) en Instagram-gesprekken via Facebook Login (`instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`). Toegang tot gesprekken met niet-appbeheerders kan Advanced Access vereisen; Instagram stelt ook eisen aan de zakelijke inrichting. De officiële [Instagram-collectie](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-3fe78620-2258-44b6-893f-42d76c7200d7) noemt afzonderlijke commentaarrechten zoals `instagram_manage_comments`.

De vereisten in `socialInboxMetaRequirements` zijn een voorbereidende inventaris voor de bestaande Facebook Login-variant. Volledige scopes betekenen nadrukkelijk geen bewezen live toegang. Vooral Facebook-reacties, het actuele providercontract, de vereiste Page-taken en het gekozen toegangsniveau moeten vóór een live adapter afzonderlijk rechtstreeks bij Meta worden bevestigd. Directe Meta-documentatiepagina's waren tijdens de lokale voorbereiding niet toegankelijk; de officiële Meta-collecties waren wel beschikbaar. Er wordt niet ongemerkt overgeschakeld naar Instagram Login of een andere app.

## Wat werkt lokaal

- De inbox groepeert inkomende teksten per organisatie, technisch account, kanaalsoort en extern gesprek. Een reactie en privébericht met hetzelfde externe gesprek-ID blijven gescheiden.
- De fixtureadapter bindt elk nagebootst antwoord aan het vooraf gekozen account. Hij accepteert alleen inkomende tekstberichten of tekstreacties in een expliciet gemarkeerde fixture. Hij heeft geen netwerk-, token-, antwoord-, download- of moderatiepoort.
- Het volledige antwoord wordt gevalideerd vóór opslag. Ontbrekende tekst, verkeerde ontvanger, uitgaande berichten, onbekende velden, foutantwoorden en te grote batches worden geweigerd. Bijlagen en onvolledige providergegevens worden niet stilzwijgend als lege tekst verwerkt.
- Herhaalde identieke ontvangst levert geen extra bericht of gebeurtenis op. Een bestaand bericht-ID met andere inhoud, afzender of gesprek wordt een conflict; de bestaande tekst wordt niet overschreven. Elke batch wordt atomair opgeslagen.
- Bevoegde beheerders kunnen toewijzen aan een andere bevoegde actieve beheerder, de interne status wijzigen en een interne notitie toevoegen. De bestaande `manageInbox`-rechten en gedelegeerde profielen worden aan beide kanten gecontroleerd, naast een echte actieve accountsessie.
- De statussen zijn Open, In behandeling, Wachten en Intern afgehandeld. Intern afhandelen stuurt niets naar Meta en bewijst niet dat er extern geantwoord is. Nieuwe actuele ontvangst heropent een afgehandeld gesprek; dubbele of oudere vertraagde ontvangst doet dat niet.
- Een revisiecontrole beschermt elke wijziging tegen een intussen ontvangen bericht of een andere beheerder. Het scherm vraagt bij conflict opnieuw te laden. Herhaalde ongewijzigde toewijzing/status maakt geen extra historie.
- De historie registreert ontvangst, heropening, toewijzing, status en notities met tijd en waar toepasselijk de echte actor. Berichten en notities worden als tekst weergegeven, zonder HTML-uitvoering, externe media of automatisch geopende links.
- Status-, platform- en eigen-toewijzingsfilters en begrensde pagina's houden oudere gesprekken, berichten en gebeurtenissen bereikbaar. Fout bij opslag/uitlezen wordt zichtbaar en wordt niet voorgesteld als een lege succesvolle inbox.

## Opslag en grenzen

De voorbereide migratie `20261108141811_social_inbox_local.sql` voegt drie private tabellen toe: `si_threads`, `si_messages` en `si_events`. Er is geen backfill of wijziging van bestaande dossiers. Alle tabellen hebben RLS; browserrollen en `service_role` hebben geen directe tabelrechten. Private functies hebben een vaste lege zoekroute en beperkt toegekende uitvoerrechten. Publieke wrappers gebruiken invokerrechten. De interne importfunctie is uitsluitend uitvoerbaar door `service_role`; de beheerfunctie uitsluitend door `authenticated`, met eigen controles op organisatie, sessie en rechten. De browser heeft geen importknop of recht om historie te vervalsen. Een volgende live ingester moet onafhankelijk provider- en accounttoegang verifiëren vóór hij deze grens gebruikt; de SQL-functie is geen zelfstandig bewijs van Meta-toestemming.

`BESC_SOCIAL_INBOX_ENABLED` blijft standaard uit. De serverpagina `/app/social/inbox` en serveractie lezen dan geen inboxgegevens. De bestaande layout kan nog wel de normale gebruikerscontext en meldingen lezen; dit is geen geïsoleerde offline route. De ingang via Social planning verschijnt alleen bij ingeschakelde functie en passende rechten. Andere gebruikers behouden toegang tot de bestaande socialplanning. De algemene BESC-intake-inbox blijft een afzonderlijke bestaande workflow.

Er is geen live synchronisatieadapter, webhookroute, cronroute, timer, tokenlezer, conceptantwoord, verzendknop, like-, verwijder- of moderatieactie in dit pakket. Ook Instagram-publicatie en de YouTube-creatorkoppeling worden niet geactiveerd. De bestaande statistiekensynchronisatie blijft ongewijzigd.

## Verificatie en latere ingebruikname

De tests voeren de echte SQL, rechten, triggerloze inboxfuncties, fixtureadapter, serveracties en schermcomponent uit. Aanvullende PostgreSQL 17-proeven gebruiken echte afzonderlijke verbindingen voor dubbele ontvangst, twee beheerders, ontvangst versus afsluiten, ingetrokken toegang en gewijzigd doelaccount. Een volledige schemaherbouw behoudt de eerdere 206-tabellenbasis en eindigt op 209 tabellen. De aansluitende bestaande agentproef blijft behouden.

Dit pakket wordt niet als live geaccepteerd aangemerkt. Eerst volgen afzonderlijke review en releasebesluiten. Daarna zijn actuele Meta-rechten en accounttoegang, een nauwkeurig begrensde live leesproef, privacy/bewaartermijnen, veilige verwerking van bijlagen/verwijderingen en een geverifieerde provideradapter nog nodig. Live ontvangst, antwoorden en moderatie zijn afzonderlijke beslissingen; dit pakket verleent daar geen toestemming voor.

[← Socialbeoordeling](Social-interne-beoordeling.md)
