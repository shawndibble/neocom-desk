# Scope decisions — Statement lines group by day with the refinery as the station line; no moon line (issue #5310)

_Recorded 2026-10-27 · issue #5310._

- **A Statement line names its refinery under the day; there is no separate moon line.** The `StatementLine` payload (and the guest verify page it feeds) carries only `structureId`, no moon. Adding one would change the server payload and its mirror, so the layout is day header (date, day tax), then refinery and rate, then ore lines. A moon line waits for a payload that carries the moon.
