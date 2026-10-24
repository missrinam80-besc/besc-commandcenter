# Hergebruik en concrete code-impact

Alle genoemde code is lokaal gelezen op de versies uit `manifest.json`. Aanwezig betekent geen nieuwe live acceptatie. Externe toegang is in deze ronde niet getest.

| Bestaande bron | Bevestigde codewerking / grens | F4-wijziging |
| --- | --- | --- |
| `community_people`, `community_person_roles`, `community-people.ts` | Personen en meerdere rollen bestaan. Een rol creator/volunteer is geen publieke opt-in. | Bestaande persoon als interne eigenaar behouden; publieke profielvelden in een afzonderlijke goedgekeurde projectie, geen tweede CRM. |
| `ensure_account_contact` uit migratie `20261008065014` | Bestaande account-/contactkoppeling veronderstelt organisatie-/portaalcontext en kan bestaande emailkandidaten gebruiken. | Geen openbare email-match-claim gebruiken. Nieuwe externe intake eerst eigen toegangscontext, bij conflict handmatige identiteitsreview. Historische contactbinding niet overschrijven. |
| `partners`, `partner_roles`, `record_relationships` | F1 ondersteunt meervoudige rollen en concrete bijdragen. | Partnerprofiel koppelen aan één bestaande organisatie; actuele rollen afzonderlijk verifiëren voor publieke labels. Geen contract/bedrag/contacten meenemen. |
| `src/app/portal/page.tsx`, `portal_access`, sponsor/streamer-RPC’s | Portaalroute en dashboards bestaan; alleen `sponsor`/`streamer`; brede eigen dossierprojecties hebben eigen betekenis. | Niet één-op-één naar website kopiëren. Nieuwe minimale eigen projectie; oude route en contracten behouden. Partnerdelegatie en Mijn BESC zijn geen nieuwe sponsorinzage. |
| `F1OwnConsent`, `f1_own_consent`, `private.f1_human` | Eigen doelen bestaan; UI verzamelt organisaties uit actieve interne/portaaltoegang. | Externe gebruiker zonder CC-rol apart ondersteunen; bestaande helper niet voor ieder Auth-account openzetten. Doelcode `public_profile` hergebruiken waar scope past. |
| `publication_revisions`, `f1_publication_source`, `f1_public_payload`, F1-schema’s | Alleen event/news toegestaan; aparte hashreview; bronrevisie is relevant. | Nieuwe type-/bronhelpers en versiecontract; alle directe schrijfpaden en constraints consistent uitbreiden. Geen gefingeerde news-records voor profielen/vacatures. |
| `publication_entries`, `f2_valid`, `f2_publications`, `f2_media_locator` | F2-typechecks en site/viewer/sleutel/epoch gebonden aan news/event. | F2 ongewijzigd bewaren. Versiegebonden uitbreiding of aparte platform-entrylaag met dezelfde geldigheidsketen; keuze toetsen op herstelcompatibiliteit. Media-locator controle voor nieuwe types expliciet aanpassen. |
| `src/lib/f2-contract.ts`, `f2-api.ts`, `/api/v1/publications/[...path]` | GET-only, serverkey plus toegelaten viewer; strikte union news/event; private media begrensd. | Afzonderlijke platformroutes naast F2; eigen/private routes nooit met publieke leeskey alleen toelaten. |
| Website `src/lib/contract.ts`, `content.ts`, `auth.ts`, `proxy.ts`, `content-view.tsx` | Strikt F2-contract, gesloten staging, eigen cookie, nonce/CSP, no-store/noindex. | Nieuwe serverfetch/DTO’s en profiel-/vacaturepagina’s; oude nieuws/event-validatie blijft groen; geen Supabase-secret op website. |
| Website `shell.tsx`, `style.css`, thema/assets | Home/events/nieuws bestaan met merkstijl en thema. | Routes en lege/storingstoestanden uitbreiden; semantische tokens, beide thema’s, toetsenbord en mobiel behouden. |
| `inbox_items`, contact-/taakrelaties en bestaande intakepatronen | Werkvoorraad en enkele gespecialiseerde intakes bestaan. Geen algemene vrijwilligers-/creatorintake gevonden. | Eigen beperkte intake met duurzame ontvangst, afgebakende behandeling en optionele atomaire koppeling aan CC-taak/inbox. Geen rewards-/ticketintake hergebruiken met andere databetekenis. |

## Eerste concrete wijzigingsset

F4.1 levert de nieuwe schemaversie, beperkte RPC/API, eigen context en domeinrevisies. F4.2 gebruikt die keten voor één fictief creatorprofiel. Een bevestigde profielbewerking maakt een nieuw voorstel; de huidige vrijgave blijft exact de beoordeelde revisie totdat die wordt vervangen of ingetrokken. Bij ingetrokken persoons-/mediarechten vervalt de huidige weergave onmiddellijk aan de servergrens.

Website en CC blijven afzonderlijk deploybaar. Eerst providers compatibel uitbreiden; daarna consumentcode; daarna pas een afzonderlijke stagingvrijgave. Geen directe business-tabelquery in de publieke frontend, geen monorepo of gedeeld geheimenbestand.
