# Eventrechten: DEV-uitrol en acceptatie

Deze wijziging behoudt de bestaande appbevoegdheid `manageEvents`: actieve beheerder,
bestuur en teamlid kunnen Events aanmaken, bewerken en annuleren. Een vrijwilliger
kan dat alleen met een actieve, expliciet toegewezen aangepaste rol met `manageEvents`
binnen dezelfde organisatie.

## Uitrolvolgorde

1. Merge de bijbehorende pull request en wacht op geslaagde GitHub-controles/imagebouw.
2. Pas `20261006140627_align_event_permissions.sql` via de bestaande Supabase-migratieroute
   toe op Cloud Supabase DEV. Een Docker-deployment past SQL-migraties niet automatisch toe.
3. Deploy de nieuwe DEV-image met het bestaande `deploy-dev.sh` via Termius.
4. Voer onderstaande controles uit met testrecords en echte testaccounts.

## Vereiste controles

- Teamlid: nieuw testevent opslaan; beschrijving wijzigen; opnieuw openen en teruglezen.
- Vrijwilliger zonder bevoegdheid: geen bewerklink of editor bij `?bewerken=1`;
  rechtstreeks aangeroepen opslag en annulering worden geweigerd.
- Vrijwilliger met toegewezen Events-bevoegdheid: aanmaken/bewerken toegestaan.
- Bestuur/beheerder: bestaande aanmaak-, bewerk- en annuleringsflow blijft werken.
- Andere organisatie: geen toegang of wijziging; geen rol uit een andere organisatie gebruiken.
- Inactief lidmaatschap/verwijderde aangepaste rol: geen extra toegang.
- Geen gewijzigd record: geen succesmelding en geen automatische kalenderwijziging.
- Annuleren met een testevent: status teruglezen; kalenderproef alleen met expliciete toestemming.

## Grenzen

De automatische PostgreSQL-proef gebruikt PGlite met echte RLS en migraties; dat is
geen bewijs dat de migratie al op DEV is toegepast. Google Workspace, People,
relatiebeheer en andere modules behouden hun eigen toegangsregels; deze herstelronde
betreft het Eventrecord en de aanmaak-, bewerk- en annuleringsfuncties.
De bestaande policy voor fysieke DELETE blijft manager-only. Er is geen agentrun nodig.
