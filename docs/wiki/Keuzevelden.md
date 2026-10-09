# Keuzevelden beheren

Een Admin kan onder **Beheer → Keuzevelden** types en categorieën toevoegen, hun benaming aanpassen en hun volgorde bepalen. Nieuwe opties verschijnen in de uniforme fiche-editor. De opgeslagen sleutel blijft gelijk bij een naamswijziging, zodat bestaande koppelingen behouden blijven.

Beheerbare indelingen: eventtype, soort agendaonderdeel, contenttype, budgetcategorie, kostencategorie, inkomstentype, sponsorcontacttype, onboardingtype, vergaderingstype, kennisbankartikeltype, producttype, materiaaltype, lidmaatschapstype, deadlinecategorie en documenttype.

Statussen, betaalstatussen, prioriteiten, rechten en integratiekeuzes bepalen appgedrag. Ze zijn zichtbaar als beschermde lijsten en kunnen hier niet worden gewijzigd.

**Programma en inzet → Soort onderdeel** is beheerbaar. Nieuwe en hernoemde soorten verschijnen in zowel de fiche-editor als het agendaformulier, de filters en de agendablokken. De vier oorspronkelijke soorten behouden hun kleur; nieuwe soorten krijgen automatisch een vaste kleur die bij hernoemen gelijk blijft. Verwijderde ongebruikte soorten verdwijnen ook uit de filters.

## Verwijderen

Een optie die aan minstens één fiche gekoppeld is, kan niet worden verwijderd. De pagina toont het aantal fiches en blokkeert de verwijderknop met uitleg. Ook gearchiveerde of zacht verwijderde fiches tellen mee. Wijzig eerst de koppelingen als de optie moet verdwijnen. Benaming en volgorde aanpassen kan wel terwijl een optie gebruikt wordt.

De databank controleert opnieuw bij verwijderen. Wanneer ondertussen iemand de optie gebruikt, krijgt de Admin een melding dat verwijderen niet kan. Omgekeerd wordt het opslaan van een fiche met een ondertussen verwijderde optie geweigerd. Standaardopties die nieuwe fiches nodig hebben, blijven eveneens beschermd.

Opties zijn gescheiden per organisatie. Gewone leden mogen de opties lezen voor hun fiche-editor; alleen actieve Admins mogen ze beheren. Als opties of gebruik niet geladen kunnen worden, wordt beheer geblokkeerd.

## Ingebruikname op DEV

Deze wijziging vereist `20261009074806_managed_dossier_choices.sql`. Voer eerst de migratie via de bestaande Supabase-releaseprocedure uit en deploy daarna de bijbehorende app-image. De migratie bewaart bestaande keuzewaarden, vult standaardlijsten in per organisatie en vervangt alleen de vaste controles voor de veertien beheerbare indelingen. Beschermde werkstroomcontroles blijven behouden.

De uitbreiding voor agendaonderdelen vereist aanvullend `20261009095014_managed_agenda_types.sql`. Als de eerste migratie al uitgevoerd is, voer uitsluitend deze aanvullende migratie uit vóór deployment van de nieuwe image. Bestaande agendaonderdelen blijven behouden. De status-, tijd- en rechtencontroles worden niet gewijzigd.

Controleer op DEV als Admin: optie toevoegen, kiezen in een fiche, opnieuw openen, benaming aanpassen en controleren dat de koppeling behouden blijft. Probeer daarna verwijderen: de koppeling moet blokkeren met uitleg. Na ontkoppelen moet een ongebruikte niet-standaardoptie wel verwijderbaar zijn. Controleer dat een gewone gebruiker geen beheerrechten krijgt en dat beschermde lijsten geen wijzigknoppen hebben.

De automatische controles gebruiken uitsluitend synthetische PostgreSQL-fixtures. Ze bewijzen geen uitgevoerde migratie of gebruikersacceptatie op DEV. De kwaliteitsworkflow test bovendien alle vijftien indelingen met twee gelijktijdige PostgreSQL-sessies: opslaan vóór verwijderen, verwijderen vóór opslaan en terugdraaien van verwijderen.
