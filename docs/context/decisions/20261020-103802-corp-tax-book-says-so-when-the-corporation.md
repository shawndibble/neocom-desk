# Scope decisions — Corp tax book says so when the corporation has no readable refineries (issue #4490)

_Recorded 2026-10-20 · issue #4490._

- **An empty observer list, or a 403 on it, is a distinct `no-refineries` skip, never a sync.** Recording a visit would make a book with nothing to read look "Synced". The officer sync uploads nothing and the health strip warns; the scheduled sync records a skipped run with the same reason. It is deliberately not persisted on `lastSync`: a reload falls back to "Never synced", which is also true.
- **The scheduled sync's 403 on the list stays `esi-refused`.** The server cannot tell a role refusal from a corporation without moons, and changing that would weaken the stop-on-repeat rule (ADR 0025).
- **The Turn-on dialog only warns.** It has no ESI probe, so it states what the book needs and never blocks an officer.
