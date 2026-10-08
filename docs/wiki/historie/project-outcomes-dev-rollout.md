# Projectdoel, oplevering en afsluitevaluatie

> Historische notitie. Dit document bewaart het ontwerp of de controle op de genoemde datum; het is geen actuele werkvoorraad. Zie de [wiki](../README.md) en [huidige releasewerkwijze](../Release-en-acceptatie.md).

## Gedrag

Vier afzonderlijke projectvelden: doel, op te leveren resultaten, oplevercriteria en afsluitevaluatie. Ze zijn optioneel zolang een project wordt voorbereid of uitgevoerd. Het aanmaakformulier vraagt de eerste drie; het bewerkformulier bevat alle vier. Het dossier toont ieder veld en benoemt ontbrekende informatie. De bestaande beschrijving blijft behouden; er wordt geen doel uit vrije tekst afgeleid.

Bij een nieuwe expliciete overgang naar Afgerond moeten alle vier velden gevuld zijn. De server controleert de overgang en de database bewaakt dezelfde regel, ook voor andere schrijfroutes. Alleen witruimte geldt als ontbrekend. Geen automatische statuswijziging, nieuwe status, doelbehaaldclaim of bestuursgoedkeuring. De projectbeheerder blijft de uitkomst beoordelen. Het invullen van de velden is geen bewijs dat alle resultaten of criteria behaald zijn.

Historisch afgeronde projecten behouden hun status en blijven bewerkbaar zonder backfill of verzonnen evaluatie. Na heropenen geldt de controle opnieuw bij een volgende afsluiting. Ontbrekende velden in oudere serverformulieren overschrijven bestaande informatie niet; expliciet leeg gemaakte velden worden null.

## Grenzen

De gegevens zijn dossierregistraties, geen apart risico-/changeregister of nieuwe boekhouding. Taken, mijlpalen, gekoppelde bewijsdocumenten en KPI's blijven hun eigen bron. Geen publicatie, rolwijziging, betaalde agentrun of externe connector toegevoegd. De bestaande Project-rechten, audit en fysieke-deletegrens blijven behouden.

## Validatie

Servertests controleren verplichte afsluitinformatie, expliciete afsluiting, historische projecten, behoud bij weggelaten velden, aanmaken en afzonderlijke formulierwaarden. PGlite voert de echte migratie uit en controleert onvolledige/volledige UPDATE en INSERT, witruimte, veldlengte, heropenen, behoud van historische data/RLS/audit en uitvoering met authenticated zonder rechtstreekse helperuitvoering.

De volledige testsuite, TypeScript, lint en GitHub-build moeten slagen voor merge. Lokale controles zijn geen bewijs van live DEV-acceptatie.

## Uitrol

1. PR controleren en mergen, DEV-imagebouw afwachten.
2. Migratie 20261006175008_add_project_outcomes op de bevestigde Cloud DEV-database toepassen en registreren.
3. Direct daarna de nieuwe DEV-image via Termius uitrollen. Tussen migratie en deployment kan de oude app een nieuwe afsluiting niet uitvoeren omdat de vier nieuwe velden daar nog niet beschikbaar zijn.
4. TESTFIXTURE — NIET PUBLICEREN-project gebruiken: velden opslaan/heropenen, onvolledige afsluiting geweigerd, volledige expliciete afsluiting opgeslagen, bestaande taken/mijlpalen/relaties behouden. Testdata na afloop opruimen.

Live migratie en deployment zijn nog niet uitgevoerd.
