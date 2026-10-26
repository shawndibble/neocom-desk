# 0031 — An officer's Corp Tax Book `observed` rows persist in Dexie and are read as a delta

## Status

Accepted (2026-10-26). Amends the "in memory, per tab" choice of issue #5047 (`bookCache.ts`) for the `observed` collection only.

**Amended 2026-10-26** (`docs/context/decisions/20261026-111953-*`, issue #5243): the book's other parts persist too (`corpBookParts`) under the same wipe paths, and `BOOK_CACHE_MAX_AGE_MS` is 24 h, not 1 h.

## Context

`observed` is the largest part of a book: one row per miner, ore, day and refinery, thousands of reads. The in-memory copy saves re-reads only inside one tab session; every reload, and every scheduled sync (which restamps `observed`), read the whole collection again. The rows are officer-only (`firestore.rules`: officer or own line), which is why the copy was kept in memory: nothing officer-only outlived the page.

## Decision

- Each officer's device keeps the rows in Dexie (`corpBookObserved`, with `corpBookObservedMeta`), keyed by Character + corporation. Device-local, never synced.
- The server stamps every row it writes with `updatedAt` (a server timestamp, set in `mergeObservedInto`; additive, old readers ignore it). A merge rewrites a row in place, so a date field cannot name "changed"; `cachedAt` is the ESI response time, not the write time.
- Opening: the version stamp unchanged and the check under an hour old (`BOOK_CACHE_MAX_AGE_MS`): zero collection reads. Otherwise read rows with `updatedAt >= watermark - 10 min` (the overlap covers transactions that commit out of stamp order) and upsert them by document id. The watermark is the newest `updatedAt` held. No watermark (nothing stamped yet, or a copy from before the field), or the last full read over a day old: read the whole collection and replace the copy.
- Only deleting the whole book removes `observed` rows (`deleteBook`), so a delta cannot miss a single removal; a device that finds the book gone drops its copy, and one that never looks while it is gone keeps ghost rows until the daily full read. The daily full read bounds anything else (a write by a server from before the stamp, a clock oddity).
- Privacy: `meta/paid`, officer-only, is still read fresh on every open and settles before any copy is handed out. The copy is wiped when that read or the delta query is refused (`permission-denied`), when the officer check fails or says the Character may not view, on Character removal, and with the whole database on logout-all. One book is kept at a time: opening another Character or corporation drops the rest.
- Dexie being unavailable costs the copy, never the read.

## Consequences

- A reload or a sync costs the rows written since, not the collection. A first open, or one after a day, still reads it all.
- Officer-only rows now sit at rest in this browser until removal or a refusal, like the Character's tokens and ledgers already do. A Character who lost officer standing keeps the copy until their next open of the book (the check runs on every open) or until they are removed.
- A row an older server version wrote without `updatedAt` is missed by a delta while the copy has a watermark; the daily full read is the bound. A restamp with no new row cannot be told from that case, so it is not treated as a reason to read everything.
- Rows written before the server stamped them stay unstamped until a merge rewrites them; they come through the full read.
