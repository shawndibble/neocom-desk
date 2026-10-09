# Scope decisions — Loss summary prices at the hub from zKillboard killmails; insurance matched by time (issue #2852)

_Recorded 2026-10-08 · issue #2852._

- **The loss summary reads the killmail zKillboard already loads for Pilot Lookup and prices it at the Settings market hub (sell minimum), not through the killmails ESI scope.** `esi-killmails.read_killmails.v1` would force existing Characters to log in again. A later loader can sit behind the same shape.
- **Insurance is matched from the active Character's Wallet Journal: positive `insurance` rows from the kill time to one hour after.** Premiums are negative and ignored. One candidate is exact; several are ambiguous, so the closest is shown and labelled an estimate. Insurance pays on the hull only, so it is subtracted from the total lost.
- **v1 ships the Pilot Lookup expansion only.** The Wallet Journal "See loss" link and the "Ship lost" alert are follow-ups: no `KillReportVictim` handling exists yet and its payload is unverified.
