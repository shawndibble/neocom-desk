# Scope decisions — My Fittings saved per Character, record adds characterId (issue #1538)

_Recorded 2026-09-24 · issue #1538._

- **A saved Fitting is `{id, characterId, name, code, updatedAt}`, per Character.** The ticket lists four fields, but every synced collection is keyed by `characterId` (Dexie index, `ownerHash` remote docs, `scheduleSync`), so it rides along as the sync key — as it does on Payees. It is not extra Fitting data. Saving therefore needs an active Character; Save is disabled without one. An account-wide fan-out (like Station Pins) was rejected as far heavier than the ticket asks for.
- **Grouped by hull name**, decoded from each saved code, with undecodable codes listed under "Unknown hull".
