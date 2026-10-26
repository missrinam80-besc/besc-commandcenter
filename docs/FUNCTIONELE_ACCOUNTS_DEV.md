# Functionele contactprofielen — lokale voorbereiding

Een functioneel BESC-account heeft een contactfiche en bestaande accountgebonden
historie, maar vertegenwoordigt geen natuurlijke persoon. Een contact als `info`
alleen hernoemen zou het nog als vrijwilliger laten meetellen.

Deze wijziging voegt `functional_account` / **Functioneel account** toe aan de
bestaande contacttypen en editor. De bestaande contact- en account-ID blijven
behouden. Het type bepaalt geen loginrechten, accountrollen, Bucks of toegang.

## Gedrag

- Community toont contacten met afzonderlijke aantallen personen en functionele
  accounts; het nieuwe type heeft een eigen filter en editor-keuze.
- Persoonskeuzes voor inzet, planning, verantwoordelijken, persoons-KPI's,
  ledenverificatie en externe persoonlijke verklaringen sluiten het type uit.
  Algemene contact-/dossierrelaties blijven contactrelaties.
- Management telt het type niet als nieuwe persoon. Creatorrapporten sluiten het
  ook uit wanneer oude beschrijvende rollen nog `streamteam` bevatten. Accountgebonden
  werk blijft zichtbaar onder de juiste titel: open werk per account.
- Nieuwe persoonskoppelingen worden ook in de database geweigerd, onafhankelijk
  van clientfiltering of caller-RLS. De private triggerhelpers krijgen geen
  uitvoerrechten voor `anon`, `authenticated`, `service_role` of `PUBLIC`.
- Het herclassificeren van een bestaand persoonlijk dossier wordt geweigerd zolang
  persoonsgebonden registraties bestaan. Bestaande gegevens worden niet stilzwijgend
  omgezet of ingetrokken. Een herclassificatie vereist `READ COMMITTED`, zodat
  de gekoppelde dossiers na het gedeelde werkstroomslot actueel worden gelezen.

De database bewaakt persoonverwijzingen in `association_members`,
`association_identity_verifications`, `consent_records`, `community_assignments`,
`event_schedule_items`, `event_materials`, `event_giveaways`, `assets`, `kpi_records`,
`private.campaign_participants` en `private.creator_profiles`. De bestaande
workflowpoort wordt hergebruikt; een persoonsverwijzing neemt daarnaast een
gedeeld slot op het contact. Accountgebaseerde login, toegang en historie worden
niet geclassificeerd als een persoonsverklaring of automatisch ingetrokken.

## Migratie en gecontroleerde datacorrectie zijn afzonderlijke stappen

`20261026160127_functional_account_profiles.sql` verruimt één bestaande check en
voegt drie private helperfuncties en twaalf triggers toe. Geen nieuwe tabellen,
geen bestaande rijen wijzigen, geen seed en geen wijziging van bestaande grants.

Er wordt niets automatisch afgeleid uit een naam, mailbox of accountrol. Het live
contact `info` wordt door deze migratie niet hernoemd of geclassificeerd. Een
latere afzonderlijke datacorrectie kan na actuele voorcontrole dezelfde fiche als
functioneel classificeren en de beschrijvende vrijwilligerstag afhandelen. De
technische accountrol blijft een afzonderlijke toegangskeuze.

Linda heeft bevestigd dat de bestaande taken **Doelen en verklaringen beheren**
en **Partnerrollen beheren** behouden blijven. Deze wijziging schrijft geen
taakroltoekenningen, intrekkingen of besluiten.

## Validatie en grenzen op 26 oktober 2026

- 38 gerichte gevallen groen: contactclassificatie, daadwerkelijke editor-rendering,
  persoonskeuze, bestaande editor-/feedback- en rapportagegevallen en geïsoleerde
  SQL-controles met PGlite. De SQL-proef controleert alle elf bewaakte verwijzingen,
  RLS-onzichtbare contacten, organisatiegrenzen, functiegrants en behoud van bestaande
  accounts, rollen, audit en Bucks in fictieve gegevens.
- TypeScript, lint op de gewijzigde bestanden en Next-productiebuild groen.
- Geen volledige appacceptatie of live-proef uitgevoerd.
- Native PostgreSQL 17.11-controle groen: 137 voorgaande migraties met de bestaande
  platformvorm-fixture nagebouwd, oude operationele seed uitgesloten, exacte nieuwe
  migratie toegepast en bestaande fictieve rijen, tabelrechten, policies en functies
  behouden. Vier gevallen groen: classificatie eerst, persoonskoppeling eerst,
  verouderde classificatietransactie en verouderde koppelingstransactie. Echte
  lock-wachttijden geobserveerd waar de tweede verbinding moest wachten.
- De tijdelijke PostgreSQL-container had geen netwerk of gepubliceerde poorten en
  is verwijderd. Dit bewijst de gerichte databasewerking met fictieve data, niet
  het gedrag van de echte Auth-, Storage- of Vault-diensten of volledige appacceptatie.
- De eerste native poging stopte door een ontbrekende projectkoppeling in de
  testfixture. Na toevoeging van een geldig fictief project slaagde de proef;
  de migratiecode is hiervoor niet gewijzigd.
- Geen push, PR, merge, Cloud-migratie, deploy of live-datacorrectie uitgevoerd.

Volgende stap: code-review en afzonderlijke vrijgave van de migratie, uitrol en
concrete contactcorrectie. Nog geen enkele uitvoeringsstap op DEV vrijgegeven.
