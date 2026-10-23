# Fit-gap en code-impact

Onderzochte CC-hoofdbranch: `f68a0e13bfc730d0e787bf4f0cfe56603c645254`, opnieuw opgehaald op 23 oktober 2026. Dit is een codecontrole; geen actuele Cloud-inhoudsinventarisatie.

| Onderdeel | Rechtstreeks gelezen code | Beoordeling en wijzigingsvoorstel |
| --- | --- | --- |
| Campagnefiche | `src/app/app/campagnes/page.tsx`, `[id]/page.tsx`, `src/lib/dossier-editor-catalog.ts` | Bestaande generieke lijst/detail, eigenaar, kanalen, periode, project/event en deliverables hergebruiken. Voeg gerichte campagnebijdrage-/meetpanelen toe; geen tweede CRM. |
| Personen en deliverables | `20260723100000_deepen_operational_modules.sql`, dossiercatalogus | `campaign_deliverables.community_person_id` verbindt bestaand persoon, maar bewijst geen deelname/toestemming. Afzonderlijke versiegebonden deelnamestatus nodig. |
| Atomair campagnebeheer | `20261006205557_atomic_campaign_and_relationships.sql` | Hergebruik dossierintegriteit en bestaande transactiegrenzen. Partnerrollen niet automatisch sponsor maken; F1-rollen blijven gelden. |
| Socialposts | `20260722100000_add_operational_modules.sql`, dossiercatalogus | Eigen geplande posts bevatten campagne/publicatie-URL. Creatorinzending vereist apart beoordeelde koppeling; niet automatisch een eigen geplande post maken. |
| Accounts/sync/snapshots | `20260803150500_add_social_integration_core.sql`, `src/lib/social-connectors.ts`, `social-sync-scheduler.ts` | Registers, private credentials en sync-runs bestaan. Toestemming, accountdoel en echte capabilities per pilot bewijzen; geen parallelle credentialstore. |
| Privémetingen | Dezelfde socialmigratie: `members read social metric snapshots` | Brede actieve-ledeninzage aangetroffen in migratiebron. Actuele policies/grants eerst alleenlezend vergelijken. Geen creator-private metingen in die brede leesroute laden. |
| Rapportage | `src/lib/campaign-metrics.ts` | Onbekend blijft al ontbrekend; geen nieuwe algemene null→0-fix claimen. Toevoegen: postniveau, bronkwaliteit, semantiek en twee vensters. Oude campagne-impressions/clicks niet automatisch tot snapshots omvormen. |
| Export | `src/lib/social-metrics-export.ts`, `social-metrics-export-query.ts`, `src/app/api/v1/social/metrics/route.ts` | Organisatiegebonden service-export bestaat; `from/to` filteren op fetched_at. Geen bewijs dat dit een campagnevenster of creatorautorisatie is. Voor nieuwe private data moeten ook adminquery, MCP, portal, bestaande exports en rapporten dezelfde rechten afdwingen. |
| F1-doelen | `20261021124318_f1_purpose_consent.sql`, `src/lib/f1-workflows.ts` | Bestaand doel/tekst/scope/intrekking hergebruiken. Activering vervangt dezelfde doelcode organisatiebreed; intrekking raakt alle verklaringen voor hetzelfde doel. Campagne-isolatie expliciet oplossen en regressietesten. |

## Voorgestelde uitbreidingen, nog geen schema-opdracht

Logische records: campagnedeelname, canonieke externe bijdrage, campagne-bijdragekoppeling, verificatiebesluit, meetdefinitie, afgeschermde meetwaarneming/bronreferentie en rapportrevisie. Kies pas fysieke tabellen na actuele schema-/policyvergelijking. Hergebruik bestaande documenten, personen, socialaccounts, sync-runs en audit waar rechten en betekenis passen.

De website en bot krijgen in dit MVP geen codewijziging of nieuwe sleutel. Als tijdens bouw een nieuwe gedeelde interface nodig blijkt, wordt die eerst als scopewijziging vastgelegd. Geen generieke CRUD/editor voor gevoelige records zonder dezelfde autorisatie.
