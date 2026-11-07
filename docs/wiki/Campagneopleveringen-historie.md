# Historie van campagneopleveringen

Lokale reparatie van 7 november 2026. Nog niet op Cloud DEV toegepast of uitgerold.

De afgebakende DEV-proef met campagne `4ecd5392-ec4a-43ba-b253-aa4680eeae47` liet zien dat de oplevering wel van Te doen via Bezig naar Afgerond ging, maar geen centrale auditregels kreeg. Alleen de campagne-aanmaak was gelogd. De testregistraties blijven staan; deze reparatie verandert ze niet.

## Nieuwe registratie

Een aparte databasetrigger schrijft toekomstige aanmaak, betekenisvolle wijzigingen en verwijdering van `campaign_deliverables` naar het bestaande Activiteit-overzicht. De registratie bevat de werkelijke actor uit de sessie, het databasetijdstip, het opleverings-ID, de titel, gewijzigde velden, vorige en nieuwe status en een verwijzing naar de campagne. Goedkeuringswijzigingen blijven afzonderlijk herkenbaar. Notities worden niet naar de auditmetadata gekopieerd.

De trigger geldt voor de gezamenlijke dossiereditor en de bestaande voortgangsactie. Een ongewijzigde status of een wijziging van alleen `updated_at` maakt geen extra gebeurtenis. Als auditopslag mislukt, draait dezelfde transactie ook de gegevenswijziging terug. De voortgangsactie bevestigt pas succes als de bedoelde rij terugkomt en vernieuwt daarna de campagne en Activiteit.

Activiteit toont het type Campagneoplevering onder Content & communicatie, Nederlandse statuslabels en een link naar het tabblad Deliverables van de juiste campagne. Een verwijderingsregel krijgt geen dode detailroute. De bestaande rollen en audit-RLS blijven behouden: alleen de afgeschermde trigger kan auditregels toevoegen; gebruikers krijgen geen directe schrijf-, wijzig- of verwijderrechten op de auditlog.

## Bewijsgrens

Er worden geen oude gebeurtenissen geconstrueerd uit de huidige status. Reeds ontbrekende tijden en actoren kunnen niet betrouwbaar uit die status worden afgeleid. De bekende DEV-proef is apart met scherm- en databasebewijs vastgelegd; die waarnemingen worden niet achteraf als oorspronkelijke auditregels ingevoegd.

De nieuwe triggerfunctie gebruikt alleen voor de noodzakelijke auditappend definerrechten, met een vaste lege zoekroute en zonder directe uitvoering voor PUBLIC, anon, authenticated of service_role. De generieke auditfunctie, tabellen, policies en tabelrechten veranderen niet.

De databaseproeven gebruiken volledige schemaopbouw met echte rollen en testen onder meer opeenvolgende wijzigingen, onveranderbare historie, afgeschermde organisaties, foutterugdraaiing van een complete dossieropslag en installatie boven bestaande gegevens zonder terugvulling. Scherm- en serveractieproeven gebruiken de echte componenten met vervangen externe afhankelijkheden.

Het [releasemanifest](../../ops/campaign-deliverable-history-release.json) houdt Cloud-migratie en serveruitrol expliciet uitgeschakeld. Het lokale SQL-bestand is alleen in wegwerp-testdatabases uitgevoerd. Voor Cloud DEV blijven afzonderlijke migratie- en uitroltoestemming nodig.
