# Campagneaanmaak, linkfeedback en dossierkoppelingen — DEV

> Historische notitie. Dit document bewaart het ontwerp of de controle op de genoemde datum; het is geen actuele werkvoorraad. Zie de [wiki](../README.md) en [huidige releasewerkwijze](../Release-en-acceptatie.md).

## Releasevolgorde

1. Review en merge de PR; wacht op de geslaagde GitHub DEV-imagebouw.
2. Pas `20261006205557_atomic_campaign_and_relationships.sql` toe op Cloud DEV (`sjvzrsmrtcxxtmaxigtn`) en registreer de migratie.
3. Controleer functies, triggers en behoud van bestaand RLS-beleid. Deploy de image met het bestaande DEV-script via Termius.
4. Voer de live proeven hieronder uit. Gebruik uitsluitend `TESTFIXTURE — NIET PUBLICEREN`-wegwerpdata en ruim deze via softdelete op.

Deze PR voert geen Cloud-migratie, merge, deploy, echte-data-invoer of betaalde agentrun uit. De oude app blijft bruikbaar na de migratie; ook haar relatie-inserts worden door de trigger beschermd. De nieuwe app vereist `create_campaign_bundle` voor campagneaanmaak en meldt een opslagfout als de functie ontbreekt.

## Wijzigingen en grenzen

- `create_campaign_bundle(uuid,jsonb,text[])` slaat campagne, sjabloononderdelen en de gekozen project-/event-/partnerrelaties in één transactie op. Geen handmatige verwijdering als compensatie. Fouten en stil overgeslagen writes rollen de volledige opdracht terug.
- Bestaande sjablonen, eigen briefing, kanalen, resultatenvelden en veilige terugkeer naar project/event blijven behouden. Niet-ingevulde budget/waarde blijven null; een expliciete nul blijft nul. Servervelden komen uit de ingelogde gebruiker en organisatie.
- Wijzigen/verwijderen van een dossierlink, ontkoppelen van een relatie en verwijderen van een documentkoppeling vereisen de teruggegeven bedoelde rij. Een ontbrekende rij levert een fout op in plaats van succes. Organisatie-, dossier-, endpoint- en documenttypefilters blijven staan.
- Een invoker-trigger controleert relatie-inserts en updates van endpoints voor de zeven dossier-UI-types: project, event, campagne, content, partner, communitypersoon en taak. Andere historische entity-types behouden hun bestaande gedrag.
- Beide endpoints krijgen transactionele advisory locks, in vaste type/id-volgorde. Softdelete, herstel en fysieke delete van de zeven dossiertabellen gebruiken dezelfde locks. De zichtbaarheidstest gebeurt na het verkrijgen van de lock, met bestaande SELECT/RLS-rechten; de gebruiker krijgt geen aanvullende schrijfrechten op het doeldossier.
- Relatiewrites vereisen READ COMMITTED (de gebruikelijke API-isolatie). REPEATABLE READ en SERIALIZABLE worden afgewezen om controles vanuit een oude snapshot te voorkomen. Een lockconflict wacht; een eventueel deadlock breekt de hele transactie af en de app toont een fout.
- Wint de relatie-insert eerst, dan was de relatie bij opslag geldig; een latere dossierverwijdering verbergt haar in de werkweergave. Wint de verwijdering eerst, dan wordt de insert na het wachten afgewezen. Historische relaties worden niet opgeschoond of herschreven.

## Lokale verificatie

De PostgreSQL-proef gebruikt de werkelijke campagne-, deliverable- en relatietabeldefinities. Zij controleert rollback bij exceptions, stil overgeslagen inserts en geweigerde RLS-writes; daarnaast budget/waarde, contextorganisatie, verwijderde context en alle zeven endpoint-types. De migratie behoudt het bestaande beleid. De advisory lock en vrijgave bij rollback worden daadwerkelijk gecontroleerd. Actionproeven toetsen één campagne-RPC, sjabloonbehoud, terugkeerroute en no-row/wrong-row/error-feedback.

PGlite heeft één databasebackend. Deze lokale proef bewijst geen gelijktijdige uitvoering door twee onafhankelijke PostgreSQL-sessies. De onderstaande concurrentieproef blijft daarom expliciet open voor DEV na migratie; zij mag niet als geslaagd worden afgevinkt op basis van alleen de lokale suite.

## Databasecontrole vóór deploy

- Publieke campagnefunctie: SECURITY INVOKER, lege search_path, EXECUTE voor authenticated; geen PUBLIC-/anon-toegang.
- Drie private functies: SECURITY INVOKER en lege search_path; geen PUBLIC-/anon-toegang. De lockhelper is beschikbaar voor authenticated en service_role, zonder nieuwe tabelrechten.
- Eén relatieguard-trigger en zeven dossierverwijderings-triggers aanwezig en actief.
- RLS blijft ingeschakeld en alle eerdere policies blijven identiek. Bestaande dossiers, links en relaties blijven behouden.
- Een ongeautoriseerde campagneaanroep faalt zonder dataverandering.

## Live acceptatie

- Maak een campagne met sjabloon en uitsluitend tijdelijke project-/event-/partnercontext. Lees campagne, sjabloononderdelen en relaties terug. Test ook zonder sjabloon, met eigen briefing en expliciete nul versus ontbrekende budgetwaarde.
- Wijzig een tijdelijke dossierlink; lees haar terug. Verwijder de link in een tweede tab; opslaan of nogmaals verwijderen vanuit de oude tab moet een fout geven. Herhaal de stale-formproef voor een relatie en documentkoppeling waar de integratie al beschikbaar is.
- Koppel actieve tijdelijke dossiers; verwijder het doel vanuit een tweede tab en verstuur de oude keuze. Verwacht afwijzing. Controleer ook een inmiddels verwijderd brondossier.
- Ruim testdossiers via softdelete op. Geen echte dossiers verwijderen en geen nieuwe externe berichten/publicaties maken.
- Herhaal relevante gevallen met overige gebruikersrollen; een beheerderproef bewijst hun rechten niet.

## Concurrentieproef met twee DEV-databasesessies

Gebruik twee onafhankelijke sessies, dezelfde testorganisatie en uitsluitend tijdelijke dossiers. Zorg dat beide sessies passende bestaande rollen hebben. Stel een begrensde lock-/statement-timeout in zodat een proef geen langdurige blokkade achterlaat.

1. Sessie A: BEGIN; softdelete het tijdelijke doel zonder te committen. Sessie B: probeer een relatie-insert. Zij moet wachten. COMMIT in A; B moet daarna afwijzen wegens onbeschikbaar dossier. Controleer dat geen nieuwe relatie is opgeslagen.
2. Herstel het tijdelijke doel. A: BEGIN; voeg een relatie toe zonder commit. B: softdelete het doel. Zij moet wachten. COMMIT in A; B mag daarna de verwijdering afronden. De relatie blijft historische data en wordt niet zichtbaar in de werkweergave.
3. Herhaal met een verwijderde bron en met omgekeerde endpointvolgorde; controleer dat locks na commit/rollback zijn vrijgegeven. Rollback/ruim proefdata op.

Voer deze proef na de migratie uit; openstaande acceptatie is geen bewijs van een nog aanwezige bug, maar een expliciet verificatiepunt.
