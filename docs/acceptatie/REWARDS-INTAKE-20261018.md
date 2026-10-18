# Duurzame rewards-ontvangst — geïsoleerde verificatie

18 oktober 2026. Uitbreiding van draft-PR #109; geen merge, Cloud-migratie of DEV-deploy. De eerdere synthetische preview blijft apart bestaan. Contract: [duurzame intake V1](../contracts/rewards-intake-v1.md).

## Lokaal bevestigd

- Volledige testsuite: **954 geslaagd**, geen mislukt of overgeslagen. Nieuwe intakecontroles omvatten 11 API-tests en 8 PGlite-database-/integratietests, boven op de eerdere 20 previewtests.
- De werkelijke nieuwe SQL-functie draait tegen een geïsoleerd Auth-/lidmaatschaps-/rewards-schema. Eerste ontvangst, identieke replay, inhoudsconflict, bron-/organisatiegrenzen en misvormde data zijn gecontroleerd.
- Eerste accountbinding en uitkomst blijven behouden; actuele ontkoppeling, ban, softdelete, verkeerde rol/organisatie en inactief lidmaatschap blokkeren de huidige controle. Tegenstrijdige providerdata wordt geweigerd. Een andere nieuwe eigenaar of een later gekoppeld account kan oude afwijzingen niet omzetten.
- Een opgeslagen receipt blijft na sluiten en opnieuw openen van de bestandgebaseerde testdatabase bestaan. Rollback van een nieuwe ontvangst laat een veilige herhaling toe. Een ouder geworden reeds opgeslagen claim blijft herhaalbaar; een nieuwe verlopen claim wordt geweigerd.
- SQL-antwoorden zijn via de daadwerkelijke API-projectie gecontroleerd. Browserrollen hebben geen tabel-/RPC-toegang; service_role heeft geen directe ontvangsttabel- of accounthelperrechten. Public RPC is security invoker met lege search_path; private tabel heeft RLS aan zonder publieke policies.
- Bestaande synthetische XP/Bucks, reserveringen en toeken-/reservehistoriek blijven gelijk; intake maakt geen ledgerboeking.
- TypeScript en lint zijn geslaagd. Volledige Webpack-productiebuild geslaagd; zoals in de eerdere preview alleen vanwege de gedeelde node_modules-junction. TLS bleef aan met de Windows-systeem-CA.
- HTTP-proef tegen de gebouwde Next-route met uitsluitend loopback-mockupstream: uitgeschakeld zonder DB-aanroep, eigen bronbinding/scopes, veilige receiptprojectie, retry/read, conflict, weigering van onveilige RPC-successpayload en daadwerkelijke annulering van een vastlopende upstream-responsebody binnen het 5-secondenbudget. Testprocessen gestopt.

## PostgreSQL-concurrency in GitHub

`tests/rewards-intake-concurrency.mjs` is toegevoegd aan de bestaande kwaliteitsworkflow en weigert andere targets dan de expliciete localhost-CI-fixture. Hij controleert met werkelijk overlappende, blokkerende PostgreSQL-sessies: identieke ontvangst eenmaal, actorconflict zonder tweede receipt, rollback/herhaling en lidmaatschapsintrekking die tijdens lock-wachttijd commit. Ook bestaande saldi en ledger blijven gelijk. De status van deze nieuwe CI-run moet bij de review worden gecontroleerd; lokale PGlite-proeven vervangen dit niet.

## Migratie en grenzen

Migratiebestand `20261018213441_rewards_intake_receipts.sql` is met de geïnstalleerde Supabase CLI 2.110.0 (`migration new`) aangemaakt en daarna als SQL tegen geïsoleerde PGlite uitgevoerd. Er is geen CLI-diff van een volledige Supabase-stack geclaimd. De lokale `db advisors --local --type security --fail-on error` kon niet verbinden, omdat hier geen aparte lokale Supabase/PostgreSQL-service beschikbaar is. Daarom zijn grants/RLS/functie-eigenschappen expliciet in de databaseproeven gecontroleerd. Dit is geen geslaagde officiële advisor- of Cloud-controle; die blijft onderdeel van de afzonderlijke DEV-migratieacceptatie.

Alle identities, events, tokens, credits en providers in de lokale proeven zijn TESTFIXTURE. Geen echte account-/ledgerwrite, providerbericht, Cloud-migratie, configwijziging of live bronactivering uitgevoerd. De migratie maakt uitsluitend nieuwe private ontvangstobjecten en een beperkte service-RPC; zij activeert geen regels en vult geen bronrecords.

Nog niet bewezen/gebouwd: provideradapter/bewijs, operationele bridge/journal en retentie, volledige financiële semantiek/deduplicatie, quota en atomaire controle-plus-boeking. Iedere opgeslagen claim heeft `providerProofVerified=false` en `awarded=false`. Held claims mogen bij een latere activering niet vanzelf worden betaald. StreamElements-saldo-overname en automatisch verdienen blijven uit.
