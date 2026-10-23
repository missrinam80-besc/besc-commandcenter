# Afhankelijkheden en open F2-varianten

F2-kernacceptatie maakt interne F3-voorbereiding mogelijk. Zij sluit geen ontbrekende live actor-, privacy- of rapportproef voor F3. De F2-staging hoeft niet opnieuw open en oude testrollen worden niet hergebruikt. De resterende 38 gevallen blijven met hun oorspronkelijke ID geregistreerd in website-PR3 en [dit overnameregister](f2-open-afhankelijkheden.json).

| F2-punten | Betekenis voor F3 | Behandeling vóór afhankelijke stap |
| --- | --- | --- |
| B02 | Geen agent-SSH. | Linda blijft de CC-serverstappen uitvoeren op BESCSRVDEV. |
| B03, A02–A04, A06, A09–A10, E03 | Eigen/andere actor, tenant, directe acties. | Nieuwe campagne-actor- en directe tabel/RPC/exportmatrix verplicht vóór echte creator-private data. F2-fixtures sluiten deze niet voor F3. |
| P06, P10 | Toestemmingsrace en overgeslagen persoonlijke proef. | F3-specifieke campagne-A/B-doelbinding, persoonlijke bevestiging en live intrekking apart bewijzen. De overgeslagen F2-proef blijft overgeslagen; geen stilzwijgende toestemming. |
| W06, D03, D08 | Browser/exportlekkage, URL/SSRF, limieten. | F3-invoer, bronbestanden, logs en rapportexport gericht toetsen; vóór live bronimport. |
| A05, A08, C01–C07 | Sleutel, callback en websitecache. | Geen website-uitbreiding in MVP. Als een nieuwe sleutel/authclient wordt ingevoerd, eerst de toepasselijke varianten bewijzen. Geen F3-bewijs voor overige websitevarianten claimen. |
| B05, M01–M03 | Inhoudsrechten en media. | Geen publieke media in F3. Vertrouwelijke bewijsbijlagen krijgen eigen private opslag-/intrekkingsproef indien nodig. |
| W04–W05, D05 | Bediening, toegankelijkheid, tijd. | Nieuwe campagneformulieren toetsenbord/mobiel/light-dark; meetvensters en DST opnieuw gericht toetsen. |
| W08 | Koppelingen/saldi behouden. | Bestaande flags en integraties vergelijken; eventuele geraakte keten opnieuw testen. |
| Overige F2-punten | Niet automatisch afhankelijk. | Blijven afzonderlijk open in het oorspronkelijke register; geen generieke sluiting door F3. |

Afzonderlijke F1-actorwissels en vertrouwelijke export/notificatievarianten zijn een directe afhankelijkheid zodra F3 hetzelfde pad met privégegevens gebruikt. Zonder bewezen inzagegrens geen privécreatorgegevens in dat pad. Alleen de benodigde matrix uitvoeren, met benoemde actors en nieuw bewijs.

Blokkerende gate voor echte F3-data: actuele Cloud-policies/grants en adminprojecties gecontroleerd, campagnegebonden doelen vastgesteld, bevoegde testers benoemd, nieuwe rechten afzonderlijk geautoriseerd, herstel-/back-upbewijs passend bij de nieuwe schema-impact en broncapability werkelijk bewezen. Lokale synthetische bouw kan daarvoor doorgaan na D01.
