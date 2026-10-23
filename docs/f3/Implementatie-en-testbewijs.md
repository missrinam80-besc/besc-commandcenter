# F3 — fictieve bouw- en testfase

Stand: 23 oktober 2026. Linda gaf opdracht F3 uit te voeren en koos daarna expliciet: **eerst volledig met fictieve gegevens bouwen en testen**. Dit verslag actualiseert de oorspronkelijke voorbereiding; het maakt geen live campagne of formele eindacceptatie van F3 aan.

## Gebouwde keten

Het bestaande campagnedossier krijgt een optionele afgeschermde proefroute. Een geverifieerde voorzitter kan alleen een campagne met `TESTFIXTURE`-titel openen. Campagnegebonden, maximaal zeven dagen geldige taaktoewijzingen geven afzonderlijk voorbereidings-, review- en rapporttoegang. De voorzitter heeft zonder die taak geen automatische privémeetinzage. De serverflag `BESC_CAMPAIGNS_PILOT_ENABLED` staat standaard uit.

Campagnetekst, toegestane velden en bewaarbehandeling krijgen een eigen onveranderlijke versie en verwijzen naar een bestaand document. Bestaande personen/accountbinding, voorzitterverificatie en documentrechten worden hergebruikt. De nieuwe campagneverklaring is een campagnegebonden envelop naast de organisatiebrede F1-doelen: een tekstwijziging in A wijzigt B niet. De F1-doelcode- en intrekkingssemantiek blijft intact.

De creator bevestigt zelf de exacte campagnetekst. Een editor kan die persoonlijke bevestiging niet simuleren. Postlinks worden zonder netwerkverzoek naar canonieke YouTube-identiteit ontleed. Deze parserkeuze is een fictieve bouwkeuze, geen besluit dat een echt YouTube-account gekoppeld wordt. Dubbelen hebben één campagnelink; eigen inzendingen vragen een andere reviewer. Een nieuwe verklaring maakt een heraangeleverde bijdrage opnieuw kandidaat en invalideert eerdere meetrevisies.

Bronmetingen kunnen als handmatig testbewijs of gecontroleerde testexport worden geregistreerd. Zij vereisen geldig doel, toegestane metric, actuele bijdrageversie en leesbaar bronbewijs. Een herhaalde bronregistratie wordt niet dubbel opgeslagen; gewijzigde data met dezelfde broncode geeft conflict. `official_api` wordt in deze fictieve fase expliciet geweigerd.

Het rapport vergelijkt twee exacte niet-overlappende meetvensters, toont bron, peildatum, definitie, kwaliteit, dekking en uitgesloten bijdragen, en gebruikt dezelfde invoer voor HTML en CSV. Ontbrekend blijft onbekend; een gemeten nul blijft nul. Bereik en cumulatieve tellers krijgen geen ongeldige campagneoptelsom. Onvolledige dekking levert geen misleidend vergelijkingspercentage op. Een bevroren rapportrevisie behoudt zijn invoer, maar wordt bij gewijzigde deelname, bijdrage of broninzage geblokkeerd. Gedownloade exports kunnen niet op afstand worden ingetrokken.

## Gegevens- en compatibiliteitsgrens

Eén additieve migratie: `20261023091034_f3_campaign_pilot.sql`. Negen RLS-tabellen in `private`; geen client- of service_role-CRUD-grants. Beperkte RPC's gebruiken geverifieerde sessie, actuele organisatie/campagne/taak en expliciete veldlijsten. De beperkte SECURITY DEFINER-grens is bewust nodig om deze private workflow aan te roepen; geen generieke SQL-/tabelfunctie wordt blootgesteld.

De nieuwe private metingen worden niet in `public.social_metric_snapshots` geladen. Oude brede rapport-/MCP-/exportquery's krijgen zo geen nieuwe privécreatorgegevens. Er is geen wijziging aan bestaande Auth-tabellen of Auth-triggers: gevoelige mutaties delen bestaande transactiegrenzen en nemen rijlocks tegen sessie-intrekking. De vorige F1/F2-functionaliteit behoudt haar eigen rechten. Native terugvalcompatibiliteit met een echt gestarte oude serverimage blijft een afzonderlijke DEV-voorwaarde.

De nieuwe rapportselectie weigert meer dan 500 bijdragen of 5.000 waarnemingen in plaats van stil te trunceren. De RPC weigert te grote/ongekende payloads. Er is nog geen nieuwe upload-, discovery-, tracking-, token-, bot-, website- of achtergrondsyncfunctie geactiveerd.

## Gecontroleerd bewijs

- Volledige lokale suite: **1.095 geslaagd, 0 fouten** op de implementatie vóór de laatste uitsluitend Nederlandse weergavelabels. Gerichte F3-proeven en codekwaliteit worden ook op de oplevercommit herhaald.
- Native PostgreSQL 17: nieuwe F3-rechten, dubbelenrace en intrekking blokkeren oude verwerking; F1- en F2-rechten/races en volledige historische schemareplay geslaagd in GitHub-run `39933137905` op commit `a73fd78`. Een aanvullende sessie-intrekkingsrace is nadien toegevoegd en moet op de laatste commit groen zijn.
- Productiebuild lokaal geslaagd; TypeScript en gerichte lintcontrole worden op de oplevercommit gecontroleerd.
- Volledige fictieve keten in de databasefixture: creatorbevestiging, andere reviewer, nul en veertig in twee meetvensters, vastgelegde rapportrevisie en veilige CSV. Dit gebruikt een Auth-platformshape en bewijst geen live Supabase-aanmeldketen.
- Lokale browserpresentatie van de echte React-component met fictieve data bekeken. Dit is presentatiebewijs; de volledige ingelogde browserketen, mobiele/light-darkacceptatie en productiestijl zijn hiermee niet integraal bewezen.
- [Cloud DEV uitsluitend gelezen](bewijs/f3-cloud-readonly-20261023.json): `read_only=on`, 124 migratieregistraties, F3 nog niet aanwezig, staging gesloten. De bestaande ledenleespolicy op socialmetingen is bevestigd. Geen persoonsrijen of credentials opgehaald.

De eerdere schemareplayfout ontstond door de vaste F2-telling van 136 tabellen. De test bevestigt nu nog steeds exact die F2-basis vóór F3 en daarna 145 tabellen, inclusief de negen afgeschermde campagnetabellen. De historische F2-releasehashes blijven ongewijzigd; F3 heeft een eigen [release-manifest](../../ops/f3-release-manifest.json).

## Grenzen en vervolg

[Alle 53 gevallen](resultaatgevallen.json) blijven afzonderlijk verantwoord. De oorspronkelijke [planning](acceptatiegevallen.json) is ongewijzigd en wordt niet achteraf een lijst geslaagde live proeven. Officiële accountcapabilities, twee echte bronvensters, platformtoken-/quotaproeven, persoonlijke live verklaringen, Cloudmigratie, serverdeploy en formele eindacceptatie zijn niet uit deze fictieve fase afgeleid. De 38 F2-openpunten en P10 blijven behouden.

Voor DEV-uitrol zijn actuele preflight, passende afgeschermde back-up/off-server herstelcontrole, review van exact SQL en image en Linda's serveruitvoering nodig. Geen live migratie, deploy, roltoekenning, accountkoppeling of publicatie is in deze fase uitgevoerd. Echte campagne/deelnemers/accounts/doeltekst/bewaarbehandeling worden pas bij het vervolg vastgesteld. Geen Metricool-opzegging of automatische verdiensten.
