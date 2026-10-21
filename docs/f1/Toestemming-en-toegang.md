# F1 toestemming en toegang

Actuele bouwstatus en afwijkingen ten opzichte van het voorbereide contract: [implementatie en testbewijs](Implementatie-en-testbewijs.md). Dit document bewaart ook voorstellen en de afzonderlijke voorwaarden voor DEV/F2.


[F1-overzicht](README.md). Rechten hieronder zijn ontwerpregels voor nieuwe F1-objecten. Ze worden niet stilzwijgend als nieuwe bestaande organisatieprofielen toegekend.

## 1 Doelen en verklaringen

Hergebruik de persoon/accountbinding. Voorgestelde `processing_purposes` beschrijft een organisatiegebonden doel met code, omschrijving, gegevenscategorieën, scope, tekstversie, voorgestelde en beoordeelde grondslag, toegestane ontvangers/functies, geldigheid/hercontrole, retentiebehandeling en intrekkingsgevolg. Een doel blijft `draft` zolang de noodzakelijke inhouds-/privacybeslissing ontbreekt. Er wordt in dit plan geen wettelijke grondslag of bewaartermijn gekozen.

Eerste doelcodes ter voorbereiding:

| Doel | Gegevensgrens | Gebruik in F1 |
| --- | --- | --- |
| `public_profile` | Expliciet gekozen publieke profielvelden en media. | Voorbereiden en testen; echte creatorpublicatie in F4. |
| `campaign_participation` | Deelname aan één benoemde campagne en aangeleverde bijdrage. | Contract/registratie voorbereiden; campagneproef in F3. |
| `private_platform_insights` | Benoemde platformaccount, scopes, metrics, doel en meetperiode. | Geen nieuwe inzage of OAuth activeren in F1. |

Een `consent_record` bewaart persoon, exacte doel-/tekstversie, concrete scope, wijze van verklaring, actor, vastlegging en geldigheid. De verklaring is onveranderlijk; een vervolgverklaring of intrekking is een nieuw herleidbaar record. OAuth-koppeling, een zichtbaar profiel, e-mailmatching, inzending van een URL, lidmaatschap of bestaande bottoegang is geen algemene toestemmingsverklaring.

Een ingelogde persoon kan voor zichzelf verklaren waar dat doel actief en de tekst vastgesteld is. Een beheerder kan een aantoonbare externe verklaring registreren met bron, datum, scope en registrerende actor; die route mag niet worden gepresenteerd als een accountactie van de persoon zelf. Onbekende leeftijd/vertegenwoordigingsbevoegdheid wordt niet automatisch goedgekeurd; de benodigde behandelregel komt vóór die doelgroep live gebruikt wordt.

## 2 Intrekken en doelwijzigingen

Voorgestelde `withdraw_consent(record_id, request_id)` leidt persoon en organisatie af uit de geauthenticeerde context. De operatie is idempotent en schrijft intrekking, blokkering van toekomstig afhankelijk gebruik en audit atomair. Andere doelen of accounts blijven ongemoeid. Een nieuwe/bredere tekst of scope vereist een nieuwe verklaring; geen bestaande opt-in verbreden.

Een consument controleert actuele geldigheid bij ophalen én bij gebruik/publicatie. Queued jobs kunnen een intrekking niet passeren met een oud positief resultaat. Interne publicatieprojecties die van de verklaring afhankelijk zijn worden direct ongeldig; een toekomstig cache-/externe-systeemverzoek krijgt een herhaalbare opvolgtaak met status en fout. De centrale blokkering mag niet wachten op die taak. Dead letters en retries mogen een ingetrokken doel niet reactiveren.

Intrekking is geen onvoorwaardelijke verwijdering van alle administratie. Te bewaren historisch bewijs krijgt een afzonderlijk vastgestelde grond/retentie en afgeschermde toegang; het mag niet opnieuw voor het ingetrokken doel worden gebruikt. F1 legt geen standaard ‘voor altijd’ of fictieve bewaartermijn vast. Zolang behandeling onbekend is, geen automatische verwijdering of nieuwe doelverwerking.

## 3 Actor-/actiematrix

`Ja, beperkt` betekent dat zowel organisatie-, dossier-, doel- als actuele bronrechten gelden. Een softwarecapability alleen is nooit een formeel mandaat.

| Actor | Administratief concept voorbereiden | Vertrouwelijk governancebewijs lezen | Regel/toepasselijkheid en formele uitvoering beslissen | Toestemming beheren | Publieke revisie voorbereiden/beslissen |
| --- | --- | --- | --- | --- | --- |
| Admin zonder formele binding | Bestaande administratieve taakrechten; geen verificatie activeren. | Geen nieuwe automatische toegang door adminstatus; expliciete dossierrol/onderhoudsprocedure vereist. | Nee. | Geen verklaring namens persoon; externe bronregistratie alleen met eigen rol en bewijs. | Concept volgens redactiebevoegdheid; nieuwe publicatiebeslisrol apart vaststellen. |
| Voorzitter met geverifieerd actueel mandaat | Ja, beperkt. | Ja voor toegewezen governance; financiële beperking blijft aanvullend. | Ja, afzonderlijke versiegebonden review en beslissing. | Geen generiek recht op alle privédoelen; eigen verklaring of expliciet toegestane registratie. | Geen automatisch redactie-/publicatierecht uit voorzittersrol. |
| Administratieve dossierbehandelaar | Ja, volgens huidige toegang en expliciete opdracht. | Alleen toegewezen dossier-/bewijsrechten. | Voorstellen indienen; geen formeel positief oordeel. | Alleen toegewezen doeladministratie; niet zelf opt-in simuleren. | Geen impliciet publicatierecht. |
| Finance | Volgens bestaande financiële rechten. | Alleen financiële én expliciet toegekende governance-inzage. | Financieel goedkeuren blijft eigen proces; geen governancebevoegdheid. | Geen algemeen recht op persoonlijke scopes. | Geen financiële gegevens in publieke payload. |
| Redactie/event-/campagneteam | Eigen bronconcept volgens taak. | Geen vertrouwelijk bestuursbewijs op grond van teamlidmaatschap. | Nee. | Alleen benodigde deelname-/doelstatus; geen privéaccountscopes of complete verklaringsbron. | Concept ja waar toegestaan; beslissen alleen met expliciet vastgestelde revisierol. |
| Betrokken persoon, creator of partneraccount | Eigen aanvraag/gegevens volgens bestaande portalrechten. | Geen interne dossiers. | Nee. | Eigen actieve doelen/verklaringen lezen en intrekken; geen ander persoon-ID kiezen. | Eigen verzoek blijft concept/review; geen direct publiceren. |
| Crew/vrijwilliger/publiek | Bestaande taken behouden. | Nee. | Nee. | Alleen eigen gebruikersroute waar geautoriseerd; geen organisatiebrede inzage. | Alleen later werkelijk gepubliceerde veldselectie. |
| Discordbot, streamadapter, websiteclient, agent | Alleen afzonderlijk goedgekeurde functiecontracten. | Geen nieuwe toegang in F1. | Nee; agent kan hoogstens voorstel voorbereiden binnen bestaande toegang. | Geen vrij te kiezen actor of organisatie; geen nieuwe scope in F1. | F1 activeert geen nieuwe publieke client. |

De voorzitter kan bewijs controleren en formeel goedkeuren volgens Linda's bevestiging. De precieze vertrouwelijke dossierinzage, uitvoering van identiteitsverificaties en publicatiebeslissers zijn voorstellen tot vaststelling; bestaande algemene rollen worden niet als vervanger gebruikt.

## 4 Database- en applicatiegrenzen

- Nieuwe gevoelige tabellen: RLS, expliciete SELECT/INSERT/UPDATE/DELETE-grants en functie-execute-grants per actor; geen vertrouwen op brede Supabase-platformdefaults. Start zonder anon-/algemene-member-leesrecht.
- Een nieuwe beperkende permissieve policy maakt een bestaande brede policy niet vanzelf smaller. Bestaande `approval_requests`- en documentregisterpolicies moeten gericht worden vervangen/afgebakend voordat nieuwe vertrouwelijke typen daarin komen.
- Nieuwe formele mutaties uitsluitend via beperkte operaties; geen eigen actor-, organisatie-, verificatie- of beslistijd uit browserdata accepteren.
- Alle bronreferenties dezelfde organisatie. Verificatie vindt plaats bij directe RPC, tabelaanroep, generieke editor, export, portal en achtergrondwerk. Een gewijzigde URL of relation-ID mag geen andere organisatie ontsluiten.
- Een technische onderhoudsverbinding en service_role zijn geen menselijke voorzittersidentiteit. Bots en website krijgen nooit database-/managementcredentials.
- Notificaties gebruiken alleen veilige titel/status en een interne link; ze bevatten geen bewijsinhoud, ruwe URL, financieel bedrag of persoonlijke platformdetails zonder benodigde inzage.

## 5 Documentregister zonder omweg

Het huidige documentregister heeft algemene ledeninzage met aanvullende financiële beperking. Vertrouwelijke governancebron mag daardoor niet via label, URL, keuzelijst, relatie, zoekresultaat, export of bestaand gekoppeld dossier uitlekken.

Voorstel: voeg een expliciete gevoeligheids-/dossierautorisatie toe die alle leesprojecties gebruiken. De financieel beperkte vlag blijft gelden; governance-inzage verruimt financiële toegang niet. Een gedeeld document met zowel financiële als bestuurlijke beperking vereist de toepasselijke combinatie. Een brede tweede bronrelatie mag de beperkte registratie niet alsnog openbaar maken. Verwijdering van een gevoelige koppeling maakt de bron niet automatisch minder vertrouwelijk.

Bewaar de broninhoud in het bestaande afgeschermde bronsysteem of een expliciet geaccepteerde private opslag. Een nieuwe Storage-bucket is geen automatisch onderdeel van de voorbereiding; bij implementatie zijn toegangs-/signed-URL-/intrekkingsproeven vereist als die opslag nodig wordt. Alleen een URL uit een private bucket verbergen is onvoldoende als een eerder uitgegeven link nog langdurig geldig blijft.
