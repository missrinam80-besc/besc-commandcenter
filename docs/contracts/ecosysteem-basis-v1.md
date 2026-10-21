# Gedeelde ecosysteembasis v1

Werkvoorstel van 21 oktober 2026. Dit beschrijft de volgende bouwstappen; het introduceert nog geen tabellen, API-routes, scopes of live bevoegdheden. De correctie voor campagnemetingen is afzonderlijk geïmplementeerd. Zie [werkpakket F0.1](../wiki/Ecosysteem-basis-en-uitvoering.md).

Aanvulling na de volledige F0-toetsing: de voorzitter van het bestuur is door Linda bevestigd voor bewijscontrole en formele goedkeuring van bestuursbesluiten en verplichtingen. De [besluitkaart](../f0/Besluiten-en-bevoegdheden.md) bewaart die afspraak; het [impactontwerp](../f0/Datamodel-en-api-impact.md) benoemt de nog ontbrekende geverifieerde koppeling tussen verenigingslid en account. De overige voorstellen worden niet als verleende live bevoegdheden aangemerkt.

## Bestaande gegevens hergebruiken

| Behoefte | Bestaande bron | Minimale uitbreiding en beperking |
| --- | --- | --- |
| Verplichting | `compliance_deadlines` met verantwoordelijke en documentverwijzing | Drie onafhankelijke beoordelingen: regel geverifieerd, toepasselijkheid bevestigd, uitvoering aangetoond. Een bestaande completed-status wordt niet automatisch juridisch bewijs. |
| Bevoegdheid | `governance_mandates`, organisatieleden en rollen | Controleer mandaat, geldigheidsperiode en bevoegdheid voor de concrete handeling. Applicatierol admin is geen bestuursmandaat. |
| Vergadering en besluit | `meetings`, notulenverwijzing, taken en audit | Identificeerbare besluitrevisie en goedkeuringsbewijs koppelen aan vergadering; quorum/stemming alleen volgens bevestigde BESC-regels. |
| Document en bewijs | `document_registry`, bronnen, administratieve documenten en links | Verwijs naar een specifieke versie of gedateerde vastlegging, niet alleen een wijzigbare URL. Leg bewijsdoel, beoordeling en vertrouwelijkheid vast. |
| Persoon en account | `community_people`, personenrollen, gekoppelde accounts | Verifieer actuele identiteit en het doel waarvoor gegevens worden gebruikt. Een OAuth-koppeling is geen algemene publicatietoestemming. |
| Partnerrollen | `partners` en `record_relationships` | Meervoudige rollen van een organisatie en de rol bij een specifieke campagne afzonderlijk behandelen. Geen automatische sponsorrol. |
| Publicatie | Bestaande content-, event- en partnerdossiers | Expliciete publieke veldselectie en goedgekeurde revisie. Intrekken geldt ook voor caches, media en afgeleide weergaven. |
| Meting | Campagnevelden, `kpi_records`, `social_metric_snapshots` | Waarde, bron, periode, opgehaald-op, definitie en dekking scheiden. Geen gemeten nul invullen bij ontbrekend bewijs. |

Een link in het documentenregister bewijst nog niet dat de onderliggende Drive- of Storage-rechten juist staan. Voor vertrouwelijk bewijs moeten ook bronrechten, versiebehoud en intrekking worden getest. Toestemming en bewijs krijgen geen los duplicaatmodel wanneer bestaande objecten veilig uitgebreid kunnen worden.

## Rollen en gegevensdoelen

De linkerkolom beschrijft de huidige situatie in code en Cloud-policies; de rechterkolom het beoogde model. Er zijn geen rechten aangepast.

| Functie | Huidige basis | Beoogde grens |
| --- | --- | --- |
| Technisch beheer | Admin beheert gebruikers en integraties; dit is niet via een aangepast profiel delegeerbaar in `hasPermission`. | Infrastructuur beheren geeft geen formele bestuursgoedkeuring. Gevoelige herstel- en beheeracties blijven herleidbaar. |
| Bestuur en administratie | `manageOrganization` is standaard admin/board en in de app via custom capabilities mogelijk; governance-RLS gebruikt `private.is_org_manager`. | Administratief bewerken en bevoegd besluiten worden apart getoetst. Een profiel in de app verruimt niet vanzelf RLS. |
| Contentredactie | Admin/board/member hebben standaard `manageContent`. | Concepten bewerken staat los van goedkeuren en publiceren. Publicatie vereist de geldige goedkeuring van precies die revisie. |
| Campagnemedewerker | Campagnebeheer en dossierrelaties bestaan; rapporten hebben eigen rolchecks. | Alleen toegewezen of doelmatig toegankelijke creatorinzichten; geen algemene toegang tot alle toekomstige privéanalytics. |
| Creator of partner | `portal_access` en beperkte dashboard-RPC's; eigen accountkoppelingen. | Alleen eigen toegestane gegevens. Verzoeken kunnen ter review gaan; geen directe overschrijving van goedgekeurde publieke inhoud. |
| Intern lid | Socialmetingen zijn nu leesbaar via `private.is_active_member`; ook vergaderinginzage is breed binnen de organisatie. | Vertrouwelijk bestuur en persoonlijke creatorinzichten vereisen een expliciete fijnere afbakening vóór ingebruikname. |
| Publieke bezoeker | Nog geen geaccepteerde vervangende websiteketen. | Alleen gepubliceerde toegestane velden; geen interne tabellen algemeen openbaar maken. |
| Discordbot en streamadapter | Afzonderlijke beperkte API-contracten; bot heeft geen directe databaseverbinding. | Functiegebonden serverbevoegdheid, geen menselijke beheerrol en geen vrij te kiezen organisatie of gebruiker. |
| Agent | Bestaande vaardigheden en connectorgrenzen. | Voorbereiden en controleren binnen toegekende toegang; formele goedkeuring en externe uitvoering volgen hun eigen bevoegdheid. |

Nog te bevestigen: welke personen welke formele mandaten en reviewtaken hebben. Dit document kent niemand zo'n mandaat toe. Implementatie moet appchecks, RPC's, RLS, exports en achtergronduitvoering samen toetsen; alleen een knop verbergen is onvoldoende.

## Bewijs en governanceafronding

Voorstel voor de minimale bewijsreferentie: organisatie, dossier en handeling, document/verwijzing, versie of vastleggingstijd, bron, auteur, beoordelaar, beoordelingstijd en vertrouwelijkheidsklasse. Bewijs bevat een geldige relatie naar hetzelfde organisatiedossier. Een bronwijziging of intrekking moet een eerdere beoordeling als historisch laten staan en de actuele geldigheid opnieuw bepalen.

De drie beoordelingen zijn onafhankelijk:

1. Regel: bron, verificatie en datum; onbekende juridische termijnen blijven onbekend.
2. Toepasselijkheid: geldt dit voor deze BESC-situatie, beoordeeld door de passende verantwoordelijke?
3. Uitvoering: welk bewijs toont welke handeling op welke datum aan, en wie heeft dit beoordeeld?

Geen van de drie volgt automatisch uit een deadline, documentlink, taakstatus of adminrol. Bestaande dossiers behouden hun gegevens en historische completed-status, met een expliciet onderscheid tussen administratief afgerond en uitvoering aangetoond. Zelfgoedkeuring en eventuele uitzonderingen moeten als beleidskeuze expliciet worden vastgesteld, niet stilzwijgend worden toegestaan.

De toekomstige afrondingshandeling moet op de server en in de database atomair versie, bewijs en bevoegdheid valideren en een auditrecord schrijven. De bestaande directe update en generieke dossiereditor mogen deze controles niet omzeilen. Benodigde databasewijziging wordt pas ontworpen nadat bovenstaande semantiek is vastgesteld; er is in dit pakket geen governance-migratie aangemaakt.

## Toestemming

Registreer voor een geïdentificeerde persoon het specifieke doel, reikwijdte en betrokken gegevens, vastgelegde tekstversie, vastleggingstijd, geldigheid en eventuele intrekking. Scheid minimaal openbare profielpublicatie, campagnedeelname en inzage in persoonlijke platforminzichten. Een accountkoppeling, ingestuurde URL of intern lidmaatschap vervangt die afweging niet. De juiste verwerkingsgrondslag en bewaartermijn worden per doel vastgesteld.

Intrekken stopt toekomstig gebruik en publieke weergave waarvoor die toestemming nodig is. Wat om een andere geldige reden bewaard moet worden, krijgt een afzonderlijke beoordeling; het systeem belooft geen onvoorwaardelijke verwijdering van alle historische administratie.

## Partnerrol

Een organisatie kan tegelijk bijvoorbeeld eventpartner en esportsorganisatie zijn. Dat maakt haar niet automatisch sponsor. Een campagnerelatie vermeldt de concrete bijdrage/rol; een eventuele hoofdclassificatie van het dossier is alleen een hulpmiddel.

Bij ombouw: inventariseer bestaande `partner_type` en `record_relationships`; presenteer bestaande sponsorrelaties ter beoordeling; herclassificeer ze niet op basis van naam of vermoedens. De concrete wijziging moet de campagneaanmaak-RPC, editor, zoekfilters, portalen en rapportselectie samen behandelen. Een wijziging in alleen de UI herstelt de huidige automatische sponsorrelatie niet.

## Publieke publicatie

Voorstel voor het publicatiecontract: stabiel dossier-ID en slug, taal, publieke veldselectie, revisie, goedkeuring voor die revisie, publicatieperiode en intrekkingsstatus. Interne notities, persoonlijke contactgegevens, contracten en financiële gegevens zijn standaard uitgesloten. Publieke media vereisen toegestane bronrechten en publicatierechten.

De website krijgt een serverinterface voor goedgekeurde publieke gegevens. Nog geen routenaam, databaseview of sleuteltype is vastgesteld. Het contract moet zowel de gepubliceerde revisie als het intrekken ondersteunen, met een vast te stellen maximumtijd voor cacheverversing. Een gewijzigd concept blijft onzichtbaar totdat die nieuwe versie goedgekeurd is.

## Meetwaarden

De geïmplementeerde eerste correctie betreft uitsluitend campagne-impressies en klikken in sponsorportal, sponsorrapport, eventrapport en bijbehorende CSV's:

- Gemeten 0 blijft 0.
- Null, lege of ongeldige numerieke waarde wordt ‘Ontbrekende meting’.
- Geen campagnes wordt ‘Geen campagnes’, niet een gemeten totaal van nul.
- Bij gedeeltelijke dekking tonen we alleen de som van bekende waarden met ‘gedeeltelijk’ en het aantal gemeten/ontbrekende campagnes.
- De som van impressies heet impressies; ze is geen uniek bereik.
- CSV's bevatten numerieke bekende waarden en de tekst ‘Ontbrekende meting’ voor ontbrekende waarden.

Dit bewijst nog geen vergelijkbare meetperiode, actuele bron of volledige campagneperformance. Historische onterecht opgeslagen nullen kunnen zonder bronbewijs niet worden hersteld. Andere KPI-aggregaties, freshness en crossplatformdefinities volgen afzonderlijk.

## Acceptatie voor volgende wijzigingen

| Proef | Verwacht resultaat |
| --- | --- |
| Ander organisatiedossier als bewijs of toestemming | Afgewezen, geen gedeeltelijke write. |
| Admin zonder passende formele bevoegdheid | Kan geen formele goedkeuring afdwingen. |
| Verouderde revisie, ingetrokken bewijs of gelijktijdige wijziging | Afronding/publicatie afgewezen of opnieuw beoordeeld. |
| Generieke editor, RPC, export of achtergrondtaak | Respecteert dezelfde rechten en versievoorwaarden. |
| Partner is esportsorganisatie maar geen sponsor | Blijft zo bij campagneaanmaak en rapportage. |
| Goedkeuring voor revisie 1, gewijzigd concept revisie 2 | Alleen revisie 1 blijft publiek totdat 2 goedgekeurd is. |
| Publicatie ingetrokken | Binnen afgesproken maximumtijd nergens meer publiek gecachet. |
| Gemeten nul naast ontbrekend | Zowel scherm als CSV houden het onderscheid. |

Een volgende wijziging bevat steeds een impactsamenvatting, migratie indien nodig, terugvalprocedure, automatische checks en gerichte DEV-acceptatie. De repositories en deployments blijven gescheiden.
