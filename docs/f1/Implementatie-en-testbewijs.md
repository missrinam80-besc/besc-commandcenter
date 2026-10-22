# F1 — gebouwd pakket en testbewijs

**Actuele uitvoeringsstand:** dit document bewaart het bouwbewijs van 21 oktober. Merge, Cloud DEV-migraties, webdeploy, voorzittersbinding en gerichte schermproeven zijn daarna uitgevoerd; zie [DEV-uitvoering van 22 oktober](../acceptatie/F1-DEV-20261022.md). Uitspraken hieronder dat die stappen nog niet uitgevoerd zijn, beschrijven de toestand bij oplevering van het oorspronkelijke pakket.

Stand: 21 oktober 2026. Opdracht: **alle zes werkpakketten bouwen en testen**. Gebouwd op de bestaande werkbranch en aangeboden in [concept-PR #112](https://github.com/missrinam80-besc/besc-commandcenter/pull/112). Cloud-migratie, merge, deploy, echte mandaten en menselijke DEV-acceptatie zijn afzonderlijke uitvoeringsstappen. Dit verslag verleent geen rechten of beleidsgoedkeuring.

## Geleverde onderdelen

| Werkpakket | Geleverde werking | Controle |
| --- | --- | --- |
| F1.1 | Exacte lid–persoon–accountbinding, bewijs, mandaatvingerafdruk, intrekking, vijf expliciete taakrollen; admin wordt geen voorzitter. | Werkelijke SQL-operaties met aparte gebruikers en organisaties; verlopen/toekomstig/dubbel/gewijzigd mandaat, portal-only, actorvervalsing en onderhoudsfunctie geweigerd. |
| F1.2 | Bewijsversies, afzonderlijke regel-/toepasselijkheids-/uitvoeringsreviews, besluiten met bronmomentopname, bestuursgrond en opvolgtaak; onbekende termijn met reden. | Bewijs intrekken geeft herbeoordeling; completed geeft geen bewijsstatus; vergaderbesluit en auditrollback getest. |
| F1.3 | Versiegebonden doelen, eigen inzage/verklaring/intrekking in account en portaal, herkenbare externe bewijsregistratie, beperkte documentinzage. | Eigen actor, scope, versie-overgang, portalgrens en financiële/bestuurlijke doorsnede getest; bijlage-ID en dezelfde URL kunnen afscherming niet omzeilen. |
| F1.4 | Meerdere partnerrollen; expliciete campagne-/eventbijdrage; beide campagneformulieren, gedeelde dossiereditor, partnerfiche en rolfilter aangepast. | Esportsbijdrage blijft esports; oude cliënt zonder keuze weigert atomair; dossiereditor behoudt RLS op kinderen; rol verleent geen portaaltoegang. |
| F1.5 | Interne event-/nieuwssnapshots, veilige tekst/media, versiegebonden beoordeling, voorbeeld, intrekking en centrale intrekking van mediarechten. | Onveilige velden/HTML/URL, vreemde beoordelaar, stale bron en ingetrokken toestemming/media blokkeren; nieuw concept vervangt oud akkoord niet. |
| F1.6 | Integratietests, native SQL/raceproeven, exacte migratielijst, documentatie en begrensde overdracht aan DEV/F2. | Volledige regressiesuite, schemaopbouw en CI; bewijsniveaus blijven afzonderlijk. |

## Schermen

- Intern: '/app/administratie/werkstromen', bereikbaar vanuit administratie en Mijn account. De route opent voor actieve interne accounts; inhoud en handelingen volgen de expliciete databasebevoegdheden.
- Eigen verklaringen: '/app/account/toestemming' en '/portal/toestemming'. De eigen account- of portaalsessie bepaalt de persoon.
- Partnerfiche en rollenfilter blijven in Sponsors & CRM. De hoofdclassificatie en historische relaties blijven behouden; nieuwe bijdragen krijgen expliciete herkomst.
- Gewone formulieren vragen menselijke gegevens en keuzes. Actor, organisatiegrens, revisiecontrole en audit worden op de server/database afgedwongen. Foutfeedback krijgt toetsenbordfocus.

## Herhaalbaar testbewijs

De volledige lokale regressiesuite, lint, typecontrole en productiebuild worden vóór de definitieve oplevering opnieuw uitgevoerd. De laatste exacte uitkomst en CI-revisie staan hieronder bij de oplevercontrole. Geen van deze proeven gebruikt de Cloud-database.

1. 'tests/f1-database.test.mts': voert de echte migraties en operaties uit; standaard geïsoleerd PGlite, in CI native PostgreSQL 17.6. Iedere proef rolt terug. De native variant weigert andere doelen dan de lege localhostfixture 'besc_f1_fixture'.
2. 'tests/f1-concurrency.mjs': vier proeven met afzonderlijke echte verbindingen, aantoonbare lockbarrière en begrensde timeout: identiteitsintrekking, bronwijziging, toestemmingintrekking en hetzelfde verzoek tegelijk.
3. 'tests/f1-interface.test.mts': echte serveracties en servercomponenten, actorvelden, terugkeerroute, lege intrekkingsreden, bron-eventtijden, veilige tekst, schermrechten en contractfixtures.
4. Bestaande campagne-/kanaal-/schrijfbevestigingstests en de volledige overige suite bewaken naburige functionaliteit. 'tests/foundation-native-replay.mjs' controleert de ongewijzigde F0-baseline en de complete opbouw.
5. Synthetische browserproef: servercomponent met echte gecompileerde appstyles, lichte/donkere modus, uitklappen en zichtbare Tab-focus; basistekst en navigatie ook op een binnenbreedte van 390 pixels. Dit bewijst geen Cloud-login, apparaatdekking of menselijke DEV-acceptatie.

De machineleesbare [acceptatiematrix](acceptatiegevallen.json) onderscheidt fixturebewijs, gedeeltelijke dekking en nog uit te voeren DEV-controles. De oorspronkelijke 62 scenario's zijn geen teller van 62 live geslaagde proeven. Auth/Storage/Vault-servicegedrag, echte externe bewijstoegang, de volledige privé-export-/notificatieketen en alle praktische rolwissels blijven een aparte DEV-proef.

## Schema en bewuste grenzen

Er zijn zes nieuwe CLI-gegenereerde migraties: M01 identiteit/taakrollen, M02 governance/bewijs, M03 doelen/toestemming, M04 partnerrollen, M05 publicatierevisies/mediarechten, M06 actuele dossiereditor. Tien nieuwe publieke tabellen hebben RLS en geen directe cliëntmutaties. Twee private operatietabellen hebben geen cliëntgrants. Mutaties loggen atomair in het bestaande 'public.audit_log'; geen bewijsinhoud in technische audit.

De native volledige fixture bevat **124 migraties en 130 tabellen**: 118 historische migraties inclusief de oude seed, zes nieuwe migraties, 123 publieke RLS-tabellen, vijf bestaande private RLS-tabellen en twee nieuwe private operatietabellen. De Cloud-DEV-baseline blijft **117 geregistreerde migraties zonder die seed**. Na later geautoriseerde uitvoering van uitsluitend de zes F1-bestanden verwacht het manifest 123 registraties. Dit pakket past die historie niet aan.

De globale F1-transactiesluis wordt vóór betrokken rijlocks genomen; ze serialiseert deze lage-volume werkstromen om stale bevoegdheid, intrekking en omgekeerde lockvolgorde te voorkomen. Dit is een bewuste eerste implementatie. Bij groei eerst wachttijd meten; fijnmaziger locks vragen dezelfde native raceproeven. De sluis levert geen extra gebruikersrecht.

De generieke dossiereditor blijft security invoker. Een expliciete partnerkeuze is onbetrouwbare invoer en wordt in de trigger opnieuw getoetst aan actuele taakrol, partnerrol en organisatie. De editor wordt hiervoor niet als database-eigenaar uitgevoerd. Oude clients zonder expliciete bijdrage mogen na migratie die handeling niet opslaan.

Een wijziging in het geverifieerde mandaatregister maakt de vastgelegde mandaatvingerafdruk ongeldig. Opnieuw verifiëren vraagt een nog bevoegde voorzitter; als de eerste of enige binding niet bruikbaar is, blijft herstel een afzonderlijke onderbouwde onderhoudshandeling. Er wordt geen eerste voorzittersaccount automatisch gekozen.

Bronversies en bevestigde beschikbaarheid worden handmatig beoordeeld. Het systeem downloadt of archiveert geen externe Drive-bron en verklaart geen juridische conformiteit. Een bewaarde verwijzing moet in DEV werkelijk terugleesbaar worden bewezen. Onbekende wettelijke termijnen krijgen geen fictieve datum.

Publieke website-uitlezing, publicatiepointer, publicatieperiode, cursorpaginering, staging, caches en de voorgestelde 60-secondenintrekking zijn F2. Het F1-voorbeeld blijft intern, met 'publicly_served: false'. De [contractfixtures](../../tests/fixtures/f1-publication-contract.json) markeren die F2-poorten expliciet. Partnerpayload is een contractvoorstel; publieke creatorprofielen en privéplatforminzichten worden niet geactiveerd.

## Concrete overdracht aan DEV

Het [migratiemanifest](../../ops/f1-release-manifest.json) bevat uitsluitend de zes nieuwe versies en SHA256 over LF-SQL. De [releaseprocedure](Schema-en-release.md) blijft leidend: eerst actuele alleenlezende vergelijking en beschermde handmatige back-up/registerexport, daarna pas de exact beoordeelde uitvoeringsopdracht. Het oude F0-historieherstel mag niet opnieuw worden gebruikt. Geen brede db-push of oude seed toepassen.

Terugval behoudt alle nieuwe tabellen en historie. Oude campagne-/editorclients zonder expliciete rolkeuze blijven voor die handeling geweigerd; de overige regressies worden afzonderlijk getest. Dit pakket bevat geen destructieve inverse migratie en geen automatische back-up. De echte vorige serverimage terugzetten is nog geen uitgevoerde herstelproef.

CC blijft op BESCSRVDEV in '/opt/besc-dev/command-center'. Botserver BESCSRVDEV-02, website en Streamer.bot blijven afzonderlijke releases. De laatste door Linda bevestigde flags blijven de acceptatieverwachting: earning/preview/intake/Discord-slotkeuze uit, Twitchkoppeling behouden. Dit verslag is geen nieuwe serveruitlezing.

## Oplevercontrole

- Volledige lokale opleversuite: **1.019 geslaagd, 0 mislukt, 0 overgeslagen**. Daarbinnen 42 gerichte F1-proeven: 35 echte databaseproeven en zeven interface-/contract-/manifestproeven.
- Lint, typecontrole en productiebuild slagen. Beide editorcataloguscontroles controleren 22 dossiermodellen; 132 lokale documentatielinks zijn teruggevonden. Alle 118 historische migratiebestanden zijn ongewijzigd ten opzichte van de F0-baseline.
- Native PostgreSQL 17.6 wordt in drie controlejobs bij [PR #112](https://github.com/missrinam80-besc/besc-commandcenter/pull/112/checks) bevestigd: F1-operaties plus vier echte concurrencyproeven, volledige schemaopbouw en de bestaande integratie-/rechten-/buildsuite. Het native log en de schema-artifact vermelden de werkelijk geteste commit; beoordeel altijd de headrevisie. De laatste codecorrectie laat partnerrollen de Belgische kalenderdag volgen, ook bij een andere sessietijdzone.
- De [acceptatiematrix](acceptatiegevallen.json) bewaart de afzonderlijke nog uit te voeren DEV-proeven. Er is geen Cloud-migratie, serverdeploy, echte bootstrap, doelactivering of menselijke DEV-acceptatie uitgevoerd.
