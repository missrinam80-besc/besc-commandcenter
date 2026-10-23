# Werkpakketten, uitvoering en terugval

Alle pakketten horen in de bestaande private CC-repository. Website en Discordbot behouden eigen repository, versie en deploy. Dit voorbereidingspakket bevat geen uitvoerbare live migratie of deployscript.

| Pakket | Concrete oplevering | Afhankelijkheid | Poort |
| --- | --- | --- | --- |
| F3.0 | Actuele code/Cloud/accountbaseline; tabel/policy/grant-/exportroutes; platformcapability- en besluitregister. | D01 voor bouw; alleen lezen kan vooraf. | Geen onverklaarde schema-/accountafwijking. |
| F3.1 | Campagnegebonden deelname, doelbinding, rollen en private meetgrens; additief migratievoorstel. | F3.0, D02/D04/D05 vóór live. | Actor-, campagne-A/B-, intrekkings- en bypassproeven. |
| F3.2 | Handmatige URL-kandidaten, canonieke identiteit, verificatie en veilige bewijskoppeling in bestaande dossierweergave. | F3.1. | Dubbelen/ongeldige/private/verwijderde posts en reviewraces. |
| F3.3 | Eigen accountadapter hergebruiken; afgebakende snapshots/handmatig bewijs, foutstatus en twee vensters. | F3.1/2; D03/D06. | Bron/scopes, quota, idempotentie en semantiek bewezen. |
| F3.4 | Interne rapportrevisie, bron/kwaliteit/dekking, vergelijking en veilige CSV. | F3.3. | Rekenkundige en rechtenvergelijking HTML/CSV; oude rapportages behouden. |
| F3.5 | Geïsoleerde native DB-/race-/UI-tests, compatibiliteit, migratierepetitie en veiligheidsreview. | F3.1–4. | Alle verplichte gevallen uitgevoerd of livegate expliciet geblokkeerd. |
| F3.6 | DEV-back-up, beoordeelde migratie, pinned-image-uitrol door Linda, live pilot en bewijsregister. | F3.5, D07, benoemde live deelnemers. | Onafhankelijke postflight, functionele proef en D08. |

## Releasevolgorde

Voor elke migratie eerst de actuele omgeving/hash/historie vergelijken; 124 registraties is de laatst bewezen F2-stand, geen eeuwige verwachte waarde. Bestaande gegevens tellen en integriteitsvoorwaarden controleren zonder inhoud/geheimen te loggen. CLI-migratie via actuele tooling genereren, geen verzonnen timestamps, oude seed uitgesloten. Native herhaal- en compatibiliteitsproef vóór Cloud.

Back-up van database, benodigde Auth/Storage/configuratie en sleutels volgens bestaande afgeschermde procedure. Off-server overdracht en herstelproef passend bij gewijzigde gegevens controleren. Geen nieuw automatisch back-upbeleid activeren. De oude TLS-fout niet oplossen door certificaatcontrole uit te zetten.

Exacte gereviewde CC-image pinnen; huidige image en configuratie bewaren. Nieuwe import en campagnesync standaard uit tot doel/accountrechten en postflight zijn gecontroleerd. Alleen webservice vervangen; Caddy/website/bot niet meedeployen. Gebruik laatst bewezen capaciteitscijfers niet als actuele vrije ruimte: vóór pull nieuwe capaciteit controleren en ruimte voor terugval bewaren. Geen blinde prune.

Serverhandelingen zijn voor **Termius → BESCSRVDEV**, directory **/opt/besc-dev/command-center**. Linda voert ze zelf uit; ieder later script vermeldt doel en wijzigingen. Cloud DEV-SQL hoort bij de gecontroleerde Supabase-projectsessie, niet in Termius of een andere database. Bestaande persoonlijke Twitchkoppeling, rewardsflags en Discordmeldingsflags behouden.

## Fouten en terugval

Migraties additief en waar passend transactioneel. Bij fout: stoppen, bewijs afschermen, nieuwe read-only inspectie; geen blind opnieuw uitvoeren. Onduidelijke commituitkomst eerst vaststellen via huidige schema/historie/idempotentieregistratie.

Eerste veilige actie bij storing: nieuwe campagne-intake/sync blokkeren, bestaande toegangsgrens behouden. Oude beoordeelde CC-image op compatibel schema terugzetten met exact bewaarde configuratie. Geen automatische destructieve downmigration of dataherstel over de huidige database. Alleen na afzonderlijke beoordeling een geïsoleerde herstelroute uitvoeren. Nieuw privégegevensrecht mag door oude image/exports niet breder worden; dit is een verplichte compatibiliteitsproef vóór uitrol.

## Eindtoestand en bewijs

Beperk testtoegang op tijd en beëindig tijdelijke rollen na proef. Testrecords herkenbaar archiveren; geen harde verwijdering zonder bewaarbeoordeling. Bewijsregister per geval met release, actor, omgeving, datum, verwacht/werkelijk resultaat en beperkingen. Code/CI, Cloudmigratie, serverdeploy en live acceptatie blijven aparte statussen. Open blokkerende gevallen niet via een algemene kernacceptatie onzichtbaar maken.
