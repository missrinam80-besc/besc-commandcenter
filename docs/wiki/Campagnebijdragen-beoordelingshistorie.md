# Beoordelingshistorie van campagnebijdragen

Lokale aanvulling van 7 november 2026. Nog niet op Cloud DEV toegepast of uitgerold.

Bij iedere beschikbare bijdrage opent **Beoordelingshistorie** een tijdlijn met de vastgelegde beslissingen, onderbouwingen, beoordeelde versies, beschikbaarheid, beoordelaar en tijdstip. De nieuwste beoordeling staat bovenaan; **Oudere beoordelingen** laadt de volgende 25. Het tijdstip wordt in Brussel weergegeven. Een lege historie en een niet-beschikbare historie krijgen verschillende meldingen.

## Herkomst en afscherming

De nieuwe, uitsluitend lezende RPC `f3_review_history` gebruikt bestaande, gecommitteerde `post.review`-ontvangstregistraties. Identieke verzoekherhalingen leveren geen dubbele beslissing op. De daadwerkelijke actor, revisie, beslissing, volledige ingediende reden en ontvangsttijd komen uit die bestaande registraties. De naam wordt bij weergave uit het huidige profiel opgezocht, met een neutrale fallback; een historische profielnaam wordt niet gereconstrueerd.

Iedere pagina controleert opnieuw de daadwerkelijke sessie, actieve organisatie, geopende campagne, geldige deelname en actuele campagnetaak of eigen bijdrage. Een voorzitters- of algemene adminrol geeft zonder zo'n taak geen toegang. Deelnemers kunnen alleen hun eigen beschikbare bijdragen bekijken. Intrekking, verlopen rechten, verwijderde sessie of verkeerde campagne/organisatie blokkeren het lezen. Er worden geen directe leesrechten op de private historietabellen gegeven.

Alleen beoordelingen vanaf de acceptatie van de **actuele** deelname worden getoond. Bij een nieuwe doelverklaring en hernieuwde deelname worden oude redenen niet naar het nieuwe doel overgenomen. De oude registraties blijven intern bewaard. Dit leesoverzicht verandert geen beslissing, revisie, deelname, rapport, bronmeting of auditregel en probeert ontbrekende historie niet achteraf te reconstrueren.

De RPC gebruikt noodzakelijke definerrechten voor de private ontvangstregistratie, een vaste lege zoekroute, expliciete sessie-/doelcontroles en uitvoering uitsluitend voor `authenticated`. Anonymous, `PUBLIC` en `service_role` krijgen geen uitvoerrecht. Een partiële zoekindex ondersteunt het opvragen per bijdrage. Bestaande werkstroom- en rapportfuncties, policies en private tabelrechten blijven ongewijzigd.

## Lokale verificatie en vrijgave

148 gerichte controles slagen, waaronder database-, scherm- en serverpaginaproeven. De 23 CA02-databasegevallen en drie gelijktijdigheidsproeven slagen ook op een tijdelijke PostgreSQL 17.11-container. De lokale Supabase-beveiligingsadviseur meldt geen problemen. TypeScript, ESLint, productiebuild, bron-/releasecontrole en diffcontrole zijn groen. De tijdelijke container is verwijderd.

De proeven controleren onder andere opeenvolgende redenen en revisies, echte tijdstippen en actor-ID's, lege en foutieve antwoorden, ontsnapte HTML, datumweergave, herhaling, organisatie- en persoonsgrenzen, intrekking tussen pagina's en 28 besluiten verdeeld over twee pagina's zonder dubbels.

Het [releasemanifest](../../ops/campaign-review-history-release.json) bevat de exacte SQL-hash. Voor een latere live vrijgave is de voorbereide migratie `20261107083706_campaign_review_history.sql` nodig. Die is uitsluitend in wegwerp-testdatabases uitgevoerd. De laatst geverifieerde Cloud-historie van 149 is een eerdere momentopname en moet vóór iedere toekomstige toepassing opnieuw worden gecontroleerd; op die baseline zou dit de 150e migratie zijn.

Geen Cloud-contact, live mutatie, roltoekenning, providerophaalactie, publicatie, push of serveruitrol in deze lokale opdracht. De volledige praktijkproef met een onafhankelijke tweede gebruiker blijft apart open.
