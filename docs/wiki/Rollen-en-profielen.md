# Rollen, bestuursfuncties en profielen

[← Wiki-startpagina](README.md)

Deze pagina is de handleiding voor **Rechtencontrole** en **Gebruikers & toegang**. De app toont de keuzes en de rechtenmatrix; de uitleg staat hier. Dit model is voorbereid voor DEV. Pas de bijbehorende migratie toe vóór de nieuwe image wordt gedeployed.

## Basisrollen

| Rol | Doel en toegang |
| --- | --- |
| Admin | Volledige controle over de interne app, gebruikers, rechten, integraties en import. |
| Bestuur | Organisatie, dossiers, planning, content en rapportage op hoog niveau. Geen integraties, rechtencontrole, gebruikersbeheer of CSV-import. Financiële administratie en formele beslissingen vereisen een toegewezen functie. |
| Crew | Vast lid en structurele ondersteuner van BESC. Samenwerking in projecten, events en content; geen technisch beheer. |
| Vrijwilliger | Sporadische ondersteuning: eigen werk, kalender, kennisbank en eigen kosten indienen. |
| Streamteam | Toegang tot het eigen streamerportaal met gekoppelde inzetten, deliverables, ontwikkeling en resultaten. Geen interne app door deze toekenning. |
| Sponsor | Toegang tot het eigen sponsordossier met gekoppelde campagnes, deliverables en resultaten. Geen interne app door deze toekenning. |

De technische codes blijven `admin`, `board`, `member` en `volunteer`. `member` heet in de app **Crew**. Streamteam en Sponsor zijn afzonderlijke dossiergebonden portaaltoekenningen (`streamer` en `sponsor`), geen interne lidmaatschappen. Eén persoon kan bijvoorbeeld Crew én Streamteam zijn; portaaltoegang verleent nooit vanzelf Crew-toegang.

## Bestuursfuncties

In **Gebruikers & toegang** kies je eerst Bestuur en vink je vervolgens de functies aan. Goedkeurder en Boekhouder zijn onafhankelijk toekenbaar; dezelfde persoon kan beide hebben. Admin behoudt volledige controle.

| Keuze | Technische opslag | Bestaande bevoegdheden |
| --- | --- | --- |
| Geen functie | `none` | Bestuurlijk overzicht; geen impliciet financieel beheer of formele goedkeuring. |
| Goedkeurder | `approver` | Kan als bestuurslid de formele aanvragen behandelen en financiële dossiers verwerken. |
| Boekhouder | `treasurer` | Financiële dossiers, budgetten, inkomsten, kosten en bewijsstukken beheren; binnen de bestaande financiële workflow ook kosten beoordelen. Geen algemene goedkeuring van content, documenten of e-mails. |
| Beide | `approver_treasurer` | Combinatie van beide functies. |

De financiële workflow behoudt haar bestaande brede bevoegdheden voor financiële functies; dit is geen nieuwe boekhoudapp of nieuwe scheiding tussen invoer, betaling en financiële goedkeuring. `submitter` blijft compatibel met oude toekenningen, maar is geen nieuwe basisrol: interne gebruikers kunnen hun eigen kosten indienen.

Nieuwe financiële functies worden aan Bestuur of Admin toegekend. Ongewijzigde oude financiële toekenningen aan Crew/Vrijwilliger blijven behouden; beoordeel die per persoon via Gebruikers & toegang. De migratie verplaatst geen accounts, activeert niemand en wijzigt geen bestaande roltoekenning.

## Rollen bekijken en toekennen

1. Open **Rechtencontrole** als Admin. Kies een van de zes rollen.
2. Bij Bestuur kies je de functiecombinatie om het effect in de matrix te bekijken. Dit verandert geen account.
3. Open **Gebruikers & toegang** om een persoon een interne rol en eventuele functies toe te kennen. Kies de accountstatus en sla op.
4. Gebruik **Portaaltoegang** om Streamteam aan een communitypersoon of Sponsor aan een partnerdossier te koppelen. Trek toegang via hetzelfde venster weer in.

Een portaaltoekenning is actief als de gekoppelde toegang actief is. De interne accountstatus regelt de interne app; schorsen van een intern lidmaatschap trekt niet automatisch diens afzonderlijke portaaltoegang in. Voor volledig intrekken moet Admin dus ook de portaaltoegang intrekken.

## Aanvullende rolprofielen

Rolprofielen blijven beschikbaar in het ingeklapte onderdeel onder de rolkeuzes. Een profiel kan toegestane extra operationele bevoegdheden bevatten. De basisrol en financiële basisrol zijn bedoeld voor de profielvoorvertoning; het echte account behoudt zijn eigen opgeslagen rol en bestuursfuncties. Een profieltoekenning vervangt die niet.

Technisch beheer en financieel beheer worden niet via extra bevoegdheden gedelegeerd. Alleen Admin beheert gebruikers, integraties, rechten en import. Financiële toegang volgt de expliciete financiële functie. Een oud profiel met zulke extra bevoegdheden omzeilt deze grenzen niet. Verwijderen van een profiel koppelt het los van gebruikers; hun basisrol blijft bestaan.

## Website en eigen profielpagina’s

Streamteam en Sponsor vormen de twee externe toegangsdoelen voor de publieke BESC-website. In het Command Center bestaat nu dossiergebonden, alleen-lezen portaaltoegang op `/portal`. Die toegang bewijst nog geen werkende website-login of zelf bewerkbare publieke profielpagina.

Voor de websitekoppeling moet de website dezelfde identiteit en actieve portaaltoekenning verifiëren, uitsluitend het eigen gekoppelde dossier tonen en bewerkbare profielvelden afzonderlijk afschermen. Publiek zichtbare gegevens en privévelden blijven gescheiden. Publicatie, financiële velden en rechten worden nooit vrijgegeven door alleen een Streamteam- of Sponsorlabel. Deze PR bouwt die aparte websitefunctionaliteit niet.

## Technische controle en uitrol

- De pagina, navigatie, serveracties, import-API en databasepolicies sluiten technisch beheer af voor Bestuur, Crew en Vrijwilliger.
- De matrix volgt de zichtbaarheid van de routes; verborgen modules geven geen misleidende algemene schrijftoegang.
- Migratie: `supabase/migrations/20261007152913_besc_role_management.sql`. Breidt de financiële waarden uit, beperkt integraties en roltoekenningen tot Admin en koppelt formele beoordelingen aan toegewezen functies.
- Na merge: migratie op Cloud DEV, GitHub-imagebouw, bestaande serverdeploy en live controle met relevante accounts. Er worden geen accounts automatisch opnieuw geactiveerd of rollen toegewezen.

## Accounts zijn ook contacten

Een account met actieve interne toegang of actieve portaaltoegang krijgt een gekoppelde persoonsfiche onder **Community & vrijwilligers**. Nieuwe aanmeldingen die nog wachten op goedkeuring krijgen niet alleen door registratie automatisch een contact. Een contact zelf geeft geen apprechten of portaaltoegang.

De koppeling gebruikt `account_user_id` binnen dezelfde organisatie. Bestaande expliciete koppelingen worden hergebruikt. Een eenduidig Streamteam-portaaldossier wordt als bestaand contact gebruikt. Anders kan precies één bestaand contact met hetzelfde bevestigde account-e-mailadres worden gekoppeld; vergelijking negeert hoofdletters en buitenste spaties. Een gelijkende naam leidt tot handmatige controle voordat een nieuw contact wordt aangemaakt; namen worden nooit gebruikt om personen automatisch samen te voegen. Bestaande namen, gegevens, rollen, status, documenten en historie blijven bewaard.

Zonder bestaande match wordt een contact aangemaakt met de accountnaam en het bevestigde e-mailadres, indien beschikbaar. Als uitgangspunt krijgt een nieuw contact type Crew voor Admin/Bestuur/Crew, Vrijwilliger voor een actief vrijwilligersaccount, Streamer voor uitsluitend Streamteam-portaaltoegang en Extern voor uitsluitend sponsorportaaltoegang. Het nieuwe contact krijgt Contactpersoon plus de passende beginrol. Dit verleent geen rechten. Latere contactrollen en contactstatus worden afzonderlijk beheerd; wijzigen of schorsen van apprechten herschrijft die niet.

Bij meerdere mogelijke contacten, een portaaldossier dat al aan een ander account gekoppeld is of een eerder verwijderd accountcontact wordt niets automatisch samengevoegd of hersteld. **Gebruikers & toegang** toont deze ontbrekende koppelingen. Admin kiest **Contact koppelen** en selecteert expliciet het juiste bestaande contact. Een contact dat al aan een ander account verbonden is kan niet worden overgenomen. Indien nodig maak je eerst een nieuw contact aan en koppel je het daarna. De knop **Contact openen** voert rechtstreeks naar de gekoppelde fiche; de communitylijst toont **Account gekoppeld**.

Schorsen of intrekken van toegang verwijdert de contactfiche niet. Een ongewijzigde historische accountkoppeling blijft geldig bij het bewerken van een contact. Een nieuw gekozen account mag actief zijn of nog wachten op goedkeuring tijdens intake. Het activeren van een contact verandert nooit het lidmaatschap of portaalrechten.

Migratie `20261008065014_account_community_contacts.sql` vult bestaande accounts met toegang aan en voegt dezelfde opvolging toe bij het verlenen van nieuwe toegang. De automatische onderhoudsfuncties zijn privé en niet rechtstreeks uitvoerbaar door clients. De handmatige koppelactie controleert Admin-bevoegdheid en organisatiegrenzen. Er worden geen e-mails verstuurd en geen externe agentruns gestart.

## Intake vanuit contacten en sponsorbedrijven

In Community & vrijwilligers kies je bij aanmaken of bewerken het bestaande gebruikersaccount. Ook accounts in afwachting kunnen worden gekoppeld. Dit activeert geen lidmaatschap, verandert geen functies en verleent geen portaaltoegang. Uitnodigen en toegang goedkeuren blijven aparte stappen in Gebruikers & toegang. Eén account hoort bij maximaal één levende centrale persoonsfiche per organisatie.

Een sponsorfiche is een bedrijf. Onder Contactpersonen kun je meerdere bestaande individuele contacten uit Community & vrijwilligers koppelen. Dezelfde persoon kan contactpersoon voor meerdere bedrijven zijn; binnen hetzelfde bedrijf voorkom je dubbele koppelingen. Naam en e-mail worden bij gekoppelde personen vanuit hun centrale fiche weergegeven. Functie bij het bedrijf, primair contact en CRM-historie blijven bij de sponsor horen. Met Contactfiche en account openen beheer je hun gebruikersaccount op de centrale persoonsfiche.

Een afzonderlijke CRM-contactpersoon zonder centrale persoonsfiche kan ook direct een actief of wachtend gebruikersaccount krijgen via Koppeling opslaan. Bij koppeling aan een centrale persoon wordt diens account de bron; een conflicterend apart account wordt geweigerd. Koppelingen maken geen Auth-account aan en sturen geen e-mail. Alleen Admin en Bestuur kunnen contactidentiteiten beheren; apprechten en portaaltoegang blijven voor Admin.

Na `20261008065014_account_community_contacts.sql` volgt migratie `20261008070508_contact_account_intake.sql`. Die voegt CRM-persoonskoppelingen en accountkoppelingen toe, bewaakt organisatiegrenzen en voert contactaanmaak en wijziging van het primaire contact samen uit. Bij een mislukte koppeling blijft het bestaande primaire contact behouden.
