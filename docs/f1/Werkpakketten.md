# F1 werkpakketten

[F1-overzicht](README.md). Alle nieuwe object-/operatienamen hieronder zijn ontwerpvoorstellen. Definitieve migratiebestandsnamen ontstaan bij implementatie via `supabase migration new`, niet uit fictieve datums in dit plan.

## F1.1 Gecontroleerde identiteit en bevoegdheid

**Gebruikersresultaat:** bij een verenigingslid is zichtbaar of de persoon/accountbinding is geverifieerd, waarop de controle berust en of die nog geldig is. Een beheerder kan gegevens voorbereiden zonder zichzelf bestuursbevoegdheid te geven.

- Hergebruik `association_members`, `community_people.account_user_id`, `organization_members` en `governance_mandates`.
- Voeg de organisatiegebonden persoonsreferentie en een afzonderlijke, historiseerbare verificatie toe. Leg de exact gecontroleerde accountbinding vast; een latere accountwissel erft geen verificatie.
- Maak een beperkte actuele bevoegdheidsfunctie. Toets die opnieuw bij iedere beschermde handeling, inclusief directe API-aanroep en gelijktijdige mandaatintrekking.
- Neem de reguliere administratie, `save_community_person_bundle`, de accountcontactonderhoudsfunctie, generieke editor en directe tabelmutaties mee.
- Toon concrete afwijzingsredenen zonder privégegevens van andere organisaties te onthullen.

**Op te leveren wijzigingsset:** additieve migratie, beperkte bindingsoperaties, voorzitterscontrole, aangepaste administratie-/persoonseditor, audit en tests. **Acceptatie:** I01–I09 en R01–R04. **Live voorwaarde:** geverifieerde benoemingsgrond en expliciete eerste binding; geen naam of account ingevuld door dit plan. Details: [identiteit](Identiteit-en-governance.md).

## F1.2 Governance, besluiten en uitvoeringsbewijs

**Gebruikersresultaat:** een dossier toont afzonderlijk of de regel is gecontroleerd, op BESC van toepassing is en de uitvoering is aangetoond. Een administratief afgerond oud dossier blijft herkenbaar als zodanig.

- Versies van dossier, officiële regelreferentie en bewijs vastleggen; een URL of hash op zichzelf is onvoldoende uitvoeringsbewijs.
- Onbekende deadline toelaten met reden; de huidige verplichte `due_date` vraagt een gerichte modelwijziging. Geen fictieve datum invullen.
- Identificeerbaar besluit koppelen aan bestaande vergadering, orgaan, bevoegdheid, bewijs en taak. Bewaar bestaande vrije besluittekst; geen automatische reconstructie van stemmen/quorum/ondertekening.
- Review en formele beslissing zijn afzonderlijke vastleggingen voor dezelfde bron-/bewijsversie. De voorzitter mag beide doen, volgens Linda's bevestiging. Een persoonlijk belang krijgt een geblokkeerde route tot expliciete behandeling.
- Formele afronding in één transactie met versie-, bewijs-, bevoegdheids- en auditcontrole. Ook aanmaak met `status=completed` en de generieke editor mogen geen bewezen status produceren.
- Trek actieve bewijsstatus in bij vervanging/intrekking/ontoegankelijke bron. Eerdere besluiten blijven historisch zichtbaar; hun actuele onderbouwing kan herbeoordeling vereisen.

**Op te leveren wijzigingsset:** bewijs-/beoordelingsmodel, minimale besluitenketen, deadline-aanpassing, databaseguards, UI voor behandelen/reviewen en gerichte samenvatting. **Acceptatie:** G01–G12 en R01–R04. **Live voorwaarde:** bron en toepasselijkheid per echt dossier bevestigd; geen geautomatiseerde juridische garanties. Details: [governance](Identiteit-en-governance.md).

## F1.3 Doelgerichte toestemming en toegang

**Gebruikersresultaat:** een persoon ziet welk doel en welke tekst zijn vastgelegd en kan het toekomstige gebruik waarvoor toestemming nodig is stoppen. Interne verwerkers zien alleen hun toegestane werk.

- Doelregister met gegevensscope, tekstversie, voorgestelde rechtsgrond, verwerking, toegangsfunctie, hercontrole/retentie en intrekkingsgedrag. Publicatie, campagnedeelname en privéplatforminzage blijven afzonderlijke doelen.
- Toestemmingsverklaring als onveranderlijk record met vastlegging, actor en eventuele intrekking. Een beheerder kan geen eigen verklaring van de persoon simuleren; geregistreerde externe onderbouwing blijft herkenbaar als zodanig.
- Website, bots en agents krijgen geen algemene toegang tot dit register. Intrekken blokkeert afhankelijke actuele verwerking atomair; externe verwijdering waar nodig krijgt een herhaalbare opvolgtaak.
- Rechten op vertrouwelijk bewijs werken door in documentregister, linklijsten, zoeken, exports en notificaties.

**Op te leveren wijzigingsset:** doel-/verklarings-/intrekkingsoperaties, eigen inzage en intrekken in CC-accountomgeving, beheerde externe vastlegging, toegangshelpers, audit en tests. **Acceptatie:** C01–C09, D01–D05. **Live voorwaarde:** doeltekst, grondslag en bewaarbehandeling voor ieder geactiveerd doel vastgesteld. Geen creatorinzichten ophalen in F1. Details: [toestemming](Toestemming-en-toegang.md).

## F1.4 Partnerrollen en bijdragen

**Gebruikersresultaat:** dezelfde partnerorganisatie kan meerdere rollen hebben. Een esports- of eventpartner wordt bij campagneaanmaak niet vanzelf sponsor.

- Hergebruik `partners` en `record_relationships`; voeg een roltoekenning toe in plaats van een tweede organisatieregister.
- Kies per campagne-/eventrelatie de bijdrage expliciet. Maak campagneaanmaak en relatiemutaties atomair compatibel; bestaande clients mogen niet stilzwijgend een sponsorrol blijven aanmaken.
- Laat huidige `partner_type` en historische relaties staan met herkomstlabel. Nieuwe rollen worden alleen na beoordeling bevestigd.
- Doorloop filters, keuzelijsten, partnerfiche, sponsorportal en sponsor-/eventrapporten; laat een nieuwe rol geen extra portaal- of financieel recht geven.

**Op te leveren wijzigingsset:** rolmodel, compatibele RPC-overgang, formulier/editor/relatiechecks, portal-/rapportregressies. **Acceptatie:** P01–P07. **Live voorwaarde:** voorgestelde rollenlijst en behandeling bestaande relaties geaccepteerd. Details: [partners](Partners-en-publicatie.md).

## F1.5 Interne publicatierevisies en websitecontract

**Gebruikersresultaat:** redactie kan een expliciete publieke versie ter beoordeling voorleggen; een gewijzigd dossier vervangt die versie niet ongemerkt. Publicatiegereed is een afzonderlijke status.

- Beperk eerste typen tot event en nieuws; definieer partnerpayload als contract voor de volgende keten. Publieke creatorprofielen blijven afhankelijk van latere F4-inrichting.
- Bouw interne snapshots, allowlists, versiegebonden review en intrekking; hergebruik content-/eventdossiers en goedkeuringswerkvoorraad.
- Een intern voorbeeld gebruikt dezelfde veldselectie en tekst-/mediareiniging als de latere website. Geen render van ongeschoonde HTML, javascriptlinks, privéuploads of interne bron-URL's.
- Leg leescontract, foutgevallen, paginering, cache-/intrekkingscontract en compatibiliteit vast. Geen nieuw publiek endpoint of websitecredential activeren in F1.

**Op te leveren wijzigingsset:** interne revisievoorraad, review/preview, contractfixtures en tests; overdracht aan de afzonderlijke websitebouw in F2. **Acceptatie:** U01–U10. **F2-poort:** host, stagingtoegang, publicatiebevoegdheid en de voorgestelde 60-secondenintrekking besluiten en end-to-end bewijzen. Details: [publicatie](Partners-en-publicatie.md).

## F1.6 Geïntegreerde acceptatie en overdracht

**Gebruikersresultaat:** één aantoonbare gedeelde keten, zonder bestaande tickets, accountkoppelingen, financiën of Bucks te beschadigen.

- Synthetische fixture: lid met geverifieerd voorzittersmandaat, verplichting met onbekende termijn, regelbron/bewijsversie, expliciete beoordeling en formele beslissing; daarna intrekking/herbeoordeling.
- Tweede keten: partner met esports- én eventrol; campagne met expliciete bijdrage; event-/nieuwsrevisie naar intern voorbeeld; gewijzigde revisie vraagt nieuw akkoord.
- Negatieve rol-/organisatie-/replay-/raceproeven; bestaande financiële en e-mailgoedkeuringen blijven eigen controles houden.
- Migratie-/imagebewijs, begrensde terugval, README/wiki en open punten naar F2 actualiseren. Geen claim dat een geïsoleerde fixture de volledige Cloud Auth/Storage/Vault-herstelketen accepteert.

**Oplevering:** [acceptatieverslag volgens dit draaiboek](Acceptatie.md), met bewijs per geval; geen vinkjes vooraf. Vóór de eerste echte dossierbinding zijn de toepasselijke besluiten uit het [beslisregister](Beslispunten-en-risicos.md) genomen.
