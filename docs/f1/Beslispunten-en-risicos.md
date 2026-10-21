# F1 beslispunten en risico's

[F1-overzicht](README.md). Linda's opdracht betreft volledige voorbereiding. Onderstaande voorstellen zijn concreet genoeg om per werkpakket te beoordelen; ze zijn niet stilzwijgend formeel vastgesteld of live toegepast.

## 1 Bevestigd

- Masterplan v2 is de richting; bestaande architectuur en afzonderlijke repositories blijven behouden.
- De voorzitter controleert bewijs en keurt bestuursbesluiten/verplichtingen formeel goed. Dat mag dezelfde functie zijn, met afzonderlijke herleidbare handelingen.
- Automatische back-ups pas bij de goedgekeurde productie-inrichting; nu alleen handmatige voorbereiding/uitvoering waar geautoriseerd.
- Verdere streamkitinrichting en saldomigratie later; geen automatische verdienregels activeren.
- Google Sites wordt later vervangen, domein blijft; geen productie-/DNS-omschakeling in F1.
- Vijf actuele kennisbankconcepten voorbereiden. Oude seed niet publiceren of als historisch uitgevoerd voorstellen.

## 2 Beslissingen vóór afhankelijke live stappen

| ID | Concreet voorstel | Nog benodigd feit/besluit | Wanneer blokkeert dit? |
| --- | --- | --- | --- |
| F1-D01 | Expliciete bootstrap voor één geverifieerde lid–persoon–account–voorzitterketen; buiten algemeen adminbeheer, onderbouwd en geaudit. | Gecontroleerde benoemingsgrond, exact account en bevoegde verificatie-/onderhoudsuitvoerder. Geen persoonsnaam in dit ontwerp ingevuld. | Vóór eerste echte formele binding; synthetische lokale tests kunnen doorgaan. |
| F1-D02 | Voorzitter kan afzonderlijk reviewen en beslissen; geen automatische vervanging of adminfallback bij afwezigheid, ambigu mandaat of persoonlijk belang. | Behandel-/vervangingsbesluit bij die concrete situatie. Expliciet beoordelen of eigen dossierinvoer extra voorwaarden vraagt. | Vóór zo'n dossier formeel wordt behandeld, niet voor bouwen van de weigering. |
| F1-D03 | Bestuurlijk bewijs standaard beperkt; financieel bewijs vraagt aanvullende financiële inzage. | Welke concrete dossierbehandelaars inzage krijgen en volgens welk doel. | Vóór echte vertrouwelijke stukken aan het nieuwe model worden gekoppeld. |
| F1-D04 | Doelen voor profielpublicatie, campagne en privéinsights gescheiden; tekst-/scopewijziging vraagt nieuw akkoord; intrekken stopt toekomstig afhankelijk gebruik. | Doeltekst, vastgestelde grondslag, doelgroep en retentie-/rechtenverzoekbehandeling. | Per doel vóór activering; geen fictieve wettelijke termijnen of toestemmingstekst als ‘goedgekeurd’. |
| F1-D05 | Publicatiebeslisrol expliciet gescheiden van conceptredactie en van algemeen bestuurs-/financieel beheer. | Wie event en nieuws mag vrijgeven, eventuele voorwaarden voor eigen inzending, welke velden/mediarechten definitief toegestaan zijn. | Vóór echte revisies als publicatiegereed worden goedgekeurd. |
| F1-D06 | Centrale intrekking direct; voorgestelde publieke doorwerking binnen 60 seconden, met beperkte caches. | Vaststelling technische bovengrens en staginghosting/authenticatie. | F2 publieke keten; F1 interne intrekking/testcontract kan worden gebouwd. |
| F1-D07 | Rollen sponsor/esports/community/event/education/social_impact; bestaande classificatie behouden als legacy. | Rollenlijst en expliciete beoordeling van eventuele concrete oude relaties. | Vóór rollenlijst live; geen automatische historische herclassificatie. |
| F1-D08 | Oude seed als inhoudelijk vervangen documenteren in latere baseline; nooit ‘uitgevoerd’ veinzen. | Expliciete beslissing over definitieve baselineafhandeling; concepten invoeren/publiceren zijn aparte keuzes. | Algemene migration push/reset/squash blijft geblokkeerd; exact geselecteerde nieuwe F1-migraties hebben eigen procedure. |

Deze punten zijn geen reden om de al bevestigde richting opnieuw te bevragen. De voorbereiding kan volledig klaarstaan terwijl een eerste echte persoonsbinding of doelactivering nog expliciete feiten nodig heeft. Dit pakket kent geen deadlines, eigenaren, budgetten of juridische bevoegdheid toe.

## 3 Risicobehandeling

| Risico | Gevolg | Concrete beheersing / acceptatie |
| --- | --- | --- |
| E-mailmatching of gewijzigd persoonsaccount erft een mandaat | Onbevoegde formele beslissing. | Exact geverifieerde bindingsrevisie; hercontrole op mutation; I01–I09. |
| Admin/generieke editor/directe RPC omzeilt voorzitterscontrole | Vals bewezen dossier. | Geen directe formele grants; alle mutaties samen aanpassen; R01–R04/G01–G12. |
| Nieuw beperkend beleid laat oude permissieve policy bestaan | Vertrouwelijke metadata blijft leesbaar. | Bestaande policies en alle bronprojecties gericht herzien; D01–D05. |
| URL/hash bestaat, maar beoordeelde inhoud niet meer | Onderbouwing niet reproduceerbaar. | Behouden bewijsversie, bereikbaarheid/authenticiteit apart, herbeoordeling bij vervanging; G03/G04/G09. |
| Mandaat of toestemming wijzigt gelijktijdig | Stale toestemming wordt alsnog gebruikt. | Eén transactiebeslissing, vaste locks, actuele voorwaarden en echte concurrencyproeven. |
| Bewijs-/reviewdata verdwijnt via cascade | Historie niet meer herleidbaar. | Referentiebehoud/restrictie, gecontroleerde archivering; G12. |
| Nieuwe partnerrol wordt sponsor- of inzagerecht | Verkeerde rapportage of datatoegang. | Expliciete bijdrage, legacybehoud, portal-/rapportproeven; P01–P07. |
| Conceptwijziging erft publicatiegoedkeuring | Onbeoordeelde of private inhoud publiek. | Onveranderlijke payload/hash, nieuwe revisie en allowlist; U01–U10. |
| Terugval opent oude mutatieomweg | Rechtenbeperking tijdelijk weg. | Schema-guards blijven; geteste oude-imagecompatibiliteit of gerichte onderhoudsroute. |
| Algemene migratieprocedure voert oude seed alsnog uit | Ongevraagde publicatie/overschrijving. | Exact manifest; geen include-all/reset/repair-all; E01/E02. |
| Geïsoleerde test wordt als live integratiebewijs gepresenteerd | Onterechte gereedverklaring. | Bewijsniveaus en uitslagen gescheiden per omgeving; geen vooraf ingevulde acceptatie. |

## 4 Grenzen van opvolging

Nieuwe notificaties, periodieke hercontrolejobs, bronconnectors of externe intrekkingsacties worden alleen ingevoerd als de betreffende implementatie dat nodig heeft en haar uitvoering geautoriseerd is. Een ontworpen opvolgtaak activeert geen automatisch bericht, aangifte, Workspace-mutatie of agent. Productie- en volledige herstelacceptatie blijven eigen poorten.
