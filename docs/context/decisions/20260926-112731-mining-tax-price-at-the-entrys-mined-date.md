# Scope decisions — Mining Tax: price at the entry's mined date, not today's live price (issue #523)

_Recorded 2026-09-26 · issue #523._

- **Mining Tax now prices each mined entry at its own `entry.date`, not
  today's live buy order.** Before this, every Assign/Split/Join/re-review
  action valued ore at whatever Fuzzwork quoted _at that moment_ — the same
  "one arbitrary number, whenever you happen to click" class of issue the
  Mining Yield Overview's day-mined pricing already fixed (issue #1279). A
  bill created a month after the ore was mined was priced as if it had been
  mined that day. Now it's priced at what it was actually worth the day it
  came out of the rock, via the same `saved` → `historical` → `live` chain
  the Overview uses, minus the ESI `average` tier (Tax has no basis selector;
  see the next point).
- **New resolver, not a reuse of `resolveUnitPrice`:** `resolveTaxUnitPrice`
  (`src/engine/miningTax/priceBasis.ts`) chains buy-side `saved` →
  `historical` → `live`, with `live` **unconditional on date** — unlike the
  Overview's resolver, which only falls to live for today/yesterday (an older
  day with no ESI history there is a type that doesn't trade). Tax has no ESI
  `average` tier to fall to first, so a day nothing was ever captured for
  still bills at today's live price, exactly as it did before this fix. This
  is a floor, not a compromise: no ore that used to get a real number now
  reads as "unpriced."
- **Already-stored `MiningTaxAssignmentRecord`s are never retroactively
  repriced.** `computeAssignmentValue`'s doc comment already called this out
  as invoice semantics — a snapshot taken once, at assignment time — and this
  fix changes _which_ price feeds that one-time snapshot, not when it's
  taken. Only a fresh Assign/Split/Join/re-review action prices anything.
- **`resolveNeedsReview` re-prices at `assignment.date`, not "now".** A
  re-review re-snapshots the same mined ore's value after ESI reports growth
  on the day; the day it was mined didn't move just because the pilot came
  back to reconcile it later. This is a deliberate, real behavior change from
  the prior "re-review always re-prices at today's live buy."
- **`splitAssignment` prices both sides at the original entry's mined date**
  (previously "current buy orders", per its own doc comment) — a split only
  changes _who_ is billed, never _when_ the ore was mined.
- **`joinAssignments` takes a `pricesOn(date) => map` resolver instead of one
  flat `unitPrices` map.** A join's whole purpose is combining entries from
  _different_ mined dates (a session spanning midnight UTC), so one shared
  price map was already quietly wrong under day-mined pricing — each
  still-unassigned member is now priced at its own date.
- **`src/features/market/hubSnapshot.ts` generalized to take any `TradeHub`,
  default Jita.** The Firestore read is hub-agnostic (every doc carries all 5
  hubs' captures); only which station's bucket gets read changes. A non-Jita
  hub gets `saved` (server fuzzwork capture) going forward, same as Jita, but
  never `historical` — the Adam4EVE backfill is deliberately Jita-only
  (`functions/src/index.ts`'s `BACKFILL_HUB`), to keep that one-time job
  small. A non-Jita Payee's older, never-captured days simply fall to `live`,
  same as before this fix existed for any hub.
- **The per-browser Dexie snapshot (`priceSnapshots.ts`) only ever merges in
  for Jita.** It has no equivalent for the other 4 hubs (it was built for the
  Overview, which only ever reads Jita), and adding one wasn't in scope here.
- **Per-hub "unpriced" banner stays a union across dates, not per-date.** A
  type unpriced on _any_ date it appeared at a hub still lights the banner —
  coarser than the underlying per-row math (which is genuinely per-date via
  `pricesAtHubOnDate`), but the banner is a heads-up, not a computation, and
  this preserves its pre-existing one-Set-per-hub shape rather than a UI
  rewrite to show which specific days are affected.
