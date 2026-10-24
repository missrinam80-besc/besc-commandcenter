# F4 - private samenwerkingsintake en eigen opvolging

Bouwstatus: lokaal gebouwd, geen live formulier, aanvraag, toegang, behandeltaak, migratie of uitrol uitgevoerd. De creator-mijlpaal blijft apart beschreven in [Implementatie creator](Implementatie-creator.md). Dit is de gedeelde intakebasis met de eerste categorie samenwerkingsaanvragen; vacaturegerichte sollicitaties en partnerpublicaties volgen nog.

## Gedrag

Een bevoegd voorzitter kan een vaste formulierversie voorbereiden met doeltekst, tekstversie, grondslag, bewaarbehandeling, beleidsbron en openingsvenster. Voorbereiden opent niets. Een aparte bevestiging opent de exacte versie. Een gewijzigde tekst vraagt een nieuwe versie; ingediende aanvragen bewaren hun oorspronkelijke tekst en payload. Er zijn geen juridische BESC-keuzes of echte teksten vooraf ingevuld.

Een geverifieerd en expliciet toegelaten eigen account kan op Mijn BESC een private samenwerkingsaanvraag indienen. De categorie is getypeerd: organisatienaam, maximaal zes gevraagde samenwerkingssoorten en een bericht. Geen telefoon, uploads, callbacks of door de gebruiker gekozen actor/organisatie. De checkbox bevestigt alleen dat de aanvraagtekst is gelezen; zij verleent geen profiel- of marketingtoestemming.

Na opslag verschijnen ontvangstnummer en status in het eigen overzicht. De eigenaar kan de oorspronkelijke indiening en vastgelegde behandeling bekijken, op een informatievraag antwoorden en een lopende aanvraag intrekken. Ontvangst wordt pas na transactiecommit bevestigd. Een identiek verzoek-ID met identieke invoer geeft dezelfde ontvangst; andere invoer geeft conflict. Verlopen of ingetrokken toegang blokkeert ook het ophalen van eerdere receipts.

## Behandeling en privacy

Behandelaars worden expliciet voor een afzonderlijk formulier aangewezen, met bewijs en een einddatum van maximaal zeven dagen op staging. Bestaande publicatierollen, technisch beheer of voorzitterschap geven geen automatische aanvraaginzage. De voorzitter kan formulierbeleid en taakmetadata zien; voor motivatie en interne notities is eveneens een eigen actuele behandeltaak nodig. Account-/persoonsontkoppeling beëindigt de betreffende behandelbinding.

Een behandelaar neemt een aanvraag op zich voordat die de status wijzigt. Een actuele andere behandelaar kan de toewijzing niet overnemen. Verlopen toewijzingen kunnen door een andere bevoegde behandelaar worden overgenomen. Berichten voor de aanvrager en interne notities staan in aparte velden; alleen de zichtbare berichten komen in de eigen API. De oorspronkelijke payload blijft onveranderd; aanvullingen en statuswissels vormen een versiegeschiedenis.

Ontvangen, in behandeling, informatie gevraagd, afgewezen, administratief afgerond en ingetrokken zijn aanvraagtoestanden. Afgerond verleent geen overeenkomst, lidmaatschap, aanstelling, partnerrol of publicatie. Er worden geen e-mails, Discordberichten of uitnodigingen verstuurd en geen gegevens automatisch doorgestuurd. Intrekken verwijdert niet automatisch verantwoord te bewaren geschiedenis; een automatische vernietigingsprocedure is niet met deze bouw geactiveerd.

## Routes en schermen

- Website: Mijn BESC koppelt naar `/mijn-besc/aanvragen` en een detail per ontvangstnummer. Beide werken onafhankelijk van de creatorflag. Bestaande creator-, nieuws- en eventfuncties blijven staan.
- CC: `/app/administratie/aanvragen` toont formulierbeleid, eigen toegang en beperkte behandeltaken plus de toegestane werkvoorraad. Voor aanvraagdetail wordt de objectbevoegdheid afzonderlijk gecontroleerd.
- CC-API: `GET /api/v1/platform/intake`, `GET /api/v1/platform/intake/applications/{id}` en `POST /api/v1/platform/intake/workflow`. De websiteworkflow accepteert alleen indienen, antwoorden en intrekken. Beheeroperaties worden geweigerd.
- De website gebruikt uitsluitend de beperkte CC-API, met gebruikerstoken en bestaande afzonderlijke websitesleutel. Identiteit en site worden server-side afgeleid; businessdatabasetabellen worden niet rechtstreeks gelezen.

De runtimecontracten in CC `src/lib/f4-intake-contract.ts` en website `src/lib/intake-contract.ts` zijn gelijk. Overzicht en detail zijn gescheiden; interne velden zijn niet toegestaan. Eindige aantallen worden expliciet bewaakt: maximaal 100 eigen aanvragen, 50 open formulieren en 101 gebeurtenisversies in een detail. Overschrijden geeft een fout, geen stilzwijgend afgekapt volledig overzicht. De CC-werkvoorraad pagineert per 50 aanvragen met een vaste tijd-/ID-volgorde. De eigen intakecapaciteit wordt bij indienen bewaakt; verdere volumevergroting vraagt een latere uitbreiding.

Open eigen schermen controleren toegang en versie elke 20 seconden en bij terugkeer. Bij intrekking, gewijzigde toestand of een mislukte hercontrole worden oude gegevens verborgen en kan de gebruiker de actuele toestand opnieuw openen. Dit is gebouwde logica, geen uitgebreide live browseracceptatie. Alle inhoud gebruikt private/no-store; requestbodies, upstreamtijd en antwoordgrootte zijn begrensd. Lees- en schrijflimieten zijn duurzaam in de database.

## Migratie en vrijgave

`20261023212349_f4_private_intake.sql` voegt vier private tabellen toe: formulierbeleid, behandeltaken, aanvragen en gebeurtenisgeschiedenis. RLS is ingeschakeld en directe clientgrants zijn ingetrokken. Gecontroleerde functies hergebruiken de bestaande sessiecontrole, transactiegate, limieten, audit en requestreceipts. Geen bestaande migratie-SQL gewijzigd.

`BESC_PLATFORM_INTAKE_ENABLED=false` staat standaard in beide apps. Formulieren zijn standaard gesloten, zonder gebruikers of taken. De bestaande eigen platformbinding wordt hergebruikt; intakebeheer geeft daarbij geen staging-viewerrecht. Creatorbeheer blijft afhankelijk van zijn aparte configuratie.

Het intakemanifest bewaart de historische migratiehashes en de voorganger. Laatst bevestigd Cloud DEV is 126. De creatormigratie moet eerst volgen (127), daarna de intakemigratie (128), uitsluitend na latere vrijgave en actuele voorcontrole. Geen van beide is door deze bouw toegepast. Website en CC blijven afzonderlijke releases. Voor uitrol moeten imagehashes en servercapaciteit opnieuw worden gecontroleerd; dit document is geen serveruitrolpakket.

## Gerichte bouwcontrole en resterend werk

Uitgevoerd met fictieve gegevens: één geïsoleerde databaseketen voor ontvangst, idempotentie, eigen toegang, behandeltaak, zichtbare/interne berichten, aanvullingen en intrekking; twee API-grensgevallen; één websitepresentatiegeval en compatibiliteitscontrole van het bestaande creatorscherm. Geen echte accounts gekoppeld of aanvragen ingediend. Productiecompilatie en bestaande CI worden bij de oplevering afzonderlijk gerapporteerd.

De uitgebreide hele-app-acceptatie, echte Auth/Storage en gelijktijdige live varianten blijven voor de gezamenlijke preproductiecontrole. Overige F4-bouw: partner-/esportspublicaties, delegatie, vacatures en vacaturegebonden sollicitaties, overige Mijn BESC-functies, statische pagina's, inhoudsimport en redirects.

Technische bronnen: [Supabase-functies](https://supabase.com/docs/guides/database/functions), [RLS en grants](https://supabase.com/docs/guides/database/postgres/row-level-security).
