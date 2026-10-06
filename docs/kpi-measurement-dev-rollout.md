# KPI-meetstatus en doelrichting: DEV-uitrol

## Gedrag

- `measurement_status`: `measured` vereist een numerieke waarde; `missing` vereist NULL.
- Een gemeten nul blijft 0, ook met doel 0.
- `target_direction`: `higher` gebruikt waarde >= doel; `lower` gebruikt waarde <= doel.
- `unknown`, ontbrekende waarde of ontbrekend doel geeft geen oordeel. Doelen met onbekende richting of ontbrekende waarde staan apart als niet te beoordelen.
- De score gebruikt alleen beoordeelbare doelen. Zonder beoordeelbare doelen verschijnt geen percentage.
- Procentuele ontwikkeling vanaf nul of een ontbrekende vergelijkingswaarde is niet berekenbaar.
- Rapporten, CSV-exports en sponsor-pitchdecks tonen ontbrekende KPI-metingen expliciet. CSV-doelen blijven numeriek; meetstatus, doelrichting en beoordeling krijgen aparte kolommen. Het samengestelde managementexport vermeldt de beoordeling bij Doel/detail.

## Migratie en bestaande gegevens

Migratie: `20261006144233_kpi_measurement_status_and_direction.sql`.
Bestaande numerieke waarden blijven behouden en krijgen meetstatus `measured`. Alle bestaande richtingen blijven `unknown`; er wordt niets afgeleid uit de KPI-naam. Historisch als nul opgeslagen ontbrekende waarden zijn niet automatisch te herkennen of te herstellen. Controleer deze op hun bron en corrigeer ze zo nodig handmatig.

De migratie behoudt RLS, rechten en audittriggers. Ongeldige combinaties en niet-eindige cijfers worden geweigerd. Bij bestaande NaN-waarden faalt de transactie zonder gedeeltelijke wijziging; onderzoek dan de bron voordat de migratie opnieuw wordt uitgevoerd.

## Volgorde

1. PR controleren en mergen op GitHub; bestaande kwaliteitscontrole en DEV-imagebouw afronden.
2. Migratie toepassen op de bevestigde Cloud Supabase DEV-database en registratie controleren.
3. Pas daarna de nieuwe DEV-image via Termius uitrollen met de bestaande deployprocedure.
4. Onderstaande controles uitvoeren. Productie is niet onderdeel van deze wijziging.

## Acceptatie op DEV

- Nieuwe KPI: waarde 0, doel 0, Lager is beter -> Doel behaald.
- Waarde 8, doel 10: Hoger is beter -> niet behaald; Lager is beter -> behaald.
- Ontbrekende meting: waardeveld uitgeschakeld, na opslaan ontbrekend in detail, rapport en CSV; niet als mislukking in score.
- Bestaande KPI: waarde behouden, richting Nog niet vastgelegd, beoordeling Niet te beoordelen. Richting expliciet kiezen en opnieuw controleren.
- Leeg veld met Gemeten of ongeldige getallen worden niet opgeslagen.
- Geen eerdere activiteit: managementontwikkeling Niet berekenbaar, ook bij 0 naar 0.
- CSV: gemeten nul is 0, ontbrekende meting is tekst, doel blijft een aparte numerieke kolom.

## Lokale validatie

403 Node-tests geslaagd, waaronder echte Postgres-migratiecontrole met PGlite: bestaande nul behouden, beide meetstatussen, ongeldige combinaties/NaN geweigerd, RLS/policy/audittrigger behouden. TypeScript en lint op gewijzigde bestanden geslaagd. Geen live migratie, deployment of betaalde agentrun uitgevoerd tijdens deze voorbereiding.
