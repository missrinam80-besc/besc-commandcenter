# Algemene contactwerking F4

De website heeft een eigen contactformulier achter aanmelden. Onderwerp en bericht gaan via dezelfde afgeschermde aanvraagketen naar CC; de aanvrager krijgt een ontvangstnummer en kan het eigen dossier volgen in Mijn BESC. Interne notities blijven intern. Er wordt geen automatische e-mail of Discordmelding verstuurd.

Openstelling vereist de afzonderlijke schakelaar `BESC_GENERAL_CONTACT_ENABLED`, de basisschakelaar voor intake, actuele platformtoegang, precies het geselecteerde contactformulier met actuele beleidstekst en ten minste één actuele expliciete behandelaar. Het voorzittersmandaat maakt iemand niet automatisch behandelaar. Een bevestiging van het lezen van de behandelingstekst staat standaard uit; dit is geen marketingtoestemming.

Het formulier accepteert uitsluitend onderwerp en bericht. De server bepaalt de identiteit. De beleidsversie en inhoud worden onveranderlijk opgeslagen bij de inzending. Intrekken en opvolgen blijven mogelijk voor bestaande eigen aanvragen wanneer nieuwe contactinzendingen dichtstaan. Een gewijzigde formuliergrondslag of bewijsreferentie sluit de openstelling blijvend totdat opnieuw expliciet geconfigureerd wordt; een herstelde oude waarde heropent niets.

De vaste route `/contact` valt buiten oude redirects. Zolang de nieuwe contactschakelaar uitstaat kan de bestaande beoordeelde statische contactpagina, met taalkeuze, blijven werken. Historische Monday-formulieren en hun inzendingen worden niet overgenomen. De oude bronbeschrijving moet inhoudelijk worden herzien voordat een contactpagina wordt vrijgegeven.

## Bouwgrens

De zevende F4-migratie voegt één afgeschermde instellingentabel toe en breidt de bestaande intakefuncties uit. De zeven F4-migraties samen voegen 28 private tabellen toe. Op de laatst bevestigde Cloud DEV-basis zou de registratie van 126 naar 133 gaan. Dit is een verwachte overgang, geen actuele databasecontrole of uitgevoerde migratie.

Gerichte controles dekken geselecteerde beleidsversies, versieconflicten, huidige behandelaars, afscherming van interne notities, herhaalbare ontvangst, sluiting na bewijswijziging en afzonderlijke API-openstelling. Typecontrole en builds zijn bouwcontroles. Echte behandelingsteksten, bewijsstukken, termijnen, roltoekenningen en de volledige productieacceptatie blijven afzonderlijke beslissingen.
