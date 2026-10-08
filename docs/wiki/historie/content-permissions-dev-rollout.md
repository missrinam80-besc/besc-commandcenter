# Content-rechten: DEV-uitrol en acceptatie

> Historische notitie. Dit document bewaart het ontwerp of de controle op de genoemde datum; het is geen actuele werkvoorraad. Zie de [wiki](../README.md) en [huidige releasewerkwijze](../Release-en-acceptatie.md).

## Probleem en gedrag

Op 6 oktober 2026 is met een alleen-lezen query op de bevestigde Cloud DEV-database `sjvzrsmrtcxxtmaxigtn` vastgesteld dat INSERT en UPDATE op `content_items` alleen `private.is_org_manager(organization_id)` gebruiken. De app gebruikt `manageContent`: beheerder, bestuur, teamlid en een actieve toegewezen aangepaste rol met die bevoegdheid.

De migratie `20261006155408_align_content_permissions.sql` laat INSERT en UPDATE dezelfde bevoegdheid volgen. De helper is SECURITY INVOKER, controleert actieve lidmaatschappen, organisatie, toegewezen rol en niet-verwijderde rollen. Hij is niet uitvoerbaar door anon/PUBLIC. Geen nieuwe capability of roltoewijzing wordt toegevoegd. De eigen-rol-leespolicy uit de eerder toegepaste Event-migratie is een voorwaarde.

Lezen, fysieke DELETE, audittriggers en rolbeheer blijven behouden. Archiveren, herstellen en zacht verwijderen gebruiken de bestaande Content-bevoegdheid en blijven UPDATE-acties. Dit voegt geen fysieke verwijderbevoegdheid voor teamleden toe.

De bewerkknop en het formulier (ook via een directe `?bewerken=1`-link) volgen `manageContent`. Opslaan en Content-lifecycle-acties melden alleen succes als er daadwerkelijk een rij is geraakt. Deze extra lifecycle-controle geldt uitsluitend voor Content; het gedrag van andere modules verandert niet.

## Validatie

419 Node-tests slagen, met echte Postgres-RLS-controles via PGlite en server-/schermtests. Beheerder, bestuur, teamlid en vrijwilliger met expliciete Content-bevoegdheid kunnen schrijven. Vrijwilliger zonder bevoegdheid, inactief lid, verwijderde rol of rol van een andere organisatie, ingetrokken toegang en anonieme gebruiker worden geweigerd. Overdracht naar een andere organisatie wordt geweigerd. Fysieke DELETE blijft alleen voor managers. Rolbeheer en audit blijven behouden. De eerdere campagne-/partnerrelatietests blijven slagen.

TypeScript en lint op gewijzigde bestanden geslaagd. De live database is alleen uitgelezen; migratie en serverdeployment zijn nog niet uitgevoerd. Geen betaalde agentrun.

## Uitrol

1. PR controleren en mergen op GitHub; kwaliteitscontrole en DEV-imagebouw afronden.
2. De Content-migratie toepassen en registreren op de bevestigde Cloud DEV-database. Controleer vooraf dat `20261006140627_align_event_permissions` is toegepast.
3. Nieuwe DEV-image via de bestaande Termius-deployprocedure uitrollen.
4. Live toetsen met echte rolaccounts; de lokale roltests zijn geen bewijs van afzonderlijke ingelogde DEV-accounts.

## Live acceptatie

- Teamlid: Content aanmaken, tekst wijzigen; campagne en partner behouden; archiveren/herstellen.
- Vrijwilliger zonder capability: geen bewerkknop of formulier bij een directe bewerklink; server weigert mutaties.
- Vrijwilliger met expliciete, actieve `manageContent`: dezelfde Content-acties als teamlid, zonder rolbeheer of fysieke DELETE.
- Beheerder/bestuur: bestaande Content-acties behouden.
- Niet-bestaand, verwijderd of niet-toegankelijk record: geen succesmelding voor opslag of lifecycle.
- Alleen gemarkeerde testrecords gebruiken: `TESTFIXTURE — NIET PUBLICEREN`. Geen publicatie of Google-bestandswijziging.
