# F0 datamodel en API impact

Ontwerpbeslissingen voor de volgende bouwfase, 21 oktober 2026. Onderstaande uitbreidingen bestaan nog niet als migraties of nieuwe live API's. Zij maken de implementatie afgebakend en toetsbaar; tabel- en routenamen van nieuwe onderdelen zijn ontwerpvoorstellen.

## 1 Voorzitter aan een geverifieerd account verbinden

Een concrete ontbrekende schakel is vastgesteld: `governance_mandates.member_id` verwijst naar `association_members`. Die ledenadministratie heeft momenteel geen geverifieerde koppeling naar een account. De bestaande `community_people.account_user_id` heeft die functie wel.

Voorstel: voeg aan `association_members` een optionele `community_person_id` toe, met dezelfde-organisatiebinding en een unieke actieve persoonskoppeling. Gebruik vervolgens de bestaande accountbinding van die persoon. Voeg geen tweede e-mail- of accountmatchingmechanisme toe. Bestaande leden, mandaten en historie blijven ongewijzigd; de koppeling wordt expliciet gecontroleerd en vastgelegd, nooit geraden uit namen of e-mailadressen.

Een toekomstige voorzitterscontrole vereist tegelijk: actieve organisatietoegang; een geverifieerd gekoppelde persoon; een actief, niet verwijderd verenigingslid; een actief voorzittersmandaat met geldige begin/einddatum; en bevoegdheid voor de concrete handeling. De uitkomst wordt bij de beslissing opnieuw bepaald, niet uitsluitend bij inloggen. Technische accountrollen en formele functies blijven gescheiden.

Code-impact: de administratie-editor en catalogus; `src/lib/permissions.ts`; de bestaande authcontext; nieuwe beperkte database-helper voor de formele bevoegdheid; bijbehorende RLS en tests. Het generieke dossierpad mag de koppeling of reviewvoorwaarden niet omzeilen. Er wordt nu geen breed beheerrecht toegevoegd.

## 2 Governance en bewijs op de bestaande kern

Behoud `compliance_deadlines`, `governance_mandates`, `meetings`, `administrative_documents`, `document_registry`, taken en `organization_audit_log` als bronnen. Voeg de ontbrekende betekenis toe met de volgende beperkte objecten:

| Ontwerpobject | Minimale gegevens | Belangrijkste invariant |
| --- | --- | --- |
| Governancebeoordeling | Organisatie, verplichting/besluit, bronrevisie, onafhankelijke regel-/toepasselijkheids-/uitvoeringsbeoordeling, beoordelaar en tijdstip. | Een administratief completed-label bewijst geen uitvoering. Elke bevestiging heeft herleidbare onderbouwing. |
| Bewijsversie | Documentregister-ID, concrete bronversie of behouden vastlegging, vastleggingstijd, vertrouwelijkheid, eventuele SHA256 en intrekking/vervanging. | De beoordeling wijst naar de beoordeelde versie. Een hash zonder terugvindbare bron bewijst niet dat het bewijs later beschikbaar is. |
| Toestemmingsrecord | Geïdentificeerde persoon, organisatie, doel, reikwijdte, tekstversie, vastlegging en intrekking. | Geen algemene publicatierechten afleiden uit accountkoppeling of lidmaatschap. |

Gebruik voor formele aanvragen de bestaande goedkeuringsvoorraad waar dat veilig kan. Een nieuw governancetype moet een eigen voorzitterscontrole krijgen in zowel database als applicatie. Het mag niet ongemerkt de financiële goedkeurderslogica overnemen en geeft geen nieuwe financiële rol. De drie beoordelingen blijven domeingegevens, geen enkel algemeen goedkeuringsvinkje.

De toekomstige afrondingsoperatie wordt één transactie: organisatie en dossier controleren, revisie vergrendelen, bewijsversies en bevoegdheid controleren, beoordeling opslaan en audit schrijven. De huidige directe update in `src/app/app/administratie/actions.ts` en de generieke editor worden samen aangepast. Bestaande afgeronde dossiers krijgen geen automatische juridische opwaardering.

## 3 Partnerrollen en campagnerelaties

Behoud `partners`, `campaigns`, `campaign_deliverables` en `record_relationships`. Breid partnerorganisaties uit met meerdere expliciete rollen, geldigheid en optionele bewijsverwijzing. De hoofdclassificatie `partner_type` blijft tijdens de overgang beschikbaar voor bestaande schermen.

Een campagnerelatie krijgt een expliciet gekozen rol/bijdrage. De huidige automatische relatie `sponsor` in `20261006205557_atomic_campaign_and_relationships.sql` wordt vervangen via een nieuwe compatibel ontworpen RPC-versie, niet door de historische migratie te bewerken. De aanmaakformulieren, generieke editor, relatiechecks, filters, portal- en rapportselectie worden samen bekeken.

Historische sponsorrelaties worden niet automatisch ‘gecorrigeerd’: toon de bestaande classificatie voor beoordeling. Voor esportsorganisaties en communitypartners geldt geen sponsordefault. De overgang krijgt een proef met bestaande sponsor én niet-sponsor en behoudt lopende rapportages.

## 4 Publieke publicatie

Voeg een publicatierevisie toe met organisatie, brondossier, inhoudstype, slug/taal, expliciete publieke payload, revisiehash, goedkeuring voor die revisie, publicatieperiode en intrekking. Hergebruik contentdossiers en de goedkeuringsvoorraad; een publieke revisie is een beperkte weergave van een dossier, geen kopie van alle administratie.

Eerste voorgestelde veldselectie:

| Inhoud | Publiek na goedkeuring | Standaard uitgesloten |
| --- | --- | --- |
| Event | Titel, publieke beschrijving, begin/einde met tijdzone, publieke locatie, goedgekeurde media en inschrijflink. | Interne agenda, crew, boekingen, persoonlijke inschrijvingen, notities en financiën. |
| Nieuws | Titel, samenvatting, goedgekeurde tekst en media, publicatiedatum en toegestane auteursnaam. | Redactionele notities, interne bijlagen, privéaccounts en conceptrevisies. |
| Partner | Publieke naam, logo, goedgekeurde beschrijving, publieke rollen en links. | Contactpersoon, e-mail, contract, bedragen en onderhandelingsnotities. |
| Creator, later | Expliciet gekozen openbare profielvelden en media waarvoor toestemming/grondslag is vastgesteld. | E-mail, adres, identiteitsbindingen, privéanalytics en interne beoordelingen. |

Een serverinterface levert alleen geldige gepubliceerde revisies aan de afzonderlijke website. De precieze route wordt bij implementatie vastgelegd; er is nu geen nieuwe openbare endpoint. Browsercode krijgt geen service_role-sleutel. Een redactiewijziging maakt een nieuw concept; intrekken blokkeert ook afgeleide websiteweergaven en caches binnen de voorgestelde 60 seconden.

Staging vereist eigen configuratie, toegangsbeveiliging en noindex. DEV en productie blijven gescheiden. Het huidige domein en Google Sites blijven tot een afzonderlijk omschakelbesluit behouden. Er is geen hostingabonnement of DNS-wijziging voorbereid als automatisch uitvoerbare actie.

## 5 Metrieken en integraties

De F0.1-correctie van nul/ontbrekend blijft de basis. Campagnemetingen moeten verder worden voorzien van bron, definitie, meetvenster, ophaaltijd en dekking voordat er vergelijkingen of sponsorclaims worden gemaakt. Huidige sommen van impressies zijn geen uniek bereik.

Privécreatorinzichten worden niet toegevoegd onder de huidige algemene ledenleespolicy. Eerst doelgerichte account-/campagnerechten, intrekking en audit ontwerpen. Een nieuw platform of een OAuth-koppeling bewijst nog geen recht op iedere metriek of publicatieactie.

Discordbot, website, Streamer.bot en agents communiceren via beperkte contracten. Botdatabasecredentials, automatische verdienregels en StreamElements-saldo-overname horen niet bij deze schemafase. Google Workspace blijft bron- en samenwerkingstool; Assist Online blijft de boekhoudkundige bron. Merken en organisaties worden niet stilzwijgend samengevoegd.

## 6 Volgorde van de eerste implementaties

1. Gecontroleerde koppeling verenigingslid–persoon–account, met negatieve organisatie- en roltests.
2. Bewijsversies en governancebeoordeling, inclusief de voorzitterscontrole en gezamenlijke aanpassing van alle schrijfpaden.
3. Expliciete partnerrollen, met behoud van bestaande relaties en rapportages.
4. Publicatierevisie en de volledige CC–stagingwebsiteketen voor één event en één nieuwsbericht.
5. Campagneproef met toegestane bronnen en betrouwbare meetstatussen.

Elke stap krijgt een afzonderlijke wijzigingsset, passende migratie en gerichte DEV-acceptatie. Geen grote gecombineerde datamigratie voor alle domeinen.
