# Scope decisions — Corp tax book says so when the corporation has no readable refineries (issue #4490)

_Recorded 2026-10-20 · issue #4490._

- **An empty observer list, or a 403 on it, is a `no-refineries` outcome, never "Synced".** The officer sync still runs for donations but its outcome carries `noRefineries`, and the health strip replaces the "Synced" line with a warning. It is session-only, not persisted on `lastSync`. The scheduled sync (mining only) records a skipped run with reason `no-refineries`.
- **The scheduled sync's 403 on the list stays `esi-refused`.** The server cannot tell a role refusal from a corporation without moons, and changing that would weaken the stop-on-repeat rule (ADR 0025).
- **The Turn-on dialog only warns.** It has no ESI probe, so it states what the book needs and never blocks an officer.
