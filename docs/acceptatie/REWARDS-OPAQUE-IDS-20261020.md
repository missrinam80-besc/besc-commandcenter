# Oorspronkelijke providerbericht-ID's — 20 oktober 2026

## Scope

Lokale CC-vervolgwijziging op main 781e17cca4880f9dd8995a3bf0799c97a8c163c3. Geen Cloud-migratie, deploy, providerconfiguratie, token, Streamer.bot- of Discordbotwijziging. Activiteit/intake/preview blijven uit; geen punten of saldo-overname. Gesynchroniseerde projectbronnen zijn alleen gelezen.

V2 behoudt 1–128 zichtbare ASCII-bytes als oorspronkelijke event_id. Versie 1 wordt replay-only. Bestaande UUID-receipts blijven byte voor byte ongewijzigd en een overeenkomstige V2-herhaling verwijst terug naar hetzelfde historische ontvangstbewijs. Niet-ASCII, spaties, controls, lege of te lange IDs blokkeren. Dit is een bewust begrensd lokaal contract, geen claim dat Twitch uitsluitend dit formaat gebruikt.

## Lokale verificatie

- Alle 959 tests geslaagd op Node 24.14.0, inclusief API, PGlite SQL, echte migratie over een bestaande V1-rij, legacy-replay/conflict, V2 case-sensitivity en onveranderde saldi/reserveringen/boekingen.
- ESLint voor gewijzigde TypeScript/tests en TypeScript noEmit geslaagd.
- De oorspronkelijke migratie blijft ongewijzigd; nieuwe migratie via Supabase CLI migration new aangemaakt als 20261019221404_rewards_intake_opaque_message_ids.sql. De CLI-timestamp is UTC van de aanmaak; de user-facing werkdatum is 20 oktober in Europe/Brussels.
- De PostgreSQL CI-fixture past beide migraties toe. De bestaande werkelijke concurrencyproef gebruikt nu een opaque bericht-ID voor gelijktijdige herhaling en revocation tijdens lock-wachttijd. Uitvoering op native PostgreSQL en Linux-build worden apart door GitHub gecontroleerd; nog niet als lokale feiten geclaimd.

De eerste nieuwe overgangstest riep het multi-statement migratiebestand via de prepared-queryhelper aan en werd door PGlite geweigerd. Hersteld naar db.exec met geresette rol. De gerichte overgangstest en daarna de volledige 959-test-run zijn geslaagd. Geen productiefout of Cloud-write.

De Supabase changelog.md en HTML-changelog waren tijdens deze controle niet opvraagbaar via de browserzoektool. De actuele databasefunctiedocumentatie en Twitch WebSocket-reference zijn wel gelezen. Er is geen SDK-, CLI-versie-, Auth- of RLS-ontwerpwijziging; bestaande functieprivileges blijven gelijk en worden getest. Geen officiële live Security Advisor-nacontrole van deze nog niet toegepaste migratie geclaimd.

## Grenzen en uitrol

De provideradapter ontbreekt nog. Een V2-ID is geen bewijs van herkomst en het ontvangstbewijs houdt providerProofVerified=false en awarded=false. De nieuwe migratie vervangt alleen de bestaande private operationele functie; geen tabel- of receiptbackfill.

Na afzonderlijke merge-/migratie-/deploygoedkeuring: migratie eerst, webimage daarna, intake uit tijdens overgang. Oude image plus nieuwe database kan nog V1-replays verwerken maar geen nieuwe V1-claims opslaan. Geen blinde rollback naar de V1-functie nadat V2-rijen bestaan. Bronproef, retentie, werkelijke OAuth/scopes/subscriptions, bronjournaal en financiële semantiek blijven afzonderlijk open.

Contract en herstelgrenzen: [duurzame intake](../contracts/rewards-intake-v1.md).
