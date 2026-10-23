# Gegevens en toegang

## Minimaal contract

Alle relaties zijn organisatiegebonden en verwijzen naar actieve dossiers. Organisatie en actor komen uit de geverifieerde sessie; een browser kan geen andere creator als zichzelf kiezen. BESC-brand is expliciet; GameGear-gegevens worden niet automatisch gedeeld.

| Logisch record | Minimaal vastleggen |
| --- | --- |
| Deelname | campagne, bestaand persoon/account, geselecteerd/uitgenodigd/aanvaard/ingetrokken/verlopen, vastgelegde versie, actor en tijd; uitnodiging is geen toestemming. |
| Doelbinding | exacte doel-/tekstversie, campagne-ID, concrete velden en ontvangers, account/platform en meetperiode waar nodig, bron/methode, geldigheid en bewaarbehandeling. |
| Bijdrage | platform/content-ID, canonieke URL, organisatie, creatorbinding, eventuele eigen socialpostreferentie, publicatietijd met bron, kandidaat-/verificatiestatus en bewijs. |
| Waarneming | definitieversie, post/account, metric/eenheid, waarde of ontbreekstatus, periode/meetmoment, fetched_at, oorsprong, bevoegdheid, kwaliteit, bronreferentie en integriteit. |
| Rapportrevisie | campagne, selectie/filters, peildatum, definitieversies, input-ID's, dekkingsaantallen, actor, interne ontvangers en intrekking/vervanging. |

Een publiek zichtbare postlink geeft geen toegang tot private impressions. Deelname, gebruik van bijdrage en private insights zijn afzonderlijke bevoegdheden. Geen verklaringen namens mensen fabriceren. Onbekende leeftijd of vertegenwoordiging blokkeert behandeling tot de toepasselijke route is vastgesteld. Geen wettelijke grondslag of bewaartermijn verzinnen.

## Voorgestelde actorgrens

| Actor | Lezen | Muteren |
| --- | --- | --- |
| Toegewezen campagnebeheerder | Alleen toegewezen campagne en toegestane metingen. | Selectie en kandidaten voorbereiden; eigen bijdrage niet zelfstandig verifiëren als aparte review vereist is. |
| Toegewezen reviewer | Nodig bronbewijs en eigen reviewscope. | Versiegebonden verificatie; geen creatorverklaring afleggen. |
| Creator | Eigen deelname, ingediende bijdragen, toepasselijke verklaringen en eigen inzage. | Eigen inzending/verklaring/intrekking; geen andere creator kiezen of eigen meetbewijs officieel labelen. |
| Rapportlezer | Expliciet geautoriseerde interne projectie. | Geen bewerking of automatische bron-/credentialinzage. |
| Algemene beheerder/voorzitter/crew | Geen nieuwe algemene toegang tot privéinsights uit functienaam alleen. | Alleen expliciet toegekende taakrechten. |
| Website/bot/agent | Geen nieuwe F3-privéroute. | Geen nieuwe F3-mutaties. |

Implementatienamen van nieuwe rollen zijn nog niet vastgesteld. Bestaande F1-mandaten en taakrollen behouden hun betekenis.

## Intrekking en technische afdwinging

Nieuwe private verwerking stopt bij intrekking, verlopen doel, verlopen accounttoegang of verwijderde persoonbinding. Hercontrole bij lezen, schrijven, export en jobcommit; een oud positief cache- of queueresultaat mag dit niet omzeilen. Historische administratie krijgt apart vastgestelde bewaarbehandeling en mag niet opnieuw voor ingetrokken gebruik worden ingezet.

Campagne A intrekken mag campagne B niet onbedoeld ongeldig maken. Tegelijk mag opnieuw instemmen met A geen oude bredere verwerking heractiveren. De bestaande F1-doelcode-/withdrawal-semantiek maakt dit een verplichte ontwerp- en migratieproef vóór echte deelname.

RLS en expliciete grants op gevoelige tabellen; deny-by-default. Een nieuwe permissieve policy beperkt een bestaande brede policy niet. Review alle tabellen, views, RPC's, generieke editors, service_role-query's, export/MCP/portal, zoekresultaten, logs en documentkeuzelijsten. Geprivilegieerde backendcode moet zelfstandig actor/doel controleren; RLS alleen beschermt een adminquery niet. Geen autorisatie op user_metadata.

Officiële achtergrond: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), gelezen op 23 oktober 2026. Grants en policies moeten samen worden gecontroleerd. [Changelog](https://supabase.com/changelog) gecontroleerd via de HTML-index; de markdown-index kon de webtool niet lezen. Geen SDK-upgrade nodig voor dit voorbereidingspakket.
