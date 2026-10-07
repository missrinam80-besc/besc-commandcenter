# Donkere modus: resterende vlakken en tekstcontrast

## Probleem en herstel

De DEV-screenshots na PR 58 tonen nog witte vlakken met lichte tekst. De generieke themaregels met `:where()` hebben onvoldoende specificiteit voor onder andere de modalkop en de kennisbankzoekbalk. Andere onderdelen ontbreken in die regels.

De oorspronkelijke componentregels gebruiken nu de bestaande themavariabelen voor de modalkop, dossier-/rapportkop, dossiersecties, zoekvelden, lijst-/kalenderkeuze, rolkaarten en gebruikersrijen. Witte fallbacks behouden de lichte presentatie buiten de themaomgeving.

Groene en oranje integratiestatussen, bronlinks en de kennisbankteller gebruiken aparte licht/donker/systeemkleuren. De eerste kalenderwaarschuwing krijgt een passende donkere achtergrond en leesbare rode tekst. Een gerichte regel heeft genoeg specificiteit om de algemene kaartregels te overtreffen. Gebruikersrijen en hun formulieren kunnen op alle breedtes doorlopen naar een volgende regel.

## Lokale visuele controle

Gerenderde DOM van de elf getroffen DEV-weergaven is lokaal bekeken met de gewijzigde echte app-CSS: Kalender, Nieuw project, Social planning, Shop, Financiën, VZW-administratie, Kennisbank, Social inzichten, Integraties, Historiek en Gebruikers. Dit zijn statische visuele previews, geen volledige Next.js-hydratatieproef. Geen formulier is verzonden en geen accountrecht is gewijzigd.

- 132 combinaties: elf weergaven × licht/donker/systeem × 320/390/760/1052 pixels. Geen horizontale pagina-overloop, te brede modal of vaste witte achtergrond op de geselecteerde onderdelen in donker/systeem. Systeem volgt de actuele donkere toestelvoorkeur; een lichte toestelvoorkeur is niet apart gesimuleerd.
- 68 geselecteerde tekstonderdelen per expliciet thema: alle gemeten tekstcontrasten minstens 4,5:1 in licht en donker; laagste donkere verhouding 6,81:1. Meting omvat de gemelde kaartkoppen, gebruikerstekst, waarschuwingen en integratiestatussen. Geen uitspraak over alle tekst in de volledige app.
- Visuele inspectie van Shop, Nieuw project, Gebruikers en Integraties bevestigt de gewijzigde achtergronden en statuskleuren.
- 567 bestaande tests, TypeScript en productiebuild geslaagd; diffcontrole zonder fouten.

## Uitrol

Geen migratie, nieuwe dependency, dienst of betaalde agentrun. Volg GitHub merge → bestaande DEV-imagebouw → serverdeploy. Controleer daarna dezelfde elf schermen live in donker en controleer lichte modus en smalle gebruikersformulieren. Punt 3 blijft heropend tot die controle; punt 4 is niet gestart.
