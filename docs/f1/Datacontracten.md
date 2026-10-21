# F1 datacontracten voor de implementatie

[F1-overzicht](README.md). Logisch veld-/constraintcontract, **geen huidige schemaweergave of uitvoerbare migratie**. Definitieve SQL wordt per eenheid gegenereerd, gereviewd en tegen de actuele Cloud-catalogus getoetst. Bestaande bronvelden blijven behouden.

## Gemeenschappelijk

Nieuwe records gebruiken `id uuid`, `organization_id uuid`, servermatige actor/tijdstip en een expliciete bron-/doelverwijzing. Alle nieuwe ID-verwijzingen moeten dezelfde organisatie bewijzen. Polymorfe verwijzingen krijgen een vaste toegestane bronlijst plus databaseguard; een vrije `source_type/source_id` zonder referentiecontrole is onvoldoende.

Mutatieoperaties krijgen `request_id` en `expected_revision`. Gebruik de bestaande request-/auditvoorziening waar die aantoonbaar dezelfde garanties biedt; anders een smalle operatieontvangst met `(organization_id, actor_id, operation, request_id)` uniek, canonieke payloadhash en vaste uitkomst. Dit is geen hergebruik van rewardsontvangsten voor governance. Persoons-/bewijsinhoud komt niet in technische foutlogs.

Gebruik een monotone databasebeheerde bronrevisie voor beschermde bronvelden. Alleen `updated_at` uit de browser of een appcache is onvoldoende. Iedere relevante server-, editor-, RPC- en directe mutation verhoogt de revisie; de caller kan haar niet zelf kiezen. Welke velden relevant zijn, wordt per brontype vastgelegd. Een bronwijziging verwijdert geen oude snapshot.

## M01: binding en mandaat

| Onderdeel | Minimale velden | Constraints / toegang |
| --- | --- | --- |
| Uitbreiding `association_members` | `community_person_id uuid null`, beheerde bindingsrevisie. | Optionele referentie naar organisatie-eigen actieve persoon; unieke niet-verwijderde actuele koppeling. Geen migratiebackfill uit email/naam. |
| `association_identity_verifications` | Lid-ID, persoon-ID, exact `verified_account_user_id`, bindingsrevisie, verificatiegrond/bewijsversie, controleur, gecontroleerd op, geldigheid, ingetrokken op/reden. | Alle drie bronrelaties gecontroleerd; maar één actuele verificatie voor dezelfde binding. Activeren/intrekken via beperkte operatie; geen algemene UPDATE. |
| Bestaand `governance_mandates` | Bestaande member/role/status/start/end/benoemingsbron; nieuwe bronrevisie en eventueel beoordeelde benoemingsbewijsversie. | Geen nieuwe chair-rij uit appadminstatus. Actuele binding én status/datum én bevoegdheidsgrond vereist. Referentiehistorie niet cascade-wissen. |

De persoon kan later van account veranderen; dit verandert de bewaarde `verified_account_user_id` niet. De actuele vergelijking faalt totdat opnieuw expliciet is geverifieerd.

## M02: regel, bewijs, reviews en beslissingen

| Onderdeel | Minimale velden | Constraints / betekenis |
| --- | --- | --- |
| Uitbreiding `compliance_deadlines` | Bestaande dossier/statusvelden; `due_date` optioneel, `deadline_basis_status` (`unknown`,`provided`,`verified`), onbekend-reden, bron-/trigger-/berekeningsreferentie en bronrevisie. | Onbekend zonder datum en met reden; verified alleen met gecontroleerde onderbouwing. Bestaande waarden migreren naar provided, niet verified. Bestaand completed is administratief. |
| `governance_evidence_versions` | Registerdocument-ID; bronversie of bewaarde vastlegging-ID; bewijssoort; ontvangst-/vastleggingstijd; bronreferentie; eventuele SHA256; beschikbaarheids-/intrekkingsstatus; vertrouwelijkheid; vervangt-versie. | Registerdocument geen tweede kopie van bronadministratie. Een concrete versie/vastlegging verplicht voor beoordeeld bewijs; hash alleen is niet genoeg. Intrekking append-only of beschermd levenslooprecord, inhoud onveranderlijk. |
| `governance_reviews` | Brontype/-ID/-revisie; dimensie regel/toepasselijkheid/uitvoering; beoordelingswaarde; grond-/bewijsversionrefs; actor, actuele mandaats-/verificatiereferentie en tijdstip. | Eén beoordeling beschrijft één dimensie en revisie. Nieuwe beoordeling vervangt het actuele oordeel, niet het historische record. Positieve formele waarde vereist passende actor. |
| `governance_decisions` | Besluitsoort (`meeting_decision`,`execution_decision`), bron-/vergader-ID en revisie, orgaan, onderwerp/tekst of uitvoeringsuitkomst, beslisdatum, expliciete bevoegdheidsgrond, relevante review-/bewijsreferenties, actor en uitvoeringstaak. | Geen willekeurig entity-ID. Bronbesluit en uitvoeringsbeslissing hebben onderscheiden velden/constraints. Vastgelegde stemming/quorum/ondertekening waar nodig blijft expliciet bewijs, geen aanname. |
| Actuele uitvoeringsprojectie | Bron-ID/revisie, laatst geldige beslissing en actuele bewijsstatus. | Afgeleid en alleen via beschermde transactie muteerbaar. Ingetrokken bron maakt herbeoordeling zichtbaar; eerdere beslissing blijft historie. |

Een eerste echt dossier zonder bekende wettelijke gegevens kan een voorbereidings-/onderzoekstatus hebben. Het wordt niet positief afgerond door een deadline, taakstatus, algemene approval of documentlink. Een uitvoeringsbeslissing verwijst naar de relevante actuele reviews en bewijsversies; een losse nieuwe review wist geen oud besluit.

## M03: doelen en verklaringen

| Ontwerpobject | Minimale velden | Constraints / toegang |
| --- | --- | --- |
| `processing_purposes` | Doelcode, tekstversie, tekst-/scopehash, gegevenscategorieën, verwerking/ontvangers, beoordeelde grondslag, status, hercontrole en vastgestelde retentiebehandeling. | `(organization_id, purpose_code, text_version)` uniek. Onbesliste inhoud blijft draft. Bredere scope maakt nieuwe versie. |
| `consent_records` | Persoon/accountbinding, doel-/tekstversie, concrete scope, wijze van vastlegging, actor, verklaringstijd, eventuele vervaldatum, externe bewijsreferentie indien van toepassing. | Geen vrije impersonatie; append-only verklaring; externe registratie herkenbaar. Alleen passende eigen/beheerde inzage. |
| `consent_withdrawals` | Verklaring-ID, actor, tijdstip, reden optioneel, request-ID/ontvangstreferentie. | Eén effectieve intrekking per verklaring; replay veilig. Geen andere doelen wijzigen. Oude verklaring kan niet door UPDATE herleven. |

Afgeleide doel-/publicatiegeldigheid wordt in de intrekkingstransactie geblokkeerd. Een toekomstige externe invalidatie gebruikt bestaande taak/outbox waar passend; taakherhaling verandert de ingetrokken verklaring niet.

## M04: rollen en relaties

`partner_roles`: organisatie, partner, rolcode, geldigheidsdatums, status, bevestigende actor/tijd, bron-/bewijsreferentie en provenance. Unieke actuele rol per partner; geldige begin/eindvolgorde. Bron-/rolbeëindiging verwijdert historie niet.

`record_relationships` blijft de bron voor dossierkoppelingen. Expliciete bijdrage en provenance worden aan de bestaande relatie toegevoegd of via een streng gekoppelde uitbreiding bewaard; geen tweede ongesynchroniseerde relatievoorraad. Valideer typecombinatie campagne/event–partner, organisatie en actieve bron. Partnerrol is context, geen automatische bijdrage of inzagerecht.

## M05: interne publieke revisie

`publication_revisions`: organisatie, bestaand source_type/source_id/source_revision, `schema_version`, publiek type/ID, taal, slug, strikt gevalideerde payload en hash, opvolgende revisie, maker/tijd, reviewstatus en benodigde doel-/mediarechtenreferenties. Unieke bron/revisie-identiteit en beschermde canonieke hash. Interne referenties staan buiten payload.

De revisiegoedkeuring koppelt exact revision-ID en payloadhash aan actor/bevoegdheid/tijdstip; algemene contentstatus is onvoldoende. Intrekking heeft eigen beschermde actor/tijd/reden. Een F2-publicatiepointer en uitleesendpoint worden pas in F2 geactiveerd, met één geldige goedgekeurde revisie per publieke site/type/slug/taal. Twee organisaties kunnen elkaars slugs/IDs niet gebruiken om dossiers te benaderen.

## Minimale index-/grantreview per migratie

Inventariseer alle nieuwe FK's en autorisatie-joins; voeg passende leidende organisatie-/bronindices toe. Actuele bindings-/rol-/request-uniciteit is databasegedwongen. Status-/datumwerkvoorraad en actor-/bronreferenties krijgen gerichte indices; beslis op queryplan/fixture, niet op willekeurige indexaantallen.

Nieuwe gevoelige objecten beginnen zonder algemene anon-/authenticated-write of member-read. Read-/mutate-/execute-grants en RLS worden per operatie gereviewd, inclusief oude brede policies op gedeelde objecten. Intrekking of bewijsvervanging bewaart bronrelaties, audit en beslisrevisies. Retentie/pseudonimisering krijgt een eigen goedgekeurde procedure; geen ongemerkte cascade-delete op een accountverwijdering.
