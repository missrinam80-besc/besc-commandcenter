# F6: eigen paginaconcepten lezen na afronding van een redactietaak

Na het opslaan van Home, Over BESC en Contact is de tijdelijke voorbereidersrol beëindigd. De bestaande F4-bediening verbergt daarna ook de eigen conceptteksten. Deze aanvulling toont een interne tekstpreview binnen de bestaande CC-inhoudspagina, onder de reeds beschikbare F6-beheerschakelaar.

De database bepaalt de eigenaar via auth.uid(), controleert de actieve menselijke sessie en het geverifieerde voorzittersmandaat en begrenst de uitvoer tot maximaal 50 eigen, laatste paginaconcepten voor de huidige organisatiesite. Een jongere versie, gewijzigde/onzichtbare bron of andere auteur sluit een versie uit. Alleen dossier-/revisie-identiteit, conceptstatus en de bestaande veilige paginapayload worden teruggegeven. Er zijn geen directe tabelrechten voor clients nodig; anon en service_role mogen de functie niet uitvoeren.

De preview toont gewone tekst met React-escaping. Links worden als te beoordelen bestemmingen getoond. Afbeeldingen worden niet opgehaald. De bestaande onafhankelijke beoordeling, publicatie- en staginggrenzen blijven gelijk. Er worden geen rollen, toestemmingen, sleutels, kanalen, statussen of gegevens gewijzigd. Jaykenbe krijgt geen DEV-taak.

## Levering en grenzen

Een additieve migratie voegt uitsluitend public.f6_own_page_drafts(uuid) met beperkte uitvoerrechten toe. Geen nieuwe tabel of datawijziging. De huidige Cloud DEV-historie is 136; alleen na afzonderlijke migratievrijgave zou die naar 137 gaan. Dit bestand is geen migratie- of deployopdracht.

Gerichte controles gebruiken een geïsoleerde databasefixture en testen onder meer eigen versus andere auteur, einde van de redactierol, sitegrens, bronwijziging, sessie-intrekking, geen gegevensmutatie en uitvoerrechten. Contractcontroles weigeren publicatiestatussen, extra private metadata en onveilige links. Dit vervangt de uitgestelde integrale acceptatie vóór productie niet.

Bestaande live beelden blijven de F6-images van 25 oktober. Er is met deze voorbereiding geen Cloud-migratie of serveruitrol uitgevoerd. Voor publicatie, websitepreview en productieopening blijft een afzonderlijke beslissing nodig.
