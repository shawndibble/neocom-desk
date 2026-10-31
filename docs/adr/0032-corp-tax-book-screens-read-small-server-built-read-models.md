# 0032 — Corp Tax Book screens read small, server-built read models, not the raw ledger

## Status

Accepted (2026-10-26). Issue #5247. Builds on ADR 0023 and ADR 0031; amends neither. The build tickets are #5254-#5261 (epic #5247).

## Context

`corps/{id}/observed` holds one **Observed Mining Entry** per miner, ore, day and refinery. An officer's open of the book reads all of it, and so did every feeder rebuild. Firestore Query Insights showed scans of 4,939 and 14,817 reads on that collection (#5234 description).

Two PRs cut the cost without changing the shape:

- #5233 (ADR 0031): rows carry a server `updatedAt`; an officer's device keeps them in Dexie and reads a delta. A first open, or one after a day, still reads everything.
- #5234: a server-only per-day mirror (`feederObserved`) for feeder views, and `limit(1)` existence checks.

Both leave the collection growing and the first read whole. The page-by-page review in #5247 found why a smaller read is not a smaller query: `buildBookView` (`src/engine/corpTaxBook/bookView.ts`) derives charges, day status, owed, overdue days, credit, standing, needs-you items, totals and health from the full entry set, and `useCorpBook.ts` (around line 160) loads dated prices for every ore and every mined day.

Facts the design rests on:

- **Statements are frozen.** Create-only, with frozen lines (day, structure, ore lines, unit prices, tax %). Payments, dismissals, adjustments and write-offs are small per-miner collections. A paid Statement's days stay closed (D22).
- **Only unbilled and unpaid days are open.** Late prices, new rates and dismissals only ever change those.
- **Rows carry no extraction id.** The engine derives it at read time: `moonOnDay` (`src/engine/corpTaxBook/sync.ts`, line 290) scans Extractions and returns the first match; `placeObservedRows` stores only `moonId` and `solarSystemId`, each write-once and only when absent.
- **Residue is not in the ledger.** `minedDuringExtraction` and `minedVsLeft` (`src/engine/corpTaxBook/extraction.ts`, lines 218 and 246) give the combined loss (Residue plus ore never mined), because delivered ore is all the ledger records.

## Decision

Screens read **Read Models**: small docs the server builds from raw rows and events. The raw ledger stays stored and is read in bulk only by the server and by a member's own rows.

### Shape: frozen history plus a small open set

- **Statements are the frozen history.** Per-moon, per-ore amounts come from their frozen lines; the device groups lines by moon.
- **The open set is computed on the device.** It loads a miner's unbilled and unpaid days and runs the existing engine, so late prices, rate changes and dismissals never need a stored total recomputed.
- **Miner doc.** A NEW collection, proposed name `minerTotals` (to confirm in phase 1); `miners/{minerId}` already exists as grouping docs (in `VERSIONED_COLLECTIONS`, with rules), and those docs and rules stay untouched. Running totals of the frozen part only (billed, paid, lifetime mined, value, tax), updated on events: Statement issued, payment recorded or matched, dismissal and reversal, adjustment, write-off, rebill, regroup. Not on ledger-row merge, which removes the hot-doc contention of officer sync, the 6-hourly sync and a feeder pull writing one doc. Volatile fields (balances) stay out of large lists.
- **Miner list doc.** One doc with the sortable and filterable fields of every miner, small enough to load whole. The Miners tab searches by name, and names are never stored: ESI resolves them by character id. Standing (member, left, guest) needs current ESI membership and is never stored.
- **Per-pull moon doc.** One per `extractionId`, built server-side from raw structure-and-date rows, never from miner docs. It holds per-ore mined quantity from every row at that structure in the fracture-to-expiry window (including rows no charge covers: before the book, unrated, outside coverage, guests, feeder rows), `minerCount`, per-ore chunk total and its source (notification, survey, unknown), total tax under the frozen-or-live rule (frozen once a Statement issues, D22), and the Fully Mined flag. Past cycles read each pull's `minedPct` (`bookView.ts`) and `minerCount` from it. A moon page is one read.
- **Miner row fields.** Owed (excludes credit), overdue days, unbilled vs pending, credit, last paid, paused, character ids, tolerance and officer write-offs are either fields of the miner list doc or computed from the open set. Phase 1 decides each by whether it changes on an event (stored) or with now and prices (computed).
- **Overview doc.** Outstanding and overdue miners, declarations, unmatched and unattributed payments, leavers with debt, unrated count, ledger gaps, health flags, and a rolling window of Extractions with state counts. State, overdue days, billable-through and "in chunks" ISK depend on now and today's prices: the doc stores inputs and the device computes on read.
- **Feeder summary only.** A **Feeder** sees the existing `feederViews` summary (minedVolume, minedValueIsk, accruedIsk, paidIsk, balance). Day lines show only what the in-game mining ledger shows: character, ore, quantity, structure, date. `FeederViewDayLine` today has only `characterId`, `structureId`, `volume` and `valueIsk`, so showing ore is a new field on the server-built line, not just a trim. Per-line value, due and % are dropped, and character names come from ESI by id. A corp that owns its moons and runs its own taxes sees what an officer sees.

Larger docs are fine; one doc is one read whatever its size. Each stays under 1 MiB, and a write rewrites the whole doc, which is why volatile fields stay out.

### `extractionId` on every row

Stamp every ledger row with `extractionId` at write time and backfill old rows. The format is the existing Extraction doc id, `{structureId}_{startTimeMs}`; keep it.

**Assumption (owner decision): a refinery never pops a new rock on the day the previous one expires.** The minimum cycle is 6 days (owner statement, no code source). A pull's window runs from the fracture day through the expiry day inclusive; expiry defaults to 48 h and is capped at 96 h (`DEFAULT_EXPIRY_HOURS`, `MAX_EXPIRY_HOURS`, `src/engine/corpTaxBook/extraction.ts`), so a window covers at most 5 calendar dates, under the 6-day cycle. So every `(structureId, date)` belongs to at most one pull and the lookup is deterministic, with no "newest pull wins" rule. The phase 1 verifier writes a health flag whenever two pulls at one structure cover the same day, and treats that as bad data to surface, not a case to resolve. A pull is never ended early by "mined out": only the expiry window or a cancel notification ends it; the Fully Mined flag does not end it.

Stamping must use the per-structure expiry so write-time and read-time agree: `moonOnDay` (`sync.ts`) takes no per-structure expiry and uses the 48 h default, while read-time placement (`placeOfFactory`, `bookView.ts`) uses the per-structure expiry. The stamping code passes the per-structure expiry, and so does the backfill.

An Extraction correction rebuilds the affected moon doc and re-stamps its rows. Regroup, and rate or start-date changes, change miner ids (`solo:<characterId>` changes on regroup) or charges, and each needs a defined rebuild of the miner doc and list: regroup moves the frozen totals from the old miner ids to the new; a rate or start-date change touches only open days, so it rebuilds nothing stored. Phase 1 writes these as tests.

### Fully Mined flag and Residue

Residue is ore that came off the rock but was never delivered. Per moon and ore: chunk total minus the ledger's mined sum.

- An officer marks a moon **Fully Mined** any time after it pops, through a router action that writes who, when and an audit entry.
- Flagged: lost ore is Residue, shown as the real Residue % per ore. Unflagged: the combined loss is shown and labelled as such. With no chunk source (unknown), neither is shown.
- The moon doc stores the inputs (per-ore chunk total, per-ore mined, flag), so the percent follows when the flag changes.
- The control sits in the moon detail view. It is a new visible element, so its ticket is `ready-for-human`; DESIGN.md §6c: the detail view already carries the action, so no new row control.

## Correctness requirement

Running totals must equal a full recompute. Three gates:

1. **Property test.** Random sequences of events (new rows, late growth, rate changes, per-moon rates, dismissal and reversal, rebill, adjustment, write-off, payment, Statement issue, extraction correction, regroup) must leave every running total equal to the pure engine's full recompute (`src/engine/corpTaxBook`, mirrored in `functions/src/corpTaxBookEngine.ts`). `functionsMirror.test.ts` and `syncMirror.test.ts` stay green.
2. **Scheduled verifier.** Off-peak, per miner, it recomputes from raw rows, writes any mismatch to the audit log and a visible health flag, and repairs the read model. It also writes the overlapping-pulls flag above. It ships in phase 1; until then phase 0 only stamps.
3. **Shadow mode.** Write the read models, keep screens on the old path, compare in production for about a week, then switch screens one at a time.

## Screens that still read raw or open-set rows

Rare or per-miner; cached in Dexie where it helps: the Statement run and period table (every miner's open days, once per period), Statement issue, close account, rate override, dismiss selected days, rebill, the xlsx export (the whole ledger by design, assumed to stay so), the sync merge, the verifier, and the member overlay. The Verify page needs only the Statement and its payments.

The member `/mining/tax` overlay needs per-day, per-character, per-system own rows for the split-day check and the personal-ledger diff, so `uid` day rows stay for members. A per-moon doc is the wrong grain for them, and they are not limited to "last N" without checking the unattributed labels for older days.

## Privacy

- A feeder reads only the server-built summary and day lines above, behind an allow-list. `feederViews/{feeder}/days` has no pagination today and its lines expose `characterId` and a value: page it and trim it (phase 6).
- Members read only own-line docs (`uid == auth.uid`), unchanged.
- Officer-only read models follow the existing officer rules and ADR 0031's wipe-on-refusal behaviour for any Dexie copy.

## Weekly cadence, D22, versions

- A book can bill monthly or every N days (`StatementCadence`). No read model assumes Statement equals month.
- D22: late ore on a paid day is written off, never rebilled. Frozen unit prices per charge key stay frozen. The moon doc's tax total flips from live to frozen when a Statement issues.
- Each new collection gets a version stamp, goes in `VERSIONED_COLLECTIONS` (`functions/src/corpTaxBookVersionKeys.ts`) and `CORP_COLLECTION_FAQ_ITEM` (`src/features/faq/whatWeStore.ts`), with rules and rules tests. New docs carry a server `updatedAt` (ADR 0031) so a client's cache key is the stamp. `observedThrough` is a different thing: a per-structure field on the book doc (`functions/src/corpTaxBookObservedThrough.ts`, #5059), not a per-doc cache stamp.

## Migration

Additive and backward-compatible, because dev and production share one Firebase project. The server writes read models alongside the existing collections; backfill builds them from existing rows. Old clients keep reading `observed` during a dual-read period, and the raw collection is removed from no client until the last phase has soaked. No new deployed function: new writes are router actions (`deployedFunctions.test.ts`). Cloud Functions are not auto-deployed, so a client switching screens must tolerate a missing read model and fall back to the old path.

## Read budget per screen

Estimates, not measurements. Today an officer open is thousands of reads.

| Screen               | Estimated reads                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Miner page           | about 1 (miner doc) plus the open days, a page of Statements, payments and dismissals: tens |
| Moon page            | 1 (moon doc)                                                                                |
| Overview             | about 1 plus the Extractions window (about 10)                                              |
| Miners tab           | 1 (miner list doc)                                                                          |
| Moon owners tab      | 1 summary per feeder, from `feederViews`, instead of every entry                            |
| Member `/mining/tax` | own rows, as today                                                                          |

## Consequences

- Officer screens stop scaling with ledger size; the first open after a day stops costing a full read (phase 5).
- Two derivations of every number exist (engine and read model). The three gates above are the price, and a failing verifier is a visible health flag, not a silent drift.
- `extractionId` becomes load-bearing: a wrong id puts ore in the wrong moon doc. The no-overlap assumption is unconfirmed in code or docs; the verifier flag is what shows it wrong.
- The moon doc is built server-side from raw rows, so the server keeps reading the full ledger (cheaply, off the officer's path).
- The Dexie row copy of ADR 0031 matters far less after phase 5 but stays for the screens listed above.

## Risks

- A hot miner doc under contention. Mitigated by updating on events, not rows, with idempotent deltas; Firestore's per-transaction write limit applies; the scheduled merge takes 2000 rows per call (`OBSERVED_PER_CALL`, `functions/src/corpTaxBookScheduledSync.ts`) and `mergeObservedInto` commits them in transactions of 200 rows (`CHUNK`, `corpTaxBookStore.ts`).
- A backfill that misassigns old rows if an Extraction was corrected or is missing. The backfill reports rows it cannot assign.
- Docs growing past 1 MiB (a very long pull history). Page old moon records into separate docs.

## Considered Options (rejected)

- **Per-month buckets.** Books bill weekly or every N days; a bucket would assume Statement equals month.
- **Postgres or another database.** A second store for one feature, with its own auth, rules and deploy; Firestore rules already gate the book.
- **Pulling everything from ESI each time.** The observer ledger keeps a short window of history, so the book is the only long-term record (ADR 0023).
- **Client-live-from-ESI.** Same history limit, and an officer's token and error budget would carry every screen.
- **Rows packed as arrays, aggregation count/sum queries, Cloud Storage archives.** Not needed once screens read read models.

## Phases

Tickets #5254-#5261 cover these.

0. `extractionId` on every row, with backfill (#5254). Stamping only; no verifier yet.
1. Miner doc (`minerTotals`) in shadow mode, with the property test, the scheduled verifier and its overlap flag (#5255).
2. Miner page switches to miner doc, open set, Statements, payments, dismissals, behind `CORP_BOOK_MINER_SCOPED_READ` (#5258; reads all of one Miner's Statements, see docs/context/decisions/).
3. Moon doc and the Fully Mined flag (control `ready-for-human`); moon page switches.
4. Overview doc and miner list doc; overview and Miners tab switch.
5. Stop loading the full ledger in the officer client; replace the per-day price load with prices for open days and the moon page's window.
6. Tighten the feeder view: page and trim `feederViews/{feeder}/days`.

## Open questions

- Can an officer clear the Fully Mined flag? Undoing changes the residue shown and the audit trail; undecided. The owner decides, and phase 3 ticket #5257 settles it.
- Miner page paging rule: page by Statement, not by 10 moons.
- Where do dismissed amounts show once a Statement is issued? The miner page lists them today.
