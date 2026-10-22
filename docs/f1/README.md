# F1 — gedeelde werkstromen

Gebouwd op 21 oktober 2026 op expliciete opdracht: **alle zes werkpakketten bouwen en testen**. Het pakket bevat databasebeveiliging, schermen, integraties met de bestaande dossiereditor en geïsoleerde acceptatieproeven. Op 22 oktober zijn de zes migraties op Cloud DEV uitgevoerd, PR #112 gemerged, de exacte webimage bevestigd en de aangewezen voorzittersbinding uitgevoerd. Gerichte schermacceptatie is uitgevoerd. Zie [DEV-uitvoering en afsluitvoorwaarden](../acceptatie/F1-DEV-20261022.md) voor de actuele stand en [implementatie en testbewijs](Implementatie-en-testbewijs.md) voor het eerdere bouwbewijs.

## Doel en vertrekpunt

F1 levert de gedeelde basis voor aantoonbare governance, meervoudige partnerrollen, doelgerichte toestemming en gecontroleerde publicatierevisies. Het bestaande CC blijft de administratieve kern. De website, Discordbot, Streamer.bot en agents gebruiken later dezelfde beperkte contracten, met afzonderlijke repositories en releases.

F0 is technisch op DEV geaccepteerd: de exacte webimage van commit `594392cef96c2e9eb86ac93ea5b476f15038757e`, 117 geregistreerde historische migraties, behoud van de oorspronkelijke 84, gelijkblijvend gecontroleerd schema en door Linda geaccepteerde meetweergave/exports. Zie [uitvoeringsbewijs](../acceptatie/F0-UITVOERING-DEV-20261021.md). De ontbrekende seed `20261001110000` blijft uitgezonderd; de vijf actuele kennisbankconcepten zijn uitsluitend voorbereid. Deze uitzondering wordt niet stilzwijgend opgeheven door F1.

## Leesroute

1. [Werkpakketten en oplevervolgorde](Werkpakketten.md): zes afzonderlijk toetsbare onderdelen en hun afhankelijkheden.
2. [Identiteit, bevoegdheid en governance](Identiteit-en-governance.md): accountbinding, bootstrap, besluit/bewijs/review en onbekende termijnen.
3. [Toestemming en toegang](Toestemming-en-toegang.md): doelen, gegevensgrenzen, actor-/actiematrix en intrekking.
4. [Partnerrollen en publicatiecontract](Partners-en-publicatie.md): compatibele overgang en het begrensde contract voor F2.
5. [Schema, migraties en release](Schema-en-release.md): objecten, invarianten, gecontroleerde migratievolgorde en terugval.
6. [Code-impact en bronregister](Code-impact-en-bronnen.md): concrete bestaande schrijfpaden en eisen uit het masterplan.
7. [Acceptatie en DEV-draaiboek](Acceptatie.md), met [machineleesbare proefgevallen](acceptatiegevallen.json).
8. [Beslispunten en risico's](Beslispunten-en-risicos.md): voorstellen, bevestigde keuzes en voorwaarden vóór live gebruik.
9. [Datacontracten](Datacontracten.md): minimale velden, versie-/referentievoorwaarden, unieke sleutels en grantreview per modelelement.

## De eerste bouwvolgorde

| Onderdeel | Resultaat | Afhankelijk van |
| --- | --- | --- |
| F1.1 | Verenigingslid–persoon–geverifieerd account; bevoegdheidscontrole zonder adminomweg. | F0; expliciete procedure voor eerste geverifieerde binding. |
| F1.2 | Versiegebonden regel-, toepasselijkheids- en uitvoeringsbeoordeling; besluiten en bewijs. | F1.1. |
| F1.3 | Doelregister, toestemmings-/intrekkingsrecords en consistente toegangscontrole. | F1.1; voorgestelde datagrenzen. |
| F1.4 | Meervoudige partnerrollen en expliciete bijdrage aan campagnes. | F0; kan lokaal worden gebouwd naast F1.2/F1.3, na eigen review. |
| F1.5 | Interne publicatierevisie, veldselectie, revisiegoedkeuring en contract voor de website. | F1.2/F1.3/F1.4 voor de relevante inhoud en rechten. |
| F1.6 | Gezamenlijke negatieve rechtenproeven, herstel-/releasebewijs en DEV-acceptatie. | Alle voorgaande wijzigingen afzonderlijk groen. |

Dit is een volgorde, geen toegezegde kalenderplanning of toestemming voor parallel agentwerk. Iedere wijzigingsset omvat app, databasebeveiliging, passende tests en documentatie. Geen database-only tussenrelease die de oude UI onbruikbaar maakt of tijdelijk een formele controle overslaat.

## Wat bij latere fases hoort

F2 bouwt de eigen afgeschermde stagingwebsite en bewijst de volledige event-/nieuwsketen, inclusief intrekking uit caches. F3 bewijst campagneaanlevering en bronmetingen. F4 voegt publieke creator-/esports-/vrijwilligersfuncties toe. F5 behandelt extra connectors, botworkflows en de streamadapter. F6 behandelt productie, DNS en afzonderlijk goedgekeurde overnames.

F1 bereidt die interfaces voor en bouwt de interne voorwaarden. F1 accepteert geen complete website, Metricool-vervanging, nieuwe socialscopes, automatische beloningen, StreamElements-saldo-overname of nieuwe Streamer.bot-configuratie. Bestaande uitgeschakelde functies blijven uit. Automatische back-ups blijven uit tot de goedgekeurde productie-inrichting.

## Definitie van voorbereid en gereed

**Voorbereid** betekent: gedrag, betrokken code, model, rechten, omwegen, migratieaanpak, testgevallen, terugval en menselijke beslispunten zijn beschreven. Dit pakket voldoet daaraan; open beleidskeuzes zijn herkenbaar als voorstel en blokkeren alleen hun afhankelijke live stap.

**F1 gebouwd** vereist geïmplementeerde wijzigingen plus groene geïsoleerde tests/CI. **F1 gemigreerd/deployed** is voor Cloud DEV aangetoond in het uitvoeringsverslag. **F1 op DEV geaccepteerd** vereist de proeven en menselijke bevestiging uit het draaiboek, met expliciet benoemde beperkingen. Het actuele verslag onderscheidt bewezen schermproeven van uitsluitend geïsoleerde dekking en resterende afsluitvoorwaarden.
