# F6 Afzonderlijke publieke leesgrens

De bestaande website-API vraagt een aangemelde tester. Voor een latere publieke opening komt daar een afzonderlijke leesroute naast: `/api/v1/public-website`. De bestaande staging-, privé- en botroutes blijven hun eigen controles houden. Deze wijziging opent geen website en kent geen gebruiker een rol toe.

## Standaard gesloten

`BESC_PUBLIC_WEBSITE_READ_ENABLED` en `BESC_PUBLIC_WEBSITE_ADMIN_ENABLED` staan standaard uit. De API geeft dan 404 en de bediening blijft gesloten. De additieve migratie maakt twee lege private tabellen: kanalen en expliciete toelatingen. Er wordt geen bestaand record, rol, brongoedkeuring of configuratie aangepast.

Een kanaal verwijst naar een bestaande publicatiebronsite en een bedoelde publieke origin. Het gebruikt een afzonderlijke server-only sleutel, waarvan alleen de hash in het kanaal staat. De bron kan intern de oorspronkelijke staginghost blijven dragen; die host wordt niet als nieuw publiek adres overgenomen. De bestaande projecties gebruiken publieke media-ID's en geven geen opslagpad of bron-ID terug.

## Expliciete toelating per versie

Een ingeschakeld kanaal zonder toelatingen geeft geen inhoud. Een toelating bindt het kanaal aan één organisatie, inhoudstype, publieke entry, geselecteerde revisie en entry-epoch. Alleen `news`, `event` en `page` worden ondersteund. De bestaande actuele bron-, rechten-, termijn- en intrekkingscontroles blijven nodig. Een nieuwere revisie of epoch krijgt geen automatische toelating.

De API accepteert uitsluitend GET voor nieuws, events, pagina's en bijbehorende media. De beperkte cursors en uitvoerschema's worden hergebruikt. Aanvragen, accounts, rollen, campagnes, creators en andere privébewerkingen zijn geen publieke leesoperaties. Geen service_role-key of opslaglocator gaat naar de browser of naar de websitecontainer.

Een geldige website-serversleutel én de geconfigureerde kanaalbinding zijn vereist. Alleen CC gebruikt zijn bestaande servercredential voor de twee strikt begrensde lees-RPC's. `anon` en `authenticated` mogen die RPC's niet uitvoeren en krijgen geen tabeltoegang. Deze expliciete grants en het lege search_path volgen de [Supabase-richtlijnen voor databasefuncties](https://supabase.com/docs/guides/database/functions).

## Media en intrekking

De private locator moet gekoppeld zijn aan een actuele, expliciet toegelaten publicatie. Bestandsgrootte, MIME-type en hash worden gecontroleerd. Na downloaden wordt de locator opnieuw opgevraagd. Bij intrekking, verdwenen toelating of gewijzigde metadata worden geen bytes afgeleverd. Responses zijn no-store en houden voor deze voorbereidende stap noindex. Dit is nog geen productie-SEO-vrijgave.

## Bediening

`/app/administratie/publieke-website` is alleen bruikbaar voor de actuele geverifieerde voorzitter met een geldige sessie, na afzonderlijke activering van de bediening. De bevoegdheid wordt in de database opnieuw gecontroleerd. De bestaande roltoekenningen veranderen niet.

De bediening kan een gesloten kanaal maken, de afzonderlijke serversleutel binden, het kanaal schakelen en één exacte bronversie toelaten of intrekken. Elke handeling vraagt een onderbouwing, request-ID en waar nodig de actuele kanaalversie. Veilige herhaling geeft het eerdere resultaat terug; een gewijzigde payload met hetzelfde request-ID en verouderde versies worden geweigerd. Audit blijft in de bestaande organisatieketen. Bronrevisies worden niet door deze bediening goedgekeurd: de bestaande publicatieketen blijft gelden.

Voorlopige DEV-goedkeuringen lopen volgens de opdrachtgever via haarzelf. Jaykenbe krijgt geen DEV-taken. Er is geen nieuwe rol of productiebevoegdheid toegekend.

## Beperkt bewijs

Vijf gerichte API-/contractcontroles slagen. De lokale migratie en de lees- en beheergrenzen zijn werkelijk uitgevoerd in een nieuwe kopie van een bestaande herstelbasis, in Docker met netwerk `none` en zonder gepubliceerde poorten. Tien bestaande F3–F5-schema-afhankelijkheden zijn alleen in die nieuwe kopie toegepast. Alle oefenrecords en beheerhandelingen zijn teruggedraaid. De controles raken geen Cloud-database.

De SQL-controle bevestigt gesloten aanmaak, geen impliciete publicatie door kanaalactivering, kanaalscheiding, geen directe tabel-/RPC-toegang voor gewone clients, een geldige exacte bronversie, intrekking, epoch-/bronwijziging, sessiecontrole, request-herhaling en verouderde beheerhandelingen. De fixtures hergebruiken de aanwezige lokale herstelcontext voor de voorzitter zonder persoonsinhoud te loggen. Dit is geen nieuwe live-accountproef.

TypeScript, gerichte lint en de geoptimaliseerde CC-build slagen. Er is geen brede handmatige app-acceptatie uitgevoerd. Volledige pagina-/beeldvarianten, meervoudige organisaties, gelijktijdigheidsvarianten en productiebelasting blijven bij de latere integrale acceptatie. De bestaande CI blijft intact.

## Uitvoering blijft afzonderlijk

De migratie is alleen lokaal uitgevoerd. Cloud DEV blijft volgens het laatst bevestigde bewijs op 135 registraties. Een eventuele toepassing van `20261025092249_f6_explicit_public_read_channels.sql`, een serverdeploy, nieuwe sleutels, kanaalregistratie, publieke toelatingen en activering vragen hun eigen concrete vrijgave. Het lezen van de nieuwe publieke route door de website is de volgende afzonderlijke bouwstap. Geen bestaande service of dienst wordt overgenomen of opgezegd.
