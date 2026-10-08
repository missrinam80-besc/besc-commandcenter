# Punt 3: mobiel en donkere modus

> Historische notitie. Dit document bewaart het ontwerp of de controle op de genoemde datum; het is geen actuele werkvoorraad. Zie de [wiki](../README.md) en [huidige releasewerkwijze](../Release-en-acceptatie.md).

## Bevestigde fouten en herstel

- De lijststijl verborg Openen onder 600 pixels, onder andere bij events. De actie blijft nu zichtbaar in content- en historielijsten.
- Het vaste mobiele menu overlapte Nieuwe items. Het werkvlak reserveert nu ruimte bovenaan; koppen en acties kunnen doorlopen naar een volgende regel. Primaire knoppen behouden hun tekst op mobiel.
- Mijn items en Opgeslagen weergaven gebruikten lichte achtergronden met tekst uit het donkere thema. Beide volgen nu de bestaande licht/donker/systeemvariabelen, inclusief het formulier om een weergave op te slaan.
- Sponsorrapport stond buiten AppShell en zweefde boven dossierknoppen. Het staat nu in de normale dossierstroom, binnen de themaomgeving en vóór dossierbeheer. De rapportactie en bestaande toegangscontroles zijn behouden.

## Validatie

- DEV-inspectie op telefoonformaat: Home, Mijn werk, Inbox, Projecten, Content, Events, Financiën, Goedkeuringen, Communicatie, Nieuwsbrieven en Kalender. Mobiel menu opent en sluit bij navigatie. Eventformulier past binnen de viewport.
- 32 lokale visuele controles: 320/390/760/1280 pixels × licht/donker × events, sponsorrapport/dossierbeheer, eventformulier en campagneformulier. Geen pagina-overloop, verborgen Openen-acties, te brede formulieren of overlap tussen rapport en dossierbeheer.
- Lokale previews gebruiken de gerenderde DEV-events-DOM met gewijzigde app-CSS en echte formulier/rapportcomponenten met begrensde adapters. Dit is visuele verificatie; geen volledige Next.js-hydratatie- of echte-datatest.
- Systeemweergave gecontroleerd met de actuele donkere toestelvoorkeur; volgt het donkere kleurenpalet.
- 567 bestaande tests, TypeScript, gerichte ESLint, diffcontrole en productiebuild geslaagd.
- Oorspronkelijke persoonlijke voorkeur Licht hersteld. Tijdelijke viewport wordt opgeheven. Geen nieuwe gegevens, diensten, dependencies of betaalde agentruns.

## Uitrol en afronding

Geen migratie. GitHub merge → bestaande DEV-imagebouw → serverdeployment → live hercontrole. Controleer na uitrol mobiele lijstacties en Nieuwe items, filters/weergaven in donker, formulieren en sponsorrapport met bereikbaar dossierbeheer. Punt 3 blijft open tot deze hercontrole; punt 4 is niet gestart.
