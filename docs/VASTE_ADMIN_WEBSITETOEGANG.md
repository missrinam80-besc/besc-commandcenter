# Vaste admintoegang tot de DEV-website

Een administrator kan expliciet en uitsluitend voor één stagingsite vaste kijktoegang krijgen. Een adminrol alleen verleent geen nieuwe toegang. De private registratie wordt afzonderlijk en met audit ingericht voor het aangewezen bestaande account; de migratie bevat geen accounts of toelatingen.

Elke aanvraag controleert opnieuw de actieve organisatiebinding met rol admin, het bevestigde en niet geblokkeerde account, een bestaande sessie, de open stagingsite en de niet ingetrokken toelating. Er is geen vaste einddatum. Intrekking van de toelating of verlies van de adminrol sluit deze route meteen. Andere, afzonderlijk bestaande tijdelijke kijkrechten behouden hun eigen einddatum en intrekkingsregels.

De private tabel heeft RLS en geen rechten voor anon, authenticated of service_role. Er is geen nieuwe browser-RPC en er worden geen nieuwe beheer- of publicatierechten verleend. De bestaande website- en inhoudsinstellingen blijven gelden; productie en publieke indexering worden niet geactiveerd.
