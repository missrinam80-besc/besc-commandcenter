# Repositoryonderhoud

[← Ontwikkeling en beheer](Ontwikkeling-en-beheer.md)

## Code, data en tijdelijke bestanden

Git bevat de appcode, configuratievoorbeelden, documentatie en migraties. Databaseback-ups, accounts, sessies, tokens en uploads horen in een afgeschermde back-up buiten Git. Een dump uit een commit verwijderen haalt eerdere versies niet uit de Git-geschiedenis; een geschiedeniswijziging en eventuele sessie-intrekking zijn afzonderlijke acties.

Next.js-uitvoer (`.next/` en `.next-*/`), Python-cache en lokale dumps worden door Git en de Docker-buildcontext uitgesloten. Verwijder tijdelijke mappen uitsluitend wanneer het bijbehorende proces gestopt is. Oude redirectroutes kunnen nuttig blijven voor bookmarks en OAuth-callbacks.

De actieve social planning staat in `ops/besc-social-sync.timer` en de bijbehorende service. De cronroute blijft beveiligd en is geen afzonderlijke Vercel-deployment.

## Uniforme dossiereditor

`src/lib/dossier-editor-catalog.ts` bepaalt de bewerkbare fiches en onderdelen. `src/lib/dossier-editor-schema.json` is gegenereerd uit de catalogus en de migraties. `scripts/dossier-editor-transaction.sql` is de vaste opslagtemplate; de SQL-migratie bevat de ingevulde catalogus. Deze bestanden zijn bewust afgeleiden van dezelfde bron.

Controleer zonder iets te wijzigen:

```sh
node scripts/build-dossier-editor-schema.cjs --check
node scripts/build-dossier-editor-migration.cjs --check
```

Na een wijziging van catalogus of schema: genereer de veldmetadata opnieuw met `node scripts/build-dossier-editor-schema.cjs`. Een gewijzigde opslagfunctie krijgt altijd een nieuwe migratie:

1. Maak met `supabase migration new <naam>` een nieuw leeg bestand.
2. Vul het met `node scripts/build-dossier-editor-migration.cjs --output supabase/migrations/<nieuw-bestand>.sql`.
3. Vergelijk de gewijzigde functie en catalogus met de vorige versie; test in een geïsoleerde database.
4. Pas de gecontroleerde baseline in de generator aan naar de nieuwe functieversie, zodat `--check` de actuele bron vergelijkt. Verander de oude migratie zelf niet.
5. Lever de nieuwe migratie via GitHub en voer haar uitsluitend op de bedoelde omgeving uit.

De generator weigert standaard schrijven en weigert een bestaand niet-leeg bestand te overschrijven. De kwaliteitscontrole controleert de gegenereerde bronnen.

## Migratiegeschiedenis

Bewaar de migratieketen. Een latere migratie bevat niet automatisch eerdere tabellen, rechten, triggers en gegevenswijzigingen. Samenvoegen is een aparte operatie met een vergelijking van schone installaties en migratiehistoriek. Supabase squash neemt gegevenswijzigingen niet over.

SQL uitvoeren in de Cloud SQL Editor registreert niet vanzelf dezelfde CLI-migratiehistoriek. Vergelijk vóór toekomstige automatische uitrol de lokale bestanden met `supabase_migrations.schema_migrations`; pas geschiedenis alleen aan nadat de werkelijke schemasituatie gecontroleerd is. Voer geen remote reset uit voor onderhoud.

## Documentatie

Actuele uitleg staat in deze wiki en `handleidingen/`. Gedateerde ontwerpen, uitrolnotities en eerdere checklists staan in `historie/`. Bewaar één actuele uitleg en verwijs daarnaar. Verplaatsingen vereisen controle van links en verwijzingen uit code en tests; CSV-templates blijven onder `docs/data-templates/`.
