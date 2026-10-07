# Kostenindiening: financiële statussen afschermen

Een Teamlid zonder financiële bevoegdheid kon bij een nieuwe kost ook Goedgekeurd,
Betaald en Terugbetaald kiezen. De serveractie en de INSERT-policy controleerden
die status niet afzonderlijk.

## Wijziging

- Indieners kiezen uitsluitend Gepland, Aangevraagd of Terugbetaling nodig.
- Betaaldatum, betalingsreferentie, budget- en inkomstenaanmaak worden alleen
  aangeboden aan bestaande financiële beheerders (Beheerder, Bestuur,
  Goedkeurder of Penningmeester).
- De serveractie weigert vervalste financiële statussen, betaalgegevens en
  wijzigingen door een indiener voordat een databaseverzoek wordt uitgevoerd.
- Een aanvullende restrictieve INSERT-policy beschermt dezelfde grenzen via
  de Data API en vereist de eigen indiener en lege goedkeuringsmetadata.
- Bestaande managerrechten, historische registraties en UPDATE-policies blijven behouden.

## DEV-uitrol

1. Merge de PR via GitHub; laat de bestaande workflow de DEV-image bouwen.
2. Pas `20261007081552_restrict_expense_submission_status.sql` toe op Cloud DEV.
3. Deploy de gebouwde DEV-image via het bestaande deployscript.
4. Controleer als Teamlid dat uitsluitend de drie indieningsstatussen zichtbaar
   zijn, en als financieel beheerder dat de bestaande opties beschikbaar blijven.
5. Controleer geweigerde vervalste inserts zonder echte financiële registraties
   te gebruiken. Voer eventuele databaseproeven binnen een rollback uit.

Lokaal getest: de echte serveractie met een gecontroleerde database-adapter en
de daadwerkelijke migratie in PGlite/Postgres, inclusief rollen, organisatiegrens,
wachtende lidmaatschappen, betaalgegevens en vervalste goedkeuringsmetadata.
Dit bewijst de lokale werking; Cloud DEV en de uitgerolde app moeten daarna
nog worden gecontroleerd.

Geen nieuwe betaalde dienst, dependency of agentrun toegevoegd.
