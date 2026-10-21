# F1 identiteit en governance

Actuele bouwstatus en afwijkingen ten opzichte van het voorbereide contract: [implementatie en testbewijs](Implementatie-en-testbewijs.md). Dit document bewaart ook voorstellen en de afzonderlijke voorwaarden voor DEV/F2.


[F1-overzicht](README.md). Ontwerp voor F1.1/F1.2; geen nieuw object of recht is met dit document ingevoerd.

## 1 Bestaande binding is nog geen formele verificatie

`association_members` heeft nog geen account-/persoonsreferentie. `governance_mandates.member_id` verwijst wel naar dat lid. `community_people.account_user_id` en bestaande accountcontact-RPC's zijn herbruikbaar, maar `private.ensure_account_contact` kan contactkandidaten onder meer via een bevestigd e-mailadres vinden. Dat is nuttig contactonderhoud en geen bewijs van voorzittersbevoegdheid.

Voorgestelde keten: `association_members.community_person_id` → `community_people.account_user_id` → actief `organization_members`-account. Een afzonderlijk verificatierecord verwijst naar **lid, persoon én het exact geverifieerde account**, met verificatiegrond, controleur, tijdstip, revisie en intrekking. Een automatische contactlink maakt zo'n record niet aan.

Invarianten:

- Composiete organisatie-/ID-verwijzingen waar bestaande unieke sleutels dat ondersteunen; anders eerst een gerichte unieke sleutel toevoegen. Zelfde-organisatiecontrole geldt voor elk gekoppeld lid, persoon, mandaat en bewijsstuk.
- Geen twee actuele, niet-verwijderde verenigingsleden aan dezelfde persoon koppelen. Beëindigde/vervangen bindingsrecords blijven historie. Een mislukte dubbele koppeling schrijft geen audit-succes of gedeeltelijke wijziging.
- Bij accountwissel, ontkoppeling, soft-delete, schorsing of intrekking vervalt de actuele geldigheid. De nieuwe accountgebruiker erft geen verificatie of besluitrecht.
- De generieke editor en directe UPDATE kunnen geen verificatiekolommen, verificatierecord of formeel-geldig label schrijven. Bestaande contactbeheerfuncties blijven bruikbaar; een relevante wijziging vereist herverificatie.
- Een portaalaccount zonder actief intern organisatielidmaatschap is geen formele bestuurder voor deze eerste werkstroom.

## 2 Eerste toekenning zonder automatische zelfverheffing

Een software-admin beheert infrastructuur; een actueel mandaat bewijst de formele functie. De eerste geverifieerde binding vraagt een afzonderlijk vastgelegd besluit met benoemingsgrond, geverifieerde persoon/account en toegestane uitvoerder. Die uitvoerder wordt in F1-DEV niet verzonnen of op naam/email geraden.

De bootstrap is een begrensde onderhoudshandeling, buiten de algemene admin-/dossiereditor, met actuele preflight, één expliciet goedgekeurde binding, onderbouwing en audit. In geïsoleerde tests gebruiken we uitsluitend een synthetische bootstrap. Een dagelijkse applicatieactie mag deze uitzonderingsroute niet kunnen oproepen. Er is geen permanente ‘admin mag altijd voorzitter maken’-fallback.

Latere verificatie, herbinding en herstel volgen een gedocumenteerde bevoegde controle. Als die bevoegdheid ontbreekt, blijft de binding onbruikbaar voor formele acties. Bij verlies van het enige geldige voorzittersaccount volgt dezelfde expliciete herstelroute; een technische passwordreset alleen verandert geen mandaat.

## 3 Actuele voorzitterscontrole

Voorgestelde helper `private.can_act_as_chair(org, actor, action, source_revision)` beoordeelt bij de beschermde handeling:

1. Aanroepende, geauthenticeerde mens komt overeen met de serveractor; `actor` is niet vrij door een browser of bot te kiezen.
2. Actief intern organisatielidmaatschap in dezelfde organisatie.
3. Actief, niet verwijderd verenigingslid met actuele expliciete verificatie naar het huidige persoonsaccount.
4. Actief, niet verwijderd `chair`-mandaat met geldige periode, gekoppeld aan dat lid en de beoordeelde benoemingsgrond.
5. Handeling en dossier vallen binnen de bevestigde bevoegdheid; geen aangegeven persoonlijk belang of betwiste bevoegdheid zonder expliciete behandelbeslissing.
6. Doelrevisie en relevant bewijs zijn nog actueel. Geen positieve bevoegdheid cachen voor een volgende mutatie.

Voorstel voor datuminterpretatie: mandaatdatums zijn kalenderdagen in Europe/Brussels, met inclusieve einddatum. Dit is technische semantiek ter vaststelling, geen uitspraak over statutaire geldigheid. Nul geldige kandidaten betekent weigeren; meerdere tegenstrijdige actieve kandidaten betekenen ambiguïteit en handmatige behandeling, geen ‘eerste rij wint’.

Een `SECURITY DEFINER` is alleen aanvaardbaar voor de smalle operatie die dat aantoonbaar nodig heeft, met lege/vaste search_path, volledig gekwalificeerde objecten, expliciete actor-/organisatiecontrole en beperkte execute-grants. Geen anon-, bot- of algemene service_role-toegang tot menselijke beslisoperaties. PostgreSQL-eigenaarsbeheer blijft een aparte onderhouds-/auditgrens; applicatiebeveiliging pretendeert dat beheer niet onmogelijk te maken.

## 4 Bewijs en besluit zijn versiegebonden

Hergebruik `document_registry` als vindplaats en `administrative_documents` als inhoudelijk dossier. Een bewijsversie voegt toe: concrete bronrevisie of bewaarde vastlegging, vastleggingstijd, bron-/ontvangsttype, relevant document, vertrouwelijkheid, eventuele inhoudshash en reden bij intrekking/vervanging.

Een veranderlijke Drive-link zonder bewaarde versie is **bron beschikbaar, uitvoering onbewezen**. Geen HTTP-request naar een vrij ingevoerde interne URL; controle van externe bronnen krijgt toegestane hosts, begrensde downloads en SSRF-bescherming. V1 kan een expliciet ingediende export/vastlegging gebruiken zolang daarvoor rechten en hercontrole bestaan. Een linkcontrole bevestigt bereikbaarheid, niet authenticiteit of juridische aanvaarding.

Een governancebesluit krijgt een stabiel ID, bestaand meeting-ID indien van toepassing, orgaan, onderwerp, besluittekst/revisie, beslisdatum, bevoegdheidsgrond, vastgelegd besluitbewijs en uitvoeringstaak. Stemmen, quorum, volmachten en handtekeningen zijn alleen vastgelegde, gecontroleerde gegevens wanneer voor dat besluit vereist; ontbrekende gegevens worden niet uit vrije tekst afgeleid. Deze eerste keten is geen compleet convocatie-/elektronisch ondertekeningsplatform.

Historische `meetings.decisions` blijft behouden als brontekst. Nieuwe gestructureerde besluiten verwijzen expliciet naar de gecontroleerde bron; geen automatische omzetting naar formeel goedgekeurde besluiten. Een beslissing in het CC verricht op zichzelf geen aangifte, betaling, contractondertekening of verzending.

## 5 Drie onafhankelijke beoordelingen

| Dimensie | Ontwerpstatussen | Voorwaarde voor positieve beoordeling |
| --- | --- | --- |
| Regel | `unreviewed`, `verified`, `uncertain`, `superseded` | Concrete actuele officiële bron/versie, verificatie en hercontrole. |
| Toepasselijkheid | `unreviewed`, `applicable`, `not_applicable`, `uncertain` | Vastgelegde BESC-kenmerken en onderbouwing voor dit dossier. |
| Uitvoering | `not_demonstrated`, `submitted`, `demonstrated`, `reassessment_required` | Beoordeelde, beschikbare bewijsversie en bevoegde formele beslissing. |

Dit zijn nieuwe betekenissen; ze vervangen bestaande taak-/deadline-statussen niet. Een `completed` deadline of goedgekeurd algemeen content-/documentverzoek levert geen van deze positieve beoordelingen op. `not_applicable` krijgt een onderbouwde toepasselijkheidsbeslissing, geen verzonnen indieningsbewijs. Correcties en negatieve beoordelingen blijven versiegebonden zichtbaar.

Een onbekende `due_date` is momenteel technisch onmogelijk door NOT NULL. Voorstel: maak de datum optioneel met `deadline_basis_status` en verplichte reden wanneer onbekend. Bestaande datums behouden hun waarde; geen migratie die ze automatisch juridisch geverifieerd verklaart. Bekende datums behouden hun bron/trigger/berekening; reminders bij een onbekende termijn vragen onderzoek en verzinnen geen vervaldag. Herhaling maakt een nieuwe te beoordelen instantie en kopieert geen bewezen uitvoeringsstatus naar de volgende periode.

## 6 Transacties en omwegen

Voorgestelde formele operatie krijgt `request_id`, doel-ID en `expected_revision`. De server leidt actor en organisatie uit de sessie af; de database bevestigt dit. Bij herhaalde request-ID met identieke payload volgt dezelfde uitkomst; andere payload is conflict. Een stale revision, onbekend bewijs of weigering resulteert in nul gedeeltelijke wijzigingen.

Vergrendel in vaste volgorde de betrokken identiteit/verificatie, mandaat, dossier en bewijsrevisies. Hercontroleer na het verkrijgen van de locks; een concurrerende intrekking moet dezelfde relevante rijen raken. Review opslaan en formeel beslissen blijven afzonderlijke gebruikershandelingen, ook als de voorzitter beide uitvoert. De uiteindelijke beslistransactie schrijft beslissing, actuele uitvoeringsprojectie en audit samen. Mislukt audit, dan geen positieve afronding.

Bij bronwijziging of intrekking blijft de eerdere beslissing een historisch feit, terwijl de actuele uitvoeringsprojectie `reassessment_required` wordt. De schermen tonen beide; geen auditgeschiedenis overschrijven. Bestaande fysieke DELETE/cascade-paden op mandaat/lid/bron krijgen restrictie of een gecontroleerde archiveringsroute zodra er bewijs-/beslisreferenties bestaan.

Alle paden vallen onder dezelfde bescherming: `saveComplianceDeadline`, `completeComplianceDeadline`, `saveGovernanceMandate`, de vier administratie-editorsoorten, `save_dossier_bundle`, accountcontactmutaties, goedkeuringsvoorraad, directe tabelgrants/policies en toekomstige agentacties. Formaliteitsvelden krijgen geen directe write-grant. Een trigger/privilege-/RLS-combinatie voorkomt dat een algemene managerwrite de operatie omzeilt; alleen een UI-veld verwijderen is onvoldoende.
