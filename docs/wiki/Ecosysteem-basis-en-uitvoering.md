# Ecosysteembasis en uitvoering

[← Wiki-startpagina](README.md)

**Actuele vervolgstatus, 21 oktober 2026:** technische F0-uitvoering op DEV geaccepteerd. Main is `594392cef96c2e9eb86ac93ea5b476f15038757e`; 33 registraties zijn hersteld (117 totaal), de oude 84 behouden en gecontroleerd schema gelijk. Exacte webimage, instellingen en rapport-/CSV-proef zijn door Linda bevestigd. Eén oude seed blijft uitgesloten; vijf artikelen blijven voorbereide concepten. [Uitvoeringsbewijs](../acceptatie/F0-UITVOERING-DEV-20261021.md). [F1](../f1/Implementatie-en-testbewijs.md) bevat nu de zes gebouwde werkpakketten met geïsoleerd testbewijs; nog geen Cloud-migratie, deploy of live acceptatie.

Onderstaande inventaris en verschillenlijst bewaren de oorspronkelijke F0.1-momentopname vóór uitvoering. Aantallen 84/34 en ‘nog niet uitgevoerd’ daarin zijn geen actuele F1-migratiebaseline; gebruik het bovenstaande uitvoeringsbewijs.

Werkpakket F0.1, gestart op 21 oktober 2026 vanuit het masterplan van 20 oktober. Doel: bestaande bouwstenen, rechten en migratieverschillen controleerbaar maken en de eerste afgebakende correctie opleveren. Dit is een voorbereidings- en codepakket; het herstelt nog geen Cloud-migratiehistorie en verleent geen formele bevoegdheden.

De verdiepte beoordeling is nu opgenomen in het [volledige F0-pakket](../f0/README.md). Alle 118 migraties zijn native op PostgreSQL 17.6 uitgevoerd en de beschreven schema-effecten komen overeen met Cloud. Er zijn 33 voorwaardelijke historiekandidaten en één inhoudelijke uitzondering: de vijf kennisbank-startartikelen ontbreken. De voorzitter is bevestigd voor bewijscontrole en formele goedkeuring; er zijn geen accounts of rechten toegewezen.

## Bronregister

| Onderdeel | Vastgesteld | Bewijs en grens |
| --- | --- | --- |
| CC | Main `279c607691883acd5f4ec8c6b12c7ce62e3b3920`, tree `54eebb4c28568b12ff93e53e0d3285353801c1af`, opnieuw opgehaald op 21 oktober. | Dit pakket staat op een eigen branch vanaf die versie. Geen bewijs dat een toekomstige branch al deployed is. |
| Discordbot | Remote main `bbaba45b1c36831de49fbd8d456588422d7450c5`, op 21 oktober opnieuw gecontroleerd. | Geen botcode of botconfiguratie gewijzigd. Eerdere ticket- en Bucksacceptatie blijft afzonderlijk. |
| Cloud DEV | Project `sjvzrsmrtcxxtmaxigtn`, BESC Command Center; metadata gecontroleerd op 21 oktober om 05:04 UTC. | Read-only, 118 tabellen met RLS, 143 functies, 1 view. Geen bedrijfsrijen of credentials opgehaald. Supabase noemt main ‘PRODUCTION’; dit blijft het afgesproken BESC DEV-project. |
| Website | Scope, stijlvoorbereiding en inventaris van 3 oktober bestaan. | Geen nieuwe website gebouwd in F0.1. De inventaris is geen actuele volledige crawl. |
| Streamkit | Lokale werking en herstart door Linda eerder bevestigd. | Verdere Streamer.bot-inrichting gepauzeerd. Geen nieuwe test op een andere pc of SSD. |
| Agents | Negen specialistpakketten en gedeelde onderzoeksbasis bestaan. | Eerdere pakketvalidatie is geen bewijs van actuele live connector- of uitvoertoegang. |
| Rewards | Persoonlijke functies en Twitchkoppeling eerder geaccepteerd; intake-V2 gemigreerd en webdeploy door Linda bevestigd. | Automatisch verdienen, preview en intake waren bij de laatste aangeleverde controle uit. Geen nieuwe flag- of servercontrole in F0.1. |
| Herstel | Eerdere handmatige exports, off-server download en versleutelde sleutelback-up bevestigd. | Geen nieuwe automatische back-up ingesteld. Volledig herstelbewijs vóór productie afzonderlijk consolideren. |

## Wat nu is gebouwd

Campagne-impressies en klikken behouden het onderscheid tussen een echte nul en een ontbrekende meting in sponsorportal, sponsorrapport, eventrapport en de twee CSV-exports. Gedeeltelijke totalen krijgen een duidelijke aanduiding en meetdekking. De kaarten heten ‘Impressies’, geen ‘Bereik’.

Dit pakket verandert geen saldi, rechten, databasewaarden, campagnes of historische partnerclassificaties. Het herstelt geen oude nulwaarden waarvoor geen bronbewijs bestaat. Andere KPI-aggregaties vallen buiten deze eerste correctie.

De [gedeelde contracten en rechtenmatrix](../contracts/ecosysteem-basis-v1.md) beschrijven de volgende wijzigingen voor governancebewijs, toestemming, partnerrollen en publieke publicatie. Dit zijn concrete voorstellen; ze bestaan nog niet als nieuwe database- of API-functionaliteit.

## Migratieverschillen

Er staan 118 migratiebestanden in Git en 84 versies in Cloud. Alle geregistreerde versies zijn ook in Git aanwezig. Voor 34 Git-bestanden ontbreekt een registratie. De laatste geregistreerde versie is `20261007152913_besc_role_management`; vijf ontbrekende registraties liggen vóór die versie.

De aangetroffen objectnamen bij deze bestanden bestaan in Cloud. Dat bewijst geen volledige uitvoering: constraints, triggers, grants, policies, seeddata en later vervangen functieversies moeten per migratie worden beoordeeld. Twee bestanden bevatten geen door de eenvoudige zoekregel herkende objectnamen; hun uitwerking moet direct worden onderzocht.

Voor de nieuwste rewardsfunctie is méér gecontroleerd: de actuele functiebody van `private.reward_intake_operation` heeft na CRLF-normalisatie dezelfde MD5 `6f7c342bcb8d415dbe26bb210706c7a4` als de Git-migratie `20261019221404`. Anon/authenticated mogen haar niet uitvoeren; service_role wel; de search_path is leeg. Deze fingerprint is een vergelijking van inhoud, geen beveiligings- of volledigheidsbewijs voor alle overige objecten. Ook de eerdere uitvoeringscontrole blijft van belang.

De 34 ontbrekende registraties:

| Versie | Migratie |
| --- | --- |
| 20260927100000 | allow_project_campaign_email_communications |
| 20261001100000 | add_email_communication_soft_delete |
| 20261001110000 | seed_operational_guidelines |
| 20261002171936 | social_mcp_oauth |
| 20261003100000 | add_streamteam_person_role |
| 20261007193759 | event_materials |
| 20261007205415 | event_schedule |
| 20261008051115 | event_giveaways |
| 20261008052243 | event_registrations |
| 20261008065014 | account_community_contacts |
| 20261008070508 | contact_account_intake |
| 20261008074044 | community_contact_documents |
| 20261008094405 | unified_dossier_editor |
| 20261009074806 | managed_dossier_choices |
| 20261009095014 | managed_agenda_types |
| 20261009100412 | bulk_asset_actions |
| 20261011130951 | ticketing_v1 |
| 20261012125349 | asset_fiche_followup |
| 20261012125447 | asset_editor_catalog |
| 20261012125922 | central_document_registry |
| 20261012125923 | asset_reservations |
| 20261012130608 | duplicate_materials |
| 20261012185859 | discord_ticketing_v2 |
| 20261012195715 | event_activities_agenda |
| 20261012195737 | event_editor_catalog |
| 20261014120609 | expense_inbox_intake |
| 20261014213254 | event_slot_bookings |
| 20261015115523 | discord_configuration_revision |
| 20261016062843 | discord_channel_check_contract |
| 20261016083106 | discord_ticket_intake_schema_access |
| 20261016102010 | discord_ticket_intake_transcript |
| 20261017162100 | bucks_xp_v1 |
| 20261018213441 | rewards_intake_receipts |
| 20261019221404 | rewards_intake_opaque_message_ids |

## Veilige reconciliatie

1. Leg broncommit, ongewijzigde migratiebestanden met SHA256 en het actuele Cloud-register vast. Gebruik `scripts/collect-foundation-baseline.mjs` voor een lokale inventaris; het overschrijft geen bestaand uitvoerbestand.
2. Voer `ops/foundation-readonly-audit.sql` uitsluitend uit in het bevestigde Cloud DEV-project. De transactie is read-only en leest schema-objecten, functionele fingerprints, rechten en historie; geen bedrijfsrijen. Bewaar de JSON lokaal buiten Git. Dit is geen volledige schemadump of herstelback-up.
3. Vergelijk de JSON-bestanden met `scripts/compare-foundation-history.mjs`. De uitvoer is een onderzoekswerkblad, geen autorisatie om migraties toe te passen. Zoekhints zijn geen SQL-parser.
4. Beoordeel iedere ontbrekende registratie tegen alle effecten en latere vervangingen. Deel in: volledig equivalent bewezen; gedeeltelijk/afwijkend; werkelijk ontbrekend; nog onbekend. Noteer bewijs en de beoordelaar. Een nieuwere functie kan een oude definitie terecht vervangen hebben.
5. Bij een bewezen equivalente migratie kan een apart gecontroleerd herstel van uitsluitend de historie worden voorbereid. Bij afwijkingen eerst een nieuwe, doelgerichte herstelmigratie ontwerpen en lokaal testen. Oude migratiebestanden blijven behouden.
6. Vóór een live herstel: actuele afgeschermde handmatige back-up, registerexport, gerichte object- en behoudcontroles, concrete opdracht en terugvalprocedure. Geen automatische db push/reset/pull of bulk repair starten op basis van dit werkblad.
7. Nacontrole vergelijkt exact de bedoelde historie-aanpassing en bevestigt dat objecten en bedrijfsgegevens ongewijzigd bleven als alleen historie werd hersteld. Een aparte schaduwomgeving moet vóór reguliere automatische migratie-uitrol de reproduceerbaarheid aantonen.

Een historie-repair verandert registraties en draait geen applicatiemigratie als vervanging daarvoor. Zie [de officiële CLI-uitleg](https://supabase.com/docs/reference/cli/supabase-migration-repair). Commando's en versie worden pas bij het concrete herstelplan gecontroleerd; dit pakket bevat geen uitvoerbaar repair-commando.

## Gegevens en rechten die nog besluitvorming vragen

Huidige Cloud-policies beperken governanceadministratie tot organisatiemanagers. Socialmetingen en vergaderingen zijn breder leesbaar voor actieve organisatieleden. Dit zijn technische toegangsregels, geen bewijs van formele bevoegdheid of toestemming voor toekomstige privécreatorinzichten.

Te bevestigen vóór uitvoering: formele bevoegdheden en reviewers; regels voor zelfgoedkeuring; zichtbaarheid van bestuurlijke dossiers; toestemming en bewaartermijn per doel; eerste publieke velden en maximale intrekkingstijd; partnerrollen en historische herclassificatie. Dit zijn geen blokkades voor de huidige correctie van meetweergave. Ze begrenzen wel de volgende databasewijziging.

## Opleverpoorten en status

| Resultaat | Status in F0.1 |
| --- | --- |
| Actuele bronversies en metadata-inventaris | Gecontroleerd op 21 oktober; lokale JSON-bewijzen buiten Git. |
| Verschillenlijst migratiehistorie | Verdiept: 33 voorwaardelijke historiekandidaten en één inhoudelijke uitzondering. Historieherstel nog niet uitgevoerd. |
| Rechtenmatrix en minimale domeincontracten | Uitgewerkt; voorzitter als controleur/beslisser bevestigd. Overige keuzes herkenbaar als voorstel; geen nieuwe rechten toegekend. |
| Eerste codecorrectie | Geïmplementeerd; 970 tests, lint, TypeScript en lokale productiebuild geslaagd. Zie het [acceptatieverslag](../acceptatie/ECOSYSTEEM-BASIS-F01-20261021.md). |
| Governancebewijs en partnerrollen | Impact en acceptatiecriteria uitgewerkt; implementatie volgt afzonderlijk. |
| Cloud- of serverwijzigingen | Niet uitgevoerd. |

De voorbereiding van F0 is uitgewerkt in het gekoppelde volledige pakket. Vaststelling, de inhoudelijke seed-afhandeling, live historieherstel en DEV-schermacceptatie blijven afzonderlijke stappen. Geen planning, budget of productiestatus is hiermee automatisch vastgesteld.

## DEV-acceptatie van de eerste correctie

Gebruik na de afzonderlijk goedgekeurde release bestaande toegankelijke dossiers of expliciet toegestane testfixtures. Controleer nul, ontbrekend en gedeeltelijk op sponsorrapport en eventrapport; vergelijk de CSV's; controleer de sponsorportal met het juiste account. Herhaal met een rol zonder toegang. Controleer lange labels op smal scherm en light/dark mode. Er is geen database-migratie voor deze codecorrectie nodig.

Controleer ook de bestaande uitgeschakelde rewardsflags en behouden Twitchkoppeling na een reguliere webdeploy. Er is geen botdeploy, scopewijziging of Streamer.bot-inrichting nodig. Bij een probleem kan de vorige webimage worden teruggezet: er is geen dataconversie om terug te draaien.
