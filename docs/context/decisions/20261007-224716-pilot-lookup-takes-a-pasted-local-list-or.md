# Scope decisions — Pilot Lookup takes a pasted Local list or D-Scan (issue #2863)

_Recorded 2026-10-07 · issue #2863._

- **Two or more lines make a list.** Local: every line looks like a pilot name (<= 37 chars, letters, digits, space, `'`, `.`, `-`), repeats dropped. D-Scan: every line starts with a type id and a tab. A single name keeps the one-pilot lookup. Strict on purpose: the global paste router acts on pastes aimed at no field, so prose and URLs stay a no-op. The router checks EFT fit, then item list, then pilot list, so an item list never reads as names.
- **Cap of 40 names per paste.** The rest are counted ("N more not looked up"), never silently dropped. zKillboard is fetched 4 at a time; the real rate limit was not measured in this change, so lower the cap if it throttles.
- **Not found stays a row.** `/universe/ids` is exact-match only; names are never guessed. "No zKillboard history" and "zKillboard couldn't be reached" are separate row states.
- **Default sort is danger, highest first**; every column sorts, and rows with no ratio sink to the bottom.
- **D-Scan buckets** by SDE group id (pinned in `src/engine/pilotList/dscanClasses.ts`): capitals (Carrier, Dreadnought, Supercarrier, Titan, Force Auxiliary, Lancer, Capital Industrial), logistics (cruiser, frigate), structures (Citadel, Engineering Complex, Refinery, Control Tower, Customs Office), wrecks, and every other ship. Drones, probes and unknown types are counted as left out.
- **No share link** here; it needs Firestore and expiry and is its own ticket.
