# Veilige taakwijzigingen en toewijzing

> Historische notitie. Dit document bewaart het ontwerp of de controle op de genoemde datum; het is geen actuele werkvoorraad. Zie de [wiki](../README.md) en [huidige releasewerkwijze](../Release-en-acceptatie.md).

Een wijziging van verantwoordelijke verloopt via `replace_task_assignee` in één Postgres-transactie. De zichtbare, actieve taak wordt vergrendeld en moet in de gekozen organisatie zitten. De kandidaat moet zichtbaar en actief lid zijn van dezelfde organisatie. De bestaande RLS blijft gelden; de functie gebruikt SECURITY INVOKER en is alleen uitvoerbaar voor authenticated. Een fout bij verwijderen of toevoegen draait de volledige vervanging terug, ook bij nul gewijzigde rijen. Bewust leegmaken is toegestaan voor een toegankelijke taak.

De server registreert activiteit en stuurt een toewijzingsmelding pas na bevestiging van de taak-ID. Taakdetails, status en herstelbaar verwijderen gebruiken organisatie/deleted_at-filters en vereisen een daadwerkelijk teruggegeven rij voordat succes wordt gemeld. Opgeslagen projectrelaties blijven behouden.

Geen ruimere leesrechten of rollen toegevoegd. De bestaande beperkte zichtbaarheid van kandidaatleden blijft gelden. Dit herstelt de bestaande bewerk-/toewijs-/verwijderroutes; het aanmaken van taken met meerdere bijkomende records is een afzonderlijke flow en wordt hier niet herontworpen.

Validatie: serveracties met databasefout en nul gewijzigde rijen, plus echte PGlite-migratie en Postgres-transacties. Getest: rollback bij insertfout, geweigerde delete, verkeerde organisatie, inactieve kandidaat, verwijderde taak, ingetrokken lidmaatschap, vervangen/leegmaken en functieprivileges. Live DEV-acceptatie blijft apart.

Uitrol: na merge/imagebouw eerst migratie `20261006185257_atomic_task_assignment` op Cloud DEV, daarna de nieuwe image deployen. De migratie is aanvullend en wijzigt geen bestaande data of policies. De oude app blijft tijdens die korte overgang zijn oude toewijsroute gebruiken; plan migratie en deployment direct na elkaar. Daarna TESTFIXTURE — NIET PUBLICEREN met toewijzen, vervangen en leegmaken; testdata herstelbaar opruimen.

Er is geen betaalde agentrun toegevoegd. Live migratie en deployment zijn nog niet uitgevoerd.
