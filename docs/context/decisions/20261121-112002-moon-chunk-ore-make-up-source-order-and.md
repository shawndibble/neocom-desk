# Scope decisions — Moon chunk ore make-up source order and correction

_Recorded 2026-11-21._

- **A chunk's ore make-up has a fixed source order.** The ExtractionStarted notification first: exact, always leads, never corrected (an ore mined past it is a data problem, left as is). Else the linked Survey's first counted scan. Else what was mined, once the extraction has ended. Else nothing.
- **A survey chunk is sized by the survey's own measured volume** (the first counted scan's rocks summed), when that scan was taken from chunk arrival to the extraction's expiry (a scan with no time is accepted). Otherwise it falls back to hours × the refinery's rate, and only then does the row carry a `chunkRate`.
- **Correction happens only after the extraction has ended** (Expired, or flagged Fully Mined after fracture), per ore, never in total: each survey ore becomes `max(estimate, mined)`. Ores mined that the survey does not list are not added. While the chunk is active nothing is corrected; an ore mined past its figure simply shows no loss. A corrected row says its figure is a floor.
- **No notification and no survey, chunk ended:** the make-up is rebuilt from the mined ore (`oreSource: 'mined'`, "From what was mined"). Its ore loss is unknowable (everything mined would read as 100% of an invented total), so the loss panel says Unknown, never 0%.
- **Nothing is stored.** All of it is derived in the pure engine at view time; a notification or survey link that arrives later replaces it automatically. No Firestore field, no migration.
- **The survey share page's ISK tile reads "ISK left at last scan"**, which is what it has always computed.
