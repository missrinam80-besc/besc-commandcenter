# Communityrollen en dossierkoppelingen — DEV

> Historische notitie. Dit document bewaart het ontwerp of de controle op de genoemde datum; het is geen actuele werkvoorraad. Zie de [wiki](../README.md) en [huidige releasewerkwijze](../Release-en-acceptatie.md).

## Volgorde

1. Merge de PR; wacht op de geslaagde DEV-imagebouw.
2. Pas `20261006202835_atomic_community_person_roles.sql` toe op Cloud Supabase DEV en registreer de migratie.
3. Controleer de functie, daarna deploy via het bestaande DEV-script.
4. Doorloop de onderstaande acceptatieproef met wegwerpdata.

De migratie voegt alleen `public.save_community_person_bundle(uuid,jsonb,text[],uuid)` toe. Er zijn geen gegevensupdates of wijzigingen aan bestaand RLS-beleid. De nieuwe app heeft deze functie nodig voor community-aanmaak en -bewerking; bij een ontbrekende functie meldt zij een opslagfout. De oude app blijft bruikbaar na de migratie.

## Databasecontrole

Controleer dat de functie SECURITY INVOKER gebruikt, een lege search_path heeft en alleen `authenticated` uitvoerrechten krijgt (niet PUBLIC of anon). Bestaande managerrechten en tabelbeleid blijven vereist. Een aanroep met een ontbrekend of verwijderd profiel of een verkeerde organisatie moet mislukken zonder gegevenswijziging.

De lokale Postgres-proef controleert gezamenlijke rollback bij mislukte of stil overgeslagen rollenopslag, geweigerde verwijdering van oude rollen en geweigerde profielwijziging. Zij controleert ook deduplicatie, bewust leegmaken, accountorganisatie en behoud van aangrenzende profielvelden.

## Live acceptatie

- Maak een `TESTFIXTURE — NIET PUBLICEREN`-communityprofiel met twee rollen.
- Bewerk naam en rollen; lees beide terug. Maak de rollen bewust leeg en lees dit terug.
- Open een tweede formulier, verwijder het testprofiel via de normale beheeractie en probeer het oude formulier op te slaan. Verwacht afwijzing en geen nieuw profiel.
- Koppel twee actieve testdossiers. Open daarna een tweede koppelformulier, verwijder het doeldossier en verstuur de oude keuze. Verwacht afwijzing zonder nieuwe relatie.
- Ruim alle testdossiers via softdelete op. Bestaande historische relaties blijven opgeslagen.

De koppelcontrole betreft de beschikbare dossiers op het moment van de servercontrole. Zij is geen nieuwe databaseconstraint of transactionele garantie tegen een gelijktijdige verwijdering tussen controle en insert. Deze PR voegt geen betaalde agentrun toe.
