# Volledige taakaanmaak in één transactie

`createTask` stuurt één `create_task_bundle`-opdracht. De taak, optionele verantwoordelijke, checklist en optionele gerelateerde dossierkoppeling worden samen opgeslagen. Als een onderdeel faalt of geen rij opslaat, rolt de hele transactie terug. Succes en verversing volgen pas na een geldige teruggegeven taak-ID.

De functie gebruikt SECURITY INVOKER en bestaande RLS. De aanvrager moet actief lid zijn van de gekozen organisatie. Project en contextdossier moeten zichtbaar, niet verwijderd en van dezelfde organisatie zijn. De verantwoordelijke moet zichtbaar en actief lid zijn; de eerdere `replace_task_assignee`-functie wordt hergebruikt. Contexttabellen komen uit een vaste allowlist. Contextparen en checklistlengtes worden gecontroleerd; checklistvolgorde blijft behouden.

Geen nieuwe rollen of ruimere lees-/schrijfrechten. Een gebruiker zonder recht om de aangevraagde dossierkoppeling te maken krijgt nu een fout in plaats van een gedeeltelijk aangemaakte taak. Losse taken zonder extra velden blijven werken. Deze reparatie voegt geen automatische retry of betaalde agentrun toe.

Validatie: servertests op één RPC, geldige/ongeldige resultaten, ontbrekende context, checklistlengte en defaults. PGlite voert beide echte migraties uit. Getest: volledige en minimale bundel, terugrol bij toewijzings-/checklist-/relatiefout, stil overgeslagen inserts voor alle onderdelen, geweigerde relatiepolicy, verkeerde organisatie, ongeldige kandidaat/project/context en ingetrokken lidmaatschap. Ook auditinserts rollen terug.

Uitrol: merge, DEV-imagebouw, migratie `20261006192630_atomic_task_create` op Cloud DEV, daarna direct deployment. De vorige migratie `20261006185257_atomic_task_assignment` moet aanwezig zijn. De nieuwe migratie wijzigt geen bestaande data of policies. De oude app gebruikt tot deployment nog losse writes.

Na deployment: TESTFIXTURE — NIET PUBLICEREN aanmaken met checklist, eigen verantwoordelijke en dossiercontext; alle onderdelen teruglezen. Testtaak en eventueel testdossier daarna herstelbaar verwijderen. Andere rollen en live foutinjectie zijn niet automatisch bewezen door de lokale tests. Live migratie en deployment zijn nog niet uitgevoerd.
