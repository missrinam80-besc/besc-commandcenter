# F0 basis vastleggen

**Vervolgstatus 21 oktober 2026:** de technische F0-uitvoering op DEV is inmiddels geaccepteerd. De 33 registraties zijn hersteld, webrelease en meetweergave bevestigd. De kennisbank-seed blijft uitgezonderd; de vijf concepten zijn niet live ingevoerd. Zie [uitvoering en bewijsgrenzen](../acceptatie/F0-UITVOERING-DEV-20261021.md) en de [F1-voorbereiding](../f1/README.md). Onderstaande tekst bewaart het oorspronkelijke voorbereidingspakket; `execution_authorized: false` in de oorspronkelijke beoordeling is een historische voorbereidingsstatus, niet de status van de latere opdracht/uitvoering.

Voorbereidingspakket van 21 oktober 2026 voor het volledige BESC-ecosysteem. **F0 staat inhoudelijk klaar voor gezamenlijke vaststelling en gecontroleerde uitvoering.** Dit is geen verklaring dat de voorgestelde live correcties, publicaties of formele bevoegdheidstoekenningen al zijn uitgevoerd.

## Wat klaarstaat

| Onderdeel | Oplevering |
| --- | --- |
| Actuele basis | Codeversies en gescheiden componenten vastgelegd; 118 Git-migraties en 84 Cloud-registraties vergeleken. |
| Reproduceerbare opbouw | Alle 118 oorspronkelijke migraties uitgevoerd op een nieuwe PostgreSQL 17.6-fixture in CI, inclusief synthetische account- en kennisbankvulling. |
| Verdiepte vergelijking | Tabellen/kolomrechten, constraints, indexen, triggers, policies, functies, enums, view, sequences en schematoegang vergeleken. Nul inhoudelijke metadata-afwijkingen binnen deze scope. |
| Gegevenscontrole | Alleen geaggregeerde huidige backfillvoorwaarden gelezen; geen persoonsgegevens, documentinhoud of saldi geëxporteerd. |
| Herstelvoorstel | 33 voorwaardelijke kandidaten voor uitsluitend historieherstel; de ontbrekende kennisbank-seed is afzonderlijk uitgezonderd. |
| Bevoegdheden | De voorzitter is als bewijscontroleur en formele goedkeurder bevestigd. Technische rol, mandaat en geverifieerde accountbinding blijven gescheiden. |
| Ontwerp voor F1 | Concrete model- en API-impact, inclusie van alle schrijfpaden, rechten en negatieve acceptatiegevallen uitgewerkt. |
| Kennisbank | Vijf actuele conceptvoorstellen voorbereid; geen invoer of publicatie uitgevoerd. |
| Eerste codecorrectie | Ontbrekende campagnemetingen blijven ontbrekend, echte nullen blijven nul en gedeeltelijke totalen tonen dekking. |
| Releaseprocedure | Eigen stappen voor code, historie, inhoud, DEV-acceptatie en terugval. Geen stilzwijgende koppeling aan een botdeploy of productieomschakeling. |

## Leesvolgorde

1. [Besluiten en bevoegdheden](Besluiten-en-bevoegdheden.md): wat bevestigd is en welke concrete voorstellen nog moeten worden vastgesteld.
2. [Herstel en uitvoering](Herstel-en-uitvoering.md): bewijs, de 33 kandidaten, de kennisbank-uitzondering, uitvoering en terugval.
3. [Migratiebeoordeling per versie](Migratiebeoordeling.json): bronhashes, gecontroleerde groepen en de indeling van alle 34 verschillen. `execution_authorized` is false.
4. [Datamodel en API-impact](Datamodel-en-api-impact.md): de volgende afgebakende implementaties, met behoud van bestaande modules.
5. [Kennisbankconcepten](Kennisbankconcepten.md): vijf niet-gepubliceerde voorstellen.
6. [Acceptatieverslag F0](../acceptatie/ECOSYSTEEM-BASIS-F0-20261021.md): controles, bewijzen en grenzen.
7. [Risico en acceptatie](Risicos-en-acceptatie.md): actuele aandachtspunten, uitvoering en F1-proeven.

## Belangrijkste inhoudelijke uitkomsten

De huidige database is qua gecontroleerde schema-effecten verder dan het migratieregister. Het ontbreken van 34 registraties betekent dus niet dat 34 migraties opnieuw moeten worden uitgevoerd. Tegelijk ontbreken de vijf startartikelen uit één oude seed daadwerkelijk. Dat verschil wordt zichtbaar gehouden; het krijgt geen onterechte status ‘uitgevoerd’.

De voorzitter mag volgens de bevestigde werkwijze zowel bewijs beoordelen als formeel goedkeuren. In de bestaande administratie ontbreekt nog de veilige koppeling van verenigingslid naar een geverifieerd account. Die wordt in F1 expliciet gebouwd; namen of e-mailadressen worden niet gebruikt om bevoegdheden te raden.

De bestaande Supabase-platformdefaults zijn breed. Ze zijn meegenomen in de fixture om de huidige situatie eerlijk te vergelijken. Dat is geen goedkeuring om toekomstige privécreatorinzichten of bestuurlijke stukken onder algemene ledeninzage te brengen. Nieuwe verwerking blijft afhankelijk van de vastgestelde rechten en gegevensdoelen.

## Wat nog moet worden vastgesteld of uitgevoerd

- De concrete voorstellen P01–P10 vaststellen, inclusief vervanging bij afwezigheid/persoonlijk belang, publicatiegrenzen en de kennisbankaanpak. Bestaande bevestigde voorkeuren worden niet opnieuw ter discussie gesteld.
- Na afzonderlijke opdracht de verse preflight en het beperkte historieherstel uitvoeren. De oorspronkelijke seed blijft uitgezonderd tot haar afhandeling expliciet is besloten.
- Na goedgekeurde release de codecorrectie op CC DEV deployen en de gewijzigde schermen/CSV's praktisch accepteren.
- In F1 de account-mandaatbinding, bewijsbeoordeling, partnerrollen en publicatierevisies implementeren. F0 heeft die nieuwe functies niet als reeds gebouwd aangemerkt.

Hiermee is **de voorbereiding van F0 compleet**. De formele F0-acceptatie en de live uitvoeringsstappen blijven afzonderlijk zichtbaar. De volgende concrete wijziging kan op deze basis worden beoordeeld.

## Grenzen van het pakket

Geen nieuwe Cloud-objecten, historieregistraties, apprechten, accounts, artikelen, publicaties, saldi, runtimeflags, servers of DNS gewijzigd. Geen automatische back-up ingesteld. Er is geen productieacceptatie of juridische volledigheid verklaard. Repositories, credentials en deployments van CC, website en Discordbot blijven gescheiden.
