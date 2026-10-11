# Scope decisions — Route safety widget reads the route Route Safety last drew (issue #3578)

_Recorded 2026-10-11 · issue #3578._

- **"Saved route" is the route Route Safety last drew, kept on this device.** The tab keeps its start and Stops only in the link, so nothing persisted a route for a widget to read. The tab now saves the start, the Stops and the systems the drawn trip crosses (`travel.savedRoute`, device-local) whenever it draws one. The widget reads that and never plans a trip, so it needs no stargate graph, Route rules, holes or bridges, and no new ESI scope. It is what this device last looked at, not a preference, so it does not sync.

- **Kills over 24 hours come from zKillboard, one request per region.** ESI's system kills feed covers one hour only, so a 24-hour chart cannot be built from it. The widget reads each route region once (`pastSeconds/86400`, paged, ten-minute cache, concurrency 3, as `20261005-125019`). The tab's one-hour cache is a different window and is not shared. A region zKillboard cannot answer in full leaves its systems unknown, never zero; a route where no system could be read is a failed read.

- **No verdict words.** The ticket's "dangerous systems" and "risk word" read as verdicts, which `20260912-172628` rules out. The Number counts **busy** systems (5 or more player kills in 24 hours) and the list's word is Quiet, Some kills or Busy: conditions stated from the kill count.
