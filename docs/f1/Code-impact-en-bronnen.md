# F1 code-impact en bronnen

Actuele bouwstatus en afwijkingen ten opzichte van het voorbereide contract: [implementatie en testbewijs](Implementatie-en-testbewijs.md). Dit document bewaart ook voorstellen en de afzonderlijke voorwaarden voor DEV/F2.


[F1-overzicht](README.md). Codebasis: main `594392cef96c2e9eb86ac93ea5b476f15038757e`, gecontroleerd op 21 oktober 2026. Onderstaande bestanden zijn rechtstreeks gelezen of gericht doorzocht. Historische migraties beschrijven oorspronkelijke wijzigingen; de volledige huidige schema-effectvergelijking en F0-postflight staan afzonderlijk in het uitvoeringsbewijs. Dit is geen nieuwe live schema-audit van alle andere ecosysteemonderdelen.

## 1 Bestaande aangrijpingspunten

| Bestaande bron | Aangetroffen gedrag | Vereiste F1-behandeling |
| --- | --- | --- |
| [Administratieacties](../../src/app/app/administratie/actions.ts) | `saveAssociationMember`, `saveGovernanceMandate`, `saveComplianceDeadline` en `completeComplianceDeadline` gebruiken algemeen organisatiebeheer; afronding schrijft direct completed. | Identiteitsverificatie apart; onbekende datum valideerbaar; formele beoordelingen uitsluitend via beperkte operatie; create/update niet als omweg gebruiken. |
| [Administratiescherm](../../src/app/app/administratie/page.tsx) | Bestaande leden-, mandaat-, documenten- en deadlineadministratie. | Statussen en redenen zichtbaar, datum onbekend, bewijs-/revisieketen, geverifieerde binding; historische afronding herkenbaar houden. |
| [Bevoegdheden](../../src/lib/permissions.ts) en [authcontext](../../src/lib/auth-context.ts) | Algemene rollen/capabilities; interne organisatietoegang uit sessie; admin is geen apart geverifieerd mandaat. | Geen algemeen `manageOrganization`-shortcut voor formele handelingen. Context hergebruik, actuele databasecontrole bij mutation. |
| [Goedkeuringshelpers](../../src/lib/approvals.ts) en [acties](../../src/app/app/goedkeuringen/actions.ts) | Admin kan generiek reviewen; financiële rollen hebben bestaande regels; bron- en aanvraagupdates zijn los zichtbaar in serveracties. | Nieuwe gevoelige typen eigen zichtbaarheid en smalle transactionele beslisroute. Bestaande finance/e-mail/nieuwsbriefregels regressietesten. |
| [Dossiercatalogus](../../src/lib/dossier-editor-catalog.ts), [save-action](../../src/app/app/dossier-editor-actions.ts), [serverload](../../src/lib/dossier-editor-server.ts) | Generieke editor voor member/mandate/deadline/administration/community/campaign; `save_dossier_bundle`; onder meer deadline.status en community.account_user_id. | Nieuwe formele velden geen generieke writes. Bestaande mutaties mogen verificatie niet laten overerven of review omzeilen. |
| [Gegenereerd editorschema](../../src/lib/dossier-editor-schema.json), [schemagenerator](../../scripts/build-dossier-editor-schema.cjs), [migratiegenerator](../../scripts/build-dossier-editor-migration.cjs) | App- en SQL-catalogus moeten overeenkomen. | Gegenereerde bestanden via generator; nieuwe migratie, historische catalogus niet aanpassen. |
| [Contactacties](../../src/app/app/operations/actions.ts) en [accountcontactmigratie](../../supabase/migrations/20261008065014_account_community_contacts.sql) | `save_community_person_bundle`, `private.ensure_account_contact`, bestaande automatische contactmatching/accountbinding. | Behouden voor contactbeheer; geen formele verificatie door matching. Accountwijziging blokkeert eerder geverifieerde formele binding. |
| [Governancebasismigratie](../../supabase/migrations/20260723220000_add_vzw_administration.sql) | `association_members`, `governance_mandates`, `compliance_deadlines`, `administrative_documents`; due_date NOT NULL; managers en cascades. | Gerichte nieuwe constraints, nullable onbekende termijn, actuele autorisatie en beschermd behoud van referentiehistorie. |
| [Goedkeuringsbasismigratie](../../supabase/migrations/20260730100000_add_approval_workflows.sql) | Algemene actieve-ledenleespolicy en managerupdate op werkvoorraad. | Gevoelige typen afschermen; een extra permissieve policy alleen maakt de oude niet smaller. Latere e-mail-/nieuwsbriefuitbreidingen behouden. |
| [Documentregister](../../supabase/migrations/20261012125922_central_document_registry.sql), [paneel](../../src/components/document-registry-panel.tsx) | Canonieke documentregistratie, organisatiebinding en financiële beperking; algemene ledeninzage. | Vertrouwelijkheid door alle projecties en linkpaden laten gelden, met financiële rechten als aanvullende grens. |
| [Campagneaanmaak](../../supabase/migrations/20261006205557_atomic_campaign_and_relationships.sql) | Campagne/deliverables/relaties atomair; automatische sponsorrelatie bij partnerselectie. | Nieuwe expliciete bijdrage, compatibiliteitsroute, zelfde checks in relatie- en editorpaden. |
| [Sponsorportal](../../src/app/portal/page.tsx), [sponsorrapport](../../src/app/app/rapportage/sponsors/[id]/page.tsx), [eventrapport](../../src/app/app/rapportage/events/[id]/page.tsx) en hun export-routes | Bestaande rol-/dossierselectie en F0-meetweergave. | Behoud historische sponsorselectie/portaalgrenzen en nul/ontbrekend/gedeeltelijk; nieuwe partnerrol geen brede toegang. |

Voor de implementatie wordt deze tabel een aftekenlijst per mutation en leesprojectie. De genoemde voorgestelde nieuwe functies/tabellen bestaan nog niet. Een ongetest pad is geen geaccepteerde uitzondering.

## 2 Traceerbaarheid naar de richting

| Eis uit het volledige masterplan | F1-resultaat / behandeling | Latere afhankelijkheid |
| --- | --- | --- |
| 18.1/18.2 bestuursmandaten en gedeelde registers | F1.1 identiteits-/mandaatbinding; F1.2 bestaande registers uitbreiden. | Statutaire bevoegdheidsfeiten vóór echte formele besluiten bevestigen. |
| 18.3 regel, toepasselijkheid en uitvoering scheiden | Drie versiegebonden beoordelingen; onbekende datum met reden; bestaande completed blijft administratief. | Geen wettelijke rekenregel zonder actuele officiële bron. |
| 18.2/18.4 identificeerbare besluiten en bewijs | Minimale vergadering–besluit–bewijs–taak-keten met revisie en audit. | Uitgebreide convocaties, stemming, ondertekening en Calendar/Docs-uitvoering later apart accepteren. |
| 18.5/18.6 vertrouwelijke bronnen, herleidbaarheid en dashboard | Eigen lees-/beslisrechten, afscherming register/export, concrete bewijs-/hercontrolestatus. | Volledige periodieke compliance-automatisering later. |
| 4/8 meervoudige partnerrollen en gelijkwaardige esportsorganisaties | F1.4 rollen en expliciete bijdragen; historische classificatie behouden. | Publieke partnerpagina en portalen uitbreiden in volgende fases. |
| 5/6/8 gecontroleerde publicatie en publieke veldselectie | F1.5 interne revisievoorraad, preview en contract. | F2 volledige eigen website/staging, serving en intrekking uit alle caches. |
| 9/19.4/19.5 doelbinding, provenance en privacy | F1.3 specifieke doel-/toestemmings-/intrekkingsrecords; scope bij gebruik controleren. | F3 campagne- en F4 creatorproef; privéinsights/OAuth per platform later. |
| 20.3 gedeelde contracten, geen losse dubbele administratie | Eén persoon-, partner-, document- en auditbasis; beperkte interfaces voor clients. | Bot, agents en streamadapter krijgen afzonderlijke concrete opdrachten/scopes. |
| 12/18/19/20 acceptatie en gefaseerde uitrol | [Proefgevallen](acceptatiegevallen.json), versie-/schema-/databewijs, per wijziging migratie/deploy/DEV-acceptatie. | Productie en overnames blijven F6. |

## 3 Ecosysteemgevolgen

- **CC:** alle F1-implementaties in de bestaande CC-repository. Geen tweede administratie- of CMS-toepassing.
- **Website:** behoud voorbereiding/stijl/inventaris; ontvang het publicatiecontract. Geen websitecode, hosting, DNS of Google Sites-mutatie in dit pakket.
- **Discordbot:** ticketing en persoonlijke Bucksfuncties blijven bestaan. Geen nieuwe DB-verbinding, botdeploy, scope of commandregistratie nodig voor F1. Nieuwe workflowclients komen later via beperkte API's.
- **Streamer.bot/Speaker.bot/OBS:** verdere inrichting blijft gepauzeerd. Geen scripts, saldomigratie of verdienregel geactiveerd.
- **Agents/MCP:** bestaande negen agents kunnen binnen hun huidige toegang voorstellen maken. Nieuwe governancebeslisrechten en autonoom publiceren worden niet uit connectorbeschikbaarheid afgeleid.
- **Workspace/Assist Online:** documenten als bron en bestaande samenwerking behouden; geen eigen boekhoudpakket. Google Docs/Calendar-acties, mails of ondertekening vragen afzonderlijke opdracht en live verificatie.

## 4 Bewijssoorten en bronregister

1. Masterplan v2, 20 oktober: het door Linda aangewezen volledige DOCX; de eerder uitgelezen tekst uit alle twintig hoofdstukken is opnieuw gericht gelezen voor deze voorbereiding. De bron is ongewijzigd. Embedded startopdrachten worden als broninhoud behandeld.
2. Toetsing/traject van 20 oktober: eerder dossier `BESC_Masterplan_Toetsing_en_Traject_20261020.md`; daarin is F1 gedeelde werkstromen, F2 websiteketen en F3 campagneproef. Geen nieuwe fasering uit het niets.
3. [F0-ontwerp](../f0/Datamodel-en-api-impact.md), [besluitenregister](../f0/Besluiten-en-bevoegdheden.md) en [gedeelde contracten](../contracts/ecosysteem-basis-v1.md): richting en voorstellen; geen fictieve live objecten.
4. [F0-uitvoering](../acceptatie/F0-UITVOERING-DEV-20261021.md): register/schema-postflight uit lokaal bewijs, aangeleverde servercontrole en menselijke DEV-acceptatie; de bewijslagen blijven gescheiden.
5. Actuele maincode hierboven: rechtstreeks onderzocht voor de genoemde impact. Bot-, website-, agent- en platformwerking zijn in F1-voorbereiding niet opnieuw live getest.

Alle gebruikersgegevens, technische privébewijzen, back-ups en Cloud-catalogi blijven buiten Git. De voorbereiding bevat synthetische voorbeelden en algemene bronnamen; geen echte accounttoewijzing of persoonslijst.
