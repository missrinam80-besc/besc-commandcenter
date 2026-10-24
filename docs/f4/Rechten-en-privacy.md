# Rechten, eigen toegang en privacy

## Actor-/actiematrix voor de bouw

| Actor | Lezen | Schrijven / besluiten | Expliciet uitgesloten |
| --- | --- | --- | --- |
| Niet-aangemeld | Nu geen gesloten stagingdata. Later uitsluitend expliciet publiek vrijgegeven projecties. | Eerste F4-versie geen aanvraag zonder aanmelden | Eigen status, contactvelden, interne bronrecords, consent-/review-ID’s |
| Extern eigen account | Eigen profielvoorstellen, verklaringen, ontvangst en toegestane aanvraagstatus | Eigen voorstel indienen, eigen aanvraag intrekken, doelkeuze persoonlijk bevestigen/intrekken | Zelf goedkeuren, rol/mandaat claimen, andere eigenaar kiezen |
| Gedelegeerde partnervertegenwoordiger | Alleen eigen expliciet gedelegeerde partnerprojectie en aanvragen | Beperkt partnerprofielvoorstel; delegatie opnieuw controleren bij commit | Contracten/financiën of andere contacten op grond van publiek partnerlabel |
| Publication editor | Toegestane concepten en bronvelden | Concept voorbereiden en indienen | Persoonlijke verklaring simuleren; sollicitatiemotivatie lezen enkel door deze rol |
| Onafhankelijke publication reviewer | Exacte toegestane revisie en benodigd bewijs | Akkoord of wijzigingen vragen op hash; eigen voorstel niet goedkeuren | Automatische live vrijgave of nieuwe accountrechten |
| Vacature-/aanvraagbehandelaar | Alleen toegewezen categorie-/organisatieaanvragen met minimale PII | Status/toewijzing en eigen behandelingsnotitie; motivatie binnen taak | Publiceren van sollicitatiegegevens, algemene persoonsexport |
| Voorzitter | Bestaande governancebevoegdheid; benodigde formele bronstukken | Bevoegde taken expliciet toekennen/beëindigen en beleidsbesluiten vastleggen | Onbegrensde publieke of privé-inzage afleiden uit voorzitterschap |
| Technisch beheer / server | Alleen noodzakelijke beperkte serviceactie met audit | Afgebakende media-/API-verwerking, hercontrole van actor/context bij commit | Zelf beslissen over profielen, aanstelling of publicatie |

Nieuwe aanvraagbehandelingsrollen zijn voorstellen, geen bestaande toekenningen. Hergebruik F1-publicatietaken waar hun betekenis past; breid geen bestaande rol stilzwijgend uit naar sollicitatie-PII.

## Externe accountcontext

Websitecookie blijft hostgebonden en los van CC. Een gecontroleerde identiteit en actuele, niet-ingetrokken sessie zijn nodig voor eigen gegevens. De server leidt user, organisatie/site, eigenaarschap en taak af; een formulier mag deze niet zelf bepalen. Iedere eigen read en write controleert dezelfde actuele binding. Toegang voor stagingtesters wordt niet automatisch uitgebreid naar alle Auth-gebruikers.

Nieuwe externe toegang mag niet afhangen van een intern `organization_members.role=member`-record. Het bestaande trigger-/account-contactpad en `resolveAuthenticatedHome` moeten daarom worden beoordeeld: geen automatisch intern lidmaatschap om Mijn BESC te laten werken. Verificatie, duplicaat/conflict en partnerdelegatie zijn afzonderlijke toestanden. Ontkoppelen/herkoppelen migreert geen oude toestemmingen naar een ander account.

## Publieke profielen en aanvragen zijn verschillende doelen

Creatorpublicatie vereist exact doel, versie, gekozen velden en mediarechten. Deelname aan een campagne, lidmaatschap, rol creator, ondertekende samenwerking of nieuwsbriefinschrijving vervangt die keuze niet. De eigenaar bevestigt zelf. Een medewerker mag alleen een externe verklaring met passend bewijs registreren via de bestaande gecontroleerde procedure; geen automatische opt-in tijdens import.

Een sollicitatie of samenwerkingsaanvraag blijft privé, ook als het organisatieprofiel publiek is. Rechtsgrond/doeltekst/bewaarbehandeling moeten door BESC worden vastgesteld; dit document kiest geen juridische grondslag of vaste bewaartermijn. Aanvraagintrekking stopt verdere behandeling volgens dat beleid en wist niet stilzwijgend verantwoord te bewaren audit. Geen marketing- of profieltoestemming in dezelfde checkbox verstoppen.

## Hercontrole en intrekking

Bronarchivering, doel-/veldscope-intrekking, accountontkoppeling, verlopen delegatie, rolintrekking, verlopen publicatievenster en ingetrokken mediarechten blokkeren nieuwe reads, publicatie en lopende commits. Commit legt sessie/bronversie/consent/taak opnieuw vast; herhaal-ID is geen omweg rond actuele autorisatie. Private notities komen nooit in eigen statusprojecties of zoekindex.

Iedere nieuwe tabel in een publiek schema krijgt RLS en minimale grants; bij voorkeur private operationele opslag zonder direct client-CRUD. Een servicekey op de server geeft geen productbevoegdheid. Bestaande private F3-metingen blijven buiten profielen, portalen, MCP- en algemene exports. Logging bevat request-ID/categorie/status, geen tokens, motivatie of volledige payload.

Intrekking moet ook kaart, detail, zoekfilter, profielafbeelding, eigen browserweergave en herhaalde publieke API-reads raken. Maximaal 60 seconden is een bouw-/acceptatiedoel voor normale actieve BESC-weergave, geen bewezen grens voor alle F4-varianten en geen controle over al gedownloade bestanden of screenshots.
