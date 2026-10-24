# F5 — gecontroleerde uitbreiding

24 oktober 2026. **F5.0 is als broninventaris en bouwafbakening afgerond.** F5-functionaliteit is hiermee nog niet gebouwd of live geactiveerd.

1. [Oorspronkelijke scope en eerste werkpakket](Scope-en-eerste-werkpakket.md).
2. [Hergebruikinventaris en ontbrekende bouw](Hergebruikinventaris.md).
3. [F5.1: eigen campagnes via de Discordbot](F5.1-Eigen-campagnes-via-bot.md).
4. [Volgorde, besluiten en latere acceptatie](Volgorde-en-vrijgave.md).
5. [Versiegebonden bronregister](bronregister.json) en [capabilityregister](capabilities.json).

De broninventaris is lokaal gecontroleerd tegen vastgelegde CC- en botcommits. Zij bewijst aanwezige code en ontbrekende routes in die bronversies, geen actieve serverconfiguratie, providerautorisatie of live werking. De bot is uitsluitend gelezen in een afzonderlijke bronkopie en niet gewijzigd.

Pakketcontrole: `node docs/f5/validate-inventory.mjs --bot <afzonderlijke-bot-bronkopie>`. Controleert bronhashes, vastgelegde commits, documentverwijzingen en de begrenzing van dit pakket. Geen netwerk, databaseverbinding, applicatieacceptatie of live uitvoering.

Uitgevoerd op 24 oktober 2026: 32 bronbestanden tegen hun vastgelegde commits en lokale bronkopieën gecontroleerd, zeven capabilities verantwoord en 30 lokale documentverwijzingen geldig. `git diff --check` gecontroleerd. Geen uitgebreide tests, providerophaling, databasewijziging of runtimeactivering uitgevoerd.

De [F4-bouwafronding](../f4/Afronding-DEV-20261024.md), afzonderlijke [privacyuitvoering](../f4/Privacyvoorwaarden-en-aanvullende-uitvoering.md) en open acceptatiepunten uit eerdere fasen blijven gelden. Uitgebreide hele-app-acceptatie blijft vóór productie.
