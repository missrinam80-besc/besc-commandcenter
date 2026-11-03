# RE01 — Bucks, catalogus, reserveringen en correcties

Gebouwd op 3 november 2026. Alleen lokale bouw en gerichte controles; geen Cloud-migratie, uitrol, saldo- of rechtenwijziging.

## Bestaande basis behouden

Eigen saldo en historiek, configureerbare catalogus, vaste aanvraagprijs en omschrijving, transactionele reservering van Bucks en voorraad, onafhankelijke goedkeuring, afwijzen/annuleren en eenmalige levering blijven werken. Een handmatige toekenning wordt via een tegenboeking gecorrigeerd. De bot houdt zijn bestaande persoonlijke lees-, aanvraag- en annuleerrechten. Automatisch verdienen en saldo-overname worden hiermee niet ingeschakeld.

## Afgebouwd

- Een andere bevoegde beheerder kan een **goedgekeurde maar nog niet geleverde** beloning terugbetalen. Bedrag en verwijzing komen uit de oorspronkelijke besteding, niet uit de huidige catalogus. Reden en expliciete bevestiging zijn verplicht. XP en andere reserveringen blijven gelijk; de niet geleverde voorraad wordt weer beschikbaar. De status wordt `refunded`; de boeking heeft `kind=refund` en `correction_of` verwijst naar de oorspronkelijke besteding. Oorspronkelijke boekingen worden niet gewist.
- Terugbetaling is idempotent, versiegebonden en onder dezelfde aanvraag- en rekeninglocks verwerkt. De aanvrager kan de eigen terugbetaling niet uitvoeren. Terugbetalen na ontkoppeling blijft mogelijk; dit verleent geen toegang of nieuwe verdienrechten.
- Geleverde beloningen krijgen geen gewone terugbetaalknop. Een eventuele retour van een werkelijk geleverd goed vereist een afzonderlijke retourafspraak; dit pakket veronderstelt geen ontvangst of voorraadretour.
- Aanvragen, deelnemers/saldi, catalogus en historiek hebben eigen beheerweergaven met begrensde zoekopdracht en paginering. Statusfilters gelden voor aanvragen. Namen bij aanvragen en boekingen komen uit de bijbehorende rij en zijn niet afhankelijk van de deelnemerspagina. Ook oude saldi van ontkoppelde accounts blijven zichtbaar voor beheer; die accounts zijn niet selecteerbaar voor nieuwe toekenningen.
- Historiek toont de actor en de verwijzing van een tegenboeking; reeds gecorrigeerde toekenningen bieden geen tweede correctie aan. Eigen aanvragen tonen de vastgelegde omschrijving.
- Een leeg of onvolledig opslagantwoord wordt niet meer als succes gemeld.
- De bot accepteert en toont de nieuwe status en het nieuwe boekingstype, zonder nieuwe scopes, commando's of beheeracties.

## Migratie en volgorde

`20261103164042_re01_reward_refunds_and_management.sql` verruimt uitsluitend de twee bestaande status/kind-checks, voegt een begrensde private beheerprojectie toe en vervangt de bestaande private operatie met behoud van de ACL/owner. Geen nieuwe tabellen, seeds, standaardbeloningen of updates van bestaande rijen. De wrappers blijven invoker en de helper krijgt geen directe toegang voor anon/authenticated.

Na afzonderlijke goedkeuring: beide code-PRs; vóór Cloud DEV de actuele historie (verwacht 140) en de bestaande functiedefinitie controleren; exacte migratie lokaal/proefmatig en daarna bewaakt naar 141 toepassen. De botcompatibiliteitsimage moet actief zijn **vóór** via de nieuwe CC-image voor het eerst een terugbetaling wordt vastgelegd. Daarna CC-image uitrollen. Geen commandoregistratie, scopemutatie of nieuwe activeringsvlag nodig. Behoud de huidige BO04-workers en alle bestaande instellingen.

Bij terugval naar een oude botimage kunnen nieuwe terugbetaalregels niet meer worden gelezen. Rol daarom de compatibele bot niet zelfstandig terug nadat de eerste terugbetaling bestaat. Een oude CC-image kan de nieuwe beheerprojectie niet aanbieden; bestaande boekingen en nieuwe terugbetalingen blijven in de database bewaard. Geen migratie terugdraaien of historiek verwijderen om een image terug te zetten.

## Bewijs en grenzen

Gerichte controles dekken rechten, organisatiegrenzen, behoud van bestaande rijen, RLS en grants, terugbetalen na prijswijziging, replay, versieconflict, verplichte reden/bevestiging, geen eigen of geleverde terugbetaling, zoeken buiten de eerste pagina, behouden filters en botweergave. Native PostgreSQL 17 met echte overlappende sessies dekt twee terugbetalingen en leveren tegenover terugbetalen; daarnaast blijven de bestaande voorraad-, saldo-, replay-, beslis- en rollbackgevallen groen. Alle saldi worden tegen de som van de historiek gecontroleerd.

De brede acceptatie van de volledige app blijft voor de afgesproken preproductiefase. Echte beloningen, prijzen en voorraad worden door BESC ingevoerd; er worden geen voordelen of saldi verzonnen. RE02 (automatisch verdienen) en RE03 (StreamElements-overgang) blijven afzonderlijke werkpakketten.
