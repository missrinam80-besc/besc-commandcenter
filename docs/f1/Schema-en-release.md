# F1 schema, migraties en release

Actuele bouwstatus en afwijkingen ten opzichte van het voorbereide contract: [implementatie en testbewijs](Implementatie-en-testbewijs.md). Dit document bewaart ook voorstellen en de afzonderlijke voorwaarden voor DEV/F2.


[F1-overzicht](README.md). Hieronder staan ontwerpeenheden, geen uitvoerbare SQL of vooraf aangemaakte migratieversies. Er is in deze voorbereiding geen database gewijzigd.

## 1 Model- en migratie-eenheden

| Eenheid | Hergebruik | Voorgestelde toevoeging | Kritieke invariant / terugvalgrens |
| --- | --- | --- | --- |
| M01 identiteit | `association_members`, `community_people`, `governance_mandates`, accountcontactfuncties. | `community_person_id`; append-only `association_identity_verifications`; smalle actuele bevoegdheidshelper. | Composiete organisatiebinding, unieke actuele koppeling, exact geverifieerd account; accountwijziging trekt geldigheid in. Geen automatisch voorzitterschap. |
| M02 governance | `compliance_deadlines`, `meetings`, `administrative_documents`, `document_registry`, taken en audit. | `governance_evidence_versions`, `governance_reviews`, `governance_decisions`; minimale besluiten-/bronrevisiegegevens; optionele deadline met expliciete onbekend-status; bronautorisatie. | Geen bewezen afronding zonder actuele versie/bewijs/bevoegdheid. Oude administratieve status blijft oude betekenis. Geen fysiek verlies van gerefereerde historie. |
| M03 toestemming | `community_people` en actuele sessie-/organisatietoegang. | `processing_purposes`, `consent_records`, `consent_withdrawals`; beperkte eigen-/registratie-/intrekkingsoperaties. | Doel en tekstversie exact; eigen actor; intrekking blokkeert toekomstig gebruik zonder ander doel te raken. |
| M04 partners | `partners`, `record_relationships`, `campaigns`, aanmaak-RPC's, rapporten en portal. | `partner_roles`; expliciete relatiebijdrage/provenance; nieuwe compatibele campagne-/relatieoperatie. | Geen sponsordefault of historische herclassificatie; nieuwe rol is geen toegangstoekenning. |
| M05 interne publicatie | Event-/contentdossier en goedkeuringswerkvoorraad. | `publication_revisions`; revisie-/hashbinding, doel-/mediarechtenreferenties, interne preview en intrekking. | Alleen expliciete publieke veldselectie; nieuwe bronrevisie erft geen goedkeuring; publieke serving/pointeractivering pas in F2. |

De uiteindelijke opsplitsing kan meerdere migraties per eenheid vragen. Namen en constraints worden bij implementatie getoetst aan de dan actuele catalogus. Geen tweede los personen-, CRM-, document- of organisatiesysteem invoeren.

## 2 Algemene modelvoorwaarden

Nieuwe tabellen hebben een stabiel UUID-ID, expliciete organisatiebinding, actor-/tijdstipvelden, revisie en statusregels waar van toepassing. Gebruik composiete FK's `(organization_id, referenced_id)` naar unieke ouders. Indexeer de daadwerkelijk gebruikte verwijzings-/autorisatie-/werkvoorraadkolommen; nieuwe FK's hebben een passende leidende index. Partiële unieke indexen begrenzen actuele records zonder historische revisies te vernietigen. Controleer queryplannen met representatieve fixtures; geen willekeurig getal over prestatieverbetering beloven.

De [veld-/constraintcontracten](Datacontracten.md) preciseren iedere eenheid. Nieuwe `due_date`-semantiek migreert bekende datums hoogstens naar aangeleverd, nooit automatisch juridisch geverifieerd.

Status, actor en versievelden die bewijs betekenen zijn niet algemeen schrijfbaar. Appcapabilities en RLS hebben dezelfde concrete grenzen, inclusief custom profielen. Nieuwe public-/authenticated-grants zijn minimaal en expliciet; trek onbedoelde nieuwe platformdefaults in de betreffende migratie in. Een extra permissieve policy laat een oudere brede policy bestaan: beoordeel en vervang de betrokken bestaande policies gezamenlijk.

Audit bewaart actor, handeling, doel, revisie en resultaatcorrelatie, met alleen noodzakelijke metadata. Geen tokens, privébewijsinhoud of complete persoonsgegevens in technische logs. Functionele beslissing en audit zijn één transactie. Fouten en retries geven geen vals succes; onzekere uitkomst eerst uitlezen.

## 3 Operatiecontracten voor implementatie

De namen zijn ontwerpvoorstellen, geen reeds beschikbare API:

| Operatie | Invoer naast de sessie | Uitvoer / foutcontract |
| --- | --- | --- |
| `verify_association_identity` | Lid, persoon, te controleren accountbinding, bewijsversie, verwachte revisie, request-ID. | Verificatie-ID/revisie; geen verificatie uit adminstatus of e-mailmatching. Eerste bootstrap heeft eigen begrensde onderhoudsroute. |
| `submit_governance_review` | Dossier/revisie, beoordelingsdimensie, bron-/bewijsversies, onderbouwing, request-ID. | Opgeslagen beoordeling; positieve formele stap alleen door actuele bevoegde actor. |
| `decide_governance_execution` | Dossier/revisie, review-ID's, bewijsversies, beslissing/toelichting, request-ID. | Beslissing en actuele projectie; weigering schrijft geen positieve deelstatus. |
| `record_consent` / `withdraw_consent` | Exact doel-/tekstversie, scope of verklaring-ID, request-ID; bij externe registratie expliciete bewijsbron. | Eigen of bevoegd geregistreerd record; intrekking is idempotent en blokkeert afhankelijke verwerking. |
| `save_partner_roles` / nieuwe campagneoperatie | Partner-ID, gekozen rollen/bijdrage, geldigheid, verwachte revisie, request-ID. | Atomair opgeslagen relatie; ontbrekende bijdrage is validatiefout. |
| `submit_publication_revision` / `review_publication_revision` / `withdraw_publication_revision` | Brondossier/revisie, intern publieke payloadvoorstel, verwachte revisie en request-ID. | Strikt gevalideerde interne revisie; goedkeuring exact voor hash; geen actieve publieke route in F1. |

Actor en organisatie worden server-side bepaald en database-side bevestigd. Geen `actor_id` uit een botpayload accepteren als menselijke sessie. Technische foutcategorieën ter implementatie: `not_authorized`, `not_available`, `revision_conflict`, `invalid_input`, `evidence_unavailable`, `mandate_not_current`, `purpose_not_current`. De gebruikersmelding is helder en bevat geen vreemde-organisatie-inhoud. Een HTTP-adapter kan 401/403/404/409/422 gebruiken; een serveraction vertaalt dezelfde domeinfout naar veilige feedback.

## 4 Alle schrijfpaden meenemen

Voor elke eenheid hoort bij de migratiereview een tabel met appactie, directe tabelrechten, RLS, RPC, trigger, generieke editor, exports/zoekprojectie en achtergrondclient. Voor de generieke editor worden TypeScript-catalogus, gegenereerd schema en SQL-catalogus gezamenlijk opnieuw gegenereerd en gecontroleerd. Geen historische SQL-file wijzigen om de catalogus in een nieuwe omgeving te laten verschillen.

Nieuwe governance-/publicatiegoedkeuringen komen niet onder de bestaande brede algemene reviewerregel. `approval_requests` heeft nu algemene ledeninzage en managerupdate; nieuwe vertrouwelijke typen vragen gerichte lees-/beslisguards plus transactionele bronupdates. Houd bestaande financiële, e-mail- en nieuwsbriefregels intact. Het apart wijzigen van alleen de entity-type-enum is onvoldoende.

## 5 Voorbereiding en migratie op DEV

1. Begin iedere implementatie vanaf een vastgelegde actuele maincommit. Herbevestig Cloud DEV `sjvzrsmrtcxxtmaxigtn`; databasehost, CC-server en botserver zijn afzonderlijke doelen.
2. Maak de migratiebestanden met de officiële CLI-generator, bouw en replay op een lege geïsoleerde PostgreSQL 17-fixture en voer zowel rol-/negatieve als concurrencytests uit. Fixtures voor Auth/Storage/Vault zijn geen live dienstacceptatie.
3. Controleer verse alleenlezende schema-/history-/gegevensvoorwaarden. De baseline na F0 is **118 historische bestanden, 117 registraties en de bewuste seed-uitzondering**. Nieuwe bestanden/registraties tellen daar per release bovenop. Geen controle die opnieuw 84 eist voor F1.
4. Neem een recente beschermde handmatige database/configuratieback-up en registerexport. Leg vast of gewijzigde private opslag/bewijsinhoud afzonderlijk moet worden meegenomen. Geen automatische scheduler instellen. Off-server/herstelbewijs blijft een eigen voorwaarde, geen gevolg van alleen een dump.
5. Laat per wijzigingsset exacte SQL, bronhashes, gegevensimpact, minimale grants, rolloutcompatibiliteit en terugval beoordelen. Vraag de concrete uitvoeringsopdracht vóór Cloud-migratie/deploy; voorbereiding geeft die niet.
6. Zolang de seed niet expliciet is afgehandeld: **geen brede `db push`, `migration up --include-all`, reset, squash of repair-all**. De beoordeelde nieuwe versies krijgen een expliciete toestemmingslijst. Gebruik een vooraf geteste transactie-uitvoerder voor uitsluitend die bestanden en registreer de werkelijk uitgevoerde versies exact eenmaal via de goedgekeurde migratie-/repairprocedure. Geen backdated fictieve versie voor de seed toevoegen.
7. Pas iedere eenheid atomair of met vooraf geaccepteerde compatibiliteitsstappen toe. Audit-/identiteits-/bewijsrecords worden niet alvast als geldig aangemaakt door een migrationseed. Geen live fixture vullen zonder aparte toestemming.
8. Controleer bronhash, exacte nieuwe historieregels, oude registraties, schema-/grantverschillen en betrokken gegevensvoorwaarden. De seed blijft afwezig. Bij een fout/onzekere verbinding eerst status uitlezen; niet blind opnieuw uitvoeren.
9. Deploy daarna alleen de bijbehorende CC-webimage op **BESCSRVDEV**, map `/opt/besc-dev/command-center`. Botserver **BESCSRVDEV-02** wordt niet gewijzigd. Verifieer image, health, accountkoppelingen en de uitgeschakelde earning/preview/intake/slotkeuze.
10. Voer de gerichte [DEV-proeven](Acceptatie.md) uit en leg menselijke acceptatie vast. Alleen daarna krijgt die eenheid de status op DEV geaccepteerd.

Het bestaande lokale F0-herstelpakket is een eenmalig uitvoeringsbewijs, geen generiek F1-migratiescript. Het bevat vaste 84/117-aannames en mag niet opnieuw gebruikt worden voor nieuwe migraties.

## 6 Terugval en blokkering

Additieve objecten blijven bij appterugval behouden. Nieuwe gevoelige mutaties worden gestopt of blijven geweigerd; oude appcode mag de nieuwe controle niet kunnen omzeilen. Bij incompatibiliteit met de oude UI: onderhouds-/foutweergave voor alleen die handeling, of forward-fix. Een vorige image terugzetten is pas veilig als de bijbehorende oude schrijfpaden zijn getest tegen het nieuwe schema.

Geen productiegegevens, audit, reviews of toestemming verwijderen als ‘rollback’. Een destructieve inverse migratie vraagt aparte beoordeling en een bewezen herstelprocedure. Intrekkingen worden nooit teruggedraaid om een release gemakkelijker te maken. Bij fout in publicatievoorbereiding blijven revisies intern en ingetrokken; F1 heeft geen publieke cache te herstellen.

Houd per release commit, migratienamen/hashes, before/after, image-ID, autorisatiebewijs, testresultaten, open punten en eventuele terugval vast. Geen back-ups, sleutels, volledige Cloud-catalogi of persoonsrijen in Git.

## Technische referenties

Officiële documentatie gecontroleerd op 21 oktober 2026: [Supabase RLS en policies](https://supabase.com/docs/guides/database/postgres/row-level-security), [databasefuncties, security-mode en execute-rechten](https://supabase.com/docs/guides/database/functions), [migratiebestanden genereren](https://supabase.com/docs/reference/cli/supabase-migration-new). Deze bronnen ondersteunen de technische aanpak; BESC-bevoegdheden, privacygrondslagen en wettelijke termijnen volgen daar niet automatisch uit.
