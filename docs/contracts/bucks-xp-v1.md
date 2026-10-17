# BESC Bucks en XP versie 1

Deze ontwikkelbranch bevat de CC-datalaag, pagina en beperkte API voor XP, BESC Bucks en een beloningencatalogus met goedkeuring. De module is lokaal getest, maar nog niet gemerged, gemigreerd of gedeployd. De botruntime wordt in zijn afzonderlijke repository aangepast tegen het API-contract.

## Bevestigde scope

De gebruiker bevestigde op 17 oktober 2026:

- Tekstberichten, tijd in voicekanalen en handmatige beloningen behoren tot de eerste versie.
- Alleen leden met een actueel gekoppeld BESC-account mogen verdienen en beloningen aanvragen.
- Alle verdienbedragen, kanalen, wachttijden, daglimieten en levelgrenzen zijn configureerbaar. Automatische verdienregels blijven uitgeschakeld.
- Leden kunnen BESC Bucks besteden door beloningen uit een beheerde catalogus aan te vragen. Aanvragen vereisen goedkeuring.
- Twitch en Streamer.bot volgen later.
- Command Center en bot blijven in afzonderlijke repositories en op afzonderlijke servers. De bot gebruikt alleen de beperkte CC-API.

De bestaande ticketmodule, accountkoppeling en slotberichten blijven behouden. Deze uitbreiding activeert geen bestaande uitgeschakelde functies en wijzigt geen MEE6-instellingen.

## Punten en saldo

XP beschrijft voortgang en bepaalt een level via configureerbare drempels. XP is niet besteedbaar. BESC Bucks zijn besteedbaar. Beide zijn gehele getallen; bedragen in euro en betalingsfuncties behoren niet tot deze versie.

Elke deelnemer krijgt binnen de organisatie één rekening. Discord en de latere Twitch-koppeling verwijzen naar die rekening; opnieuw koppelen mag geen nieuw saldo opleveren. Een Discord-ID op zichzelf verleent geen extra CC-rechten.

Een overzicht toont totaal XP, level, totaal Bucks, gereserveerde Bucks en beschikbare Bucks. Beschikbaar is totaal minus gereserveerd. Zowel totaal als beschikbaar moeten niet-negatief blijven.

Toekenningen, correcties, reserveringen, bestedingen en vrijgaven krijgen een blijvende registratie met reden, bron, actor, tijdstip en verwijzing naar de oorspronkelijke actie. Correcties maken een tegenboeking; een beheerder overschrijft of verwijdert geen bestaande saldoregels.

## Discordactiviteit

CC beheert de verdienregels en bepaalt hoeveel een geaccepteerde activiteit oplevert. De bot levert een activiteit aan en mag zelf geen vrij gekozen puntenbedrag meesturen.

Tekstactiviteit: geselecteerde kanalen, uitsluitend nieuwe berichten van echte gebruikers, geen bot-/webhookberichten, privéberichten of berichtbewerkingen. Er wordt geen berichtinhoud opgeslagen. De regel bevat een wachttijd per persoon, een daglimiet en afzonderlijke aantallen XP en Bucks. Voice wordt in volledige intervallen van 60 tot 75 seconden aangeleverd; elk geaccepteerd interval krijgt maximaal één toekenning. Minimum deelnemers en uitsluiten bij mute, deafen of AFK zijn instelbaar. De formulierwaarden twee deelnemers en deze uitsluitingen aangevinkt zijn aanpasbare startwaarden, geen geactiveerde regel.

Automatische toekenning staat standaard uit. Er zijn geen standaard verdienbedragen, actieve kanalen of leveldrempels. Inschakelen vereist een geldige, opgeslagen configuratie. Een configuratiewijziging geldt voor nieuwe activiteiten en rekent oude berichten niet opnieuw af.

De API accepteert beperkte, recente activiteit met de Discord-gebeurtenis-ID als unieke bron. De maximale ouderdom is twee minuten, met maximaal vijf seconden klokafwijking naar de toekomst. Daglimieten gelden volgens UTC per persoon, activiteitstype en guild; wachttijden zijn instelbaar tussen 60 en 86400 seconden. Verwerkingstijd van CC is leidend voor het afdwingen van limieten; een client kan de limieten niet omzeilen met een zelfgekozen tijdstip.

Een wachtrij op de bot kan levering na een korte storing opnieuw proberen. Een te oude activiteit wordt zichtbaar afgewezen en wordt niet onbeperkt alsnog beloond. Het opnieuw aanbieden van dezelfde gebeurtenis kent nooit tweemaal punten toe.

## Handmatige toekenningen

Een bevoegde beheerder kiest een deelnemer, XP en/of Bucks en vult verplicht een reden in. Het formulier toont de wijziging vóór opslaan. Negatieve correcties vereisen een verwijzing naar de eerdere boeking en mogen een saldo niet onder nul brengen of een bestaande reservering aantasten.

Een inzending krijgt vóór verzenden een unieke aanvraag-ID. Een herhaald verzoek na antwoordverlies levert dezelfde opgeslagen uitkomst. Hetzelfde ID met een gewijzigde deelnemer, reden of bedrag wordt geweigerd.

## Catalogus en aanvragen

Een catalogusitem bevat een naam, uitleg, Bucks-prijs, beschikbaarheid en optioneel een voorraadlimiet. Items starten als concept. Een item dat gebruikt is in een aanvraag kan worden gedeactiveerd, maar niet uit de aanvraaghistoriek verdwijnen.

Een aanvraag bewaart de naam, uitleg en prijs zoals ze bij indienen golden. Een latere prijswijziging verandert de aanvraag niet. Reserveren van Bucks en eventuele voorraad gebeurt in dezelfde databasetransactie als het aanmaken van de aanvraag.

| Stap | Status | Effect |
| --- | --- | --- |
| Lid vraagt een beschikbare beloning aan | Aangevraagd | Bucks en eventuele voorraad worden gereserveerd. |
| Beheerder keurt goed | Goedgekeurd | Gereserveerde Bucks worden definitief besteed; reservering wordt afgebouwd. |
| Beheerder wijst af | Afgewezen | Reservering en voorraad komen vrij; reden is verplicht. |
| Lid annuleert vóór beslissing | Geannuleerd | Reservering en voorraad komen vrij. |
| Beheerder registreert levering | Afgehandeld | Levering wordt geregistreerd, zonder opnieuw Bucks af te schrijven. |

Goedgekeurde aanvragen kunnen niet via de gewone annuleerknop teruggedraaid worden. Een eventuele terugbetaling is een afzonderlijke, traceerbare beheeractie. Aanvragers keuren hun eigen aanvraag niet goed; een andere bevoegde beheerder behandelt die.

Gelijktijdige aanvragen mogen samen niet meer dan het beschikbare saldo of de voorraad reserveren. Twee behandelaars kunnen niet allebei dezelfde aanvraag beslissen. De server weigert een verouderde versie en toont de actuele status.

## Pagina en navigatie

Er is één module **BESC Bucks en XP**, met dezelfde componenten en kleurvariabelen als de rest van CC, geschikt voor donkere en lichte modus.

- **Mijn overzicht:** eigen saldo, XP/level, historiek, beschikbare beloningen en eigen aanvragen.
- **Aanvragen:** wachtrij voor bevoegde behandelaars, opvallende status, aanvrager, beloning, gereserveerd bedrag en beslissing.
- **Deelnemers:** zoeken, saldo bekijken en handmatig toekennen of corrigeren voor bevoegde beheerders.
- **Catalogus:** concepten, publiceren/deactiveren en voorraad beheren.
- **Verdienregels:** activiteit, kanalen, aantallen, wachttijd, daglimieten en leveldrempels. Automatisering blijft standaard uit.

Voldoende saldo betekent dat een aanvraag kan worden ingediend, niet dat ze automatisch goedgekeurd wordt. De interface maakt gereserveerde en beschikbare Bucks apart zichtbaar.

## Rechten en organisatiegrenzen

Er is een afzonderlijke bevoegdheid `manageRewards` voor beheer en behandeling. Admins en bestuur krijgen die via het bestaande rollenmodel; delegatie verloopt via bestaande rollenprofielen. Ticketmedewerkers en botbeheerders krijgen deze bevoegdheid niet automatisch.

Een lid ziet uitsluitend de eigen rekening en aanvragen en de gepubliceerde catalogus van de eigen organisatie. Beheerders zien alleen deelnemers en aanvragen binnen hun organisatie. Lidmaatschap, actuele accountkoppeling en eventuele blokkering worden bij elke gevoelige actie opnieuw gecontroleerd.

De openbare datalaag krijgt RLS en expliciete grants. Rekeningtotalen en het boekingsregister zijn niet direct schrijfbaar door leden. Afgeschermde databasefuncties voeren controle, lock, boeking en opgeslagen antwoord in één transactie uit. Publieke aanroepfuncties draaien als invoker; verhoogde interne functies krijgen een vaste lege search_path en uitsluitend de noodzakelijke uitvoerrechten.

## Beperkte bot API

Het [API-contract](bucks-xp-api-v1.md) en de [gedeelde fixtures](../../tests/fixtures/rewards-v1.json) beschrijven de uitgewerkte routes en antwoorden. Bestaande clientrecords worden niet automatisch uitgebreid.

| Actie | Route onder `/api/v1/bot/rewards` | Beoogde scope |
| --- | --- | --- |
| Eigen saldo en XP bekijken | `GET /account` | `rewards:own:read` |
| Gepubliceerde catalogus bekijken | `GET /catalog` | `rewards:own:read` |
| Eigen aanvragen bekijken | `GET /requests` | `rewards:own:read` |
| Beloning aanvragen | `POST /requests` | `rewards:own:write` |
| Eigen open aanvraag annuleren | `POST /requests/{id}/cancel` | `rewards:own:write` |
| Discordactiviteit aanleveren | `POST /activity` | `rewards:activity:ingest` |

Voor persoonlijke acties komt de Discord-commandactor uit de echte interactie, nooit uit een vrij invulbare gebruikeroptie. CC blijft de bot vertrouwen om die echte actor aan te leveren; een clientsleutel alleen bewijst de actor niet. CC verifieert daarnaast de actuele Auth-identity en organisatiebinding. De intake-uitzondering voor ongekoppelde ticketgebruikers verleent geen toegang tot Bucks of andere accountgegevens.

Activiteitsverwerking heeft geen bevoegdheid om catalogusprijzen, bedragen, rechten of goedkeuringen te wijzigen. De bot levert alleen begrensde metadata: guild, Discord-gebruiker, kanaal, unieke gebeurtenis en activiteitstype. De organisatie wordt uit de geauthenticeerde client gehaald, niet uit de requestbody.

Alle schrijfverzoeken zijn duurzaam idempotent. De unieke sleutel is gebonden aan organisatie, guild, operatie en Discord-interactie of gebeurtenis. Discordactiviteiten en persoonlijke Discordopdrachten gebruiken een stabiele bronnamespace zodat clientrotatie geen tweede boeking veroorzaakt. Webformulieren gebruiken een aparte namespace. Een canonieke requesthash omvat alle betekenisvolle velden. Herhaling met dezelfde inhoud retourneert dezelfde opgeslagen uitkomst; andere inhoud geeft `idempotency_conflict`. Authenticatie en actuele bevoegdheid worden ook bij herhaling gecontroleerd. Onzekere time-outs worden met hetzelfde ID herhaald, nooit met een nieuw ID.

Responses gebruiken `Cache-Control: no-store`, begrensde paginering, veilige foutcodes en een aanvraag-ID. De bestaande gezamenlijke serverdeadline en echte annulering van upstream-aanvragen blijven behouden. Logs bevatten geen berichtinhoud, API-sleutels, tokens of private ledengegevens.

## Acceptatie voor uitvoering

De implementatie moet vóór DEV-activering aantonen dat:

1. Organisatie A geen saldo, catalogus of aanvragen uit organisatie B kan lezen of wijzigen.
2. Een lid alleen eigen gegevens kan raadplegen; ontbrekende, ingetrokken of verlopen clients en ontbrekende scopes worden geweigerd.
3. Een ontkoppelde of geblokkeerde Discord-identity geen persoonlijke handelingen kan uitvoeren.
4. Berichtherhaling, formulierdubbelklik en antwoordverlies geen dubbele punten of reserveringen opleveren.
5. Gewijzigde inhoud bij dezelfde unieke sleutel wordt geweigerd, inclusief een gewijzigde actor.
6. Gelijktijdige aanvragen en beslissingen geen negatief saldo, dubbele besteding of te grote voorraadreservering veroorzaken.
7. Afwijzen en annuleren precies eenmaal vrijgeven; goedkeuren precies eenmaal afschrijft; afhandelen geen tweede afschrijving doet.
8. Kanaalselectie, wachttijd en daglimiet worden afgedwongen en gewijzigde regels bestaande boekingen niet herschrijven.
9. Een fout midden in de transactie niets gedeeltelijk opslaat.
10. Ticketing, bestaande scopes, account- en eventrechten en de uitgeschakelde slotopties behouden blijven.

Testgegevens dragen `TESTFIXTURE` en komen uitsluitend in de geïsoleerde testomgeving. Er wordt geen live puntensaldo geïmporteerd en geen MEE6-functie uitgezet tijdens lokale ontwikkeling.

## Catalogus en meldingen

Er zijn nog geen echte beloningen, prijzen of voorraad opgegeven. De catalogus start leeg; een beheerder kan concepten maken en ze later beschikbaar zetten. Er worden geen fictieve voordelen gepubliceerd.

Een lid kan de beslissing op Mijn aanvragen raadplegen. Automatische DM- of e-mailmeldingen over beloningsbeslissingen behoren nog niet tot deze versie. Daarvoor zijn afzonderlijke afspraken en herstelbare afleveropdrachten nodig.

## Implementatie en validatie

De migratie is `20261017162100_bucks_xp_v1.sql`, lokaal gegenereerd met de geïnstalleerde Supabase-CLI. Nieuwe tabellen krijgen RLS; directe writes door `authenticated` en alle toegang door `anon` zijn ingetrokken. De webwrapper gebruikt de sessie, de botwrapper is uitsluitend voor `service_role`.

De pagina `/app/bucks` heeft Mijn overzicht, Beloningen, Mijn aanvragen en voor bevoegde beheerders Beheer, Verdienregels en Historiek. De configuratieformulieractie slaat regels altijd met `enabled=false` op. Daarnaast is automatische verwerking geblokkeerd zolang de serverflag `BESC_REWARDS_ACTIVITY_ENABLED` niet exact `true` is.

Lokale tests dekken saldo, reserveringen, snapshots, correcties, rechten, organisatiegrenzen, actuele koppelingen, voicecriteria, quota en API-validatie. Een aparte tijdelijke PostgreSQL 17-container zonder netwerk of gekoppelde volumes test echte overlappende sessies voor voorraad, saldo, dezelfde inzending, twee beslissingen en rollback. Zie het [testverslag](../acceptatie/BUCKS-XP-V1-20261017.md).

## Ontwikkeling en ingebruikname

CC-branch: `codex/bucks-xp-v1`, gestart vanaf CC-main `37c1044ffe6b745c0d07449979fc82e022cc98cc`. De bot krijgt later een eigen branch en PR in zijn eigen repository.

De eerstvolgende bouwstap is de botaanpassing tegen het vastgelegde API-contract. Daarna volgen beoordeling en afzonderlijke DEV-inrichting. Migratie, scopes configureren, deployen en DEV-acceptatie zijn afzonderlijke stappen na review.

Ontwikkeling activeert geen live verdienregels, deelt geen Bucks uit, publiceert geen beloningen en wijzigt geen serverconfiguratie. Eventuele Termius-instructies benoemen expliciet CC-server BESCSRVDEV of botserver BESCSRVDEV-02; SQL voor Cloud DEV hoort in de DEV Supabase SQL Editor.

## Technische referenties

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): combineer expliciete grants en policies per organisatie en gebruiker.
- [Supabase database functions](https://supabase.com/docs/guides/database/functions): beperk verhoogde functies en hun uitvoerrechten.
