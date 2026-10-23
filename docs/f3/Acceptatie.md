# Acceptatie en bewijsgrens

Alle gevallen in [acceptatiegevallen.json](acceptatiegevallen.json) staan op `planned`. De pakketvalidator controleert alleen hun samenhang, bronnen, links en verwachte rekenvoorbeelden. Hij bewijst geen applicatiegedrag of operationele platformtoegang.

Bij uitvoering krijgt ieder geval bewijs met exact bron-/release-ID, actor, organisatie, campagne, tijdstip, omgeving, werkelijk resultaat en beperkingen. Een unit-/fixturetest is geen live acceptatie. Elke afzonderlijke variant onder één geval moet expliciet worden verantwoord; geen hoofdgeval geslaagd noemen als een vereiste variant ontbreekt.

Minimale live keten: geautoriseerde campagne + bestaande creator → echte zelfbevestiging/controleerbaar extern bewijs → postkandidaat en onafhankelijke verificatie → toegestane eigen-accountbronmetingen in twee vensters → rapport/CSV met gelijke input → bron-/deelname-/inzagetoegang intrekken → afhankelijk nieuw gebruik geblokkeerd, andere campagne behouden. Tweede actor kan eigen toegestane gegevens lezen en geen beheer/private anderendata benaderen. Geen privécreator-OAuth nodig voor dit MVP.

Als een platform twee vensters niet levert, blijft de platformproef open of kiest Linda vooraf een passende gecontroleerde exportbron. Geen synthetische data als live resultaat presenteren. Benchmarkverschil, definitieverschil, missing/partial/stale en conflict rapporteren. Een geautoriseerde handmatige exportfallback wordt niet als geslaagde API-sync benoemd.

Afsluiting bevat alle cases, verschillen, open punten en een expliciet besluit. F3 kan niet per ongeluk Metricool vervangen, productie vrijgeven of een publieke campagne publiceren. Alle nieuwe tijdelijke toegangen/rollen sluiten, oorspronkelijke functies/instellingen vergelijken en passende back-up/rollbackcontrole rapporteren.
