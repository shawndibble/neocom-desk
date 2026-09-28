# Scope decisions — esiCache retention: age-prune per-id rows

_Recorded 2026-09-28._

- **Per-id `esiCache` rows are deleted once they are far past their
  staleness window; single-row-per-Character rows never are.** Keys such as
  `name:<id>`, `type:<id>`, `station:<id>`, `public-character:<id>`,
  `mail:<id>` and `marketPrice:<station>:<type>` are one row per id the app
  ever looked up, so nothing bounded them. Keys such as `skills`, `assets`,
  `contracts` and `mail:headers` are one row per Character, are refreshed on
  every visit, and are the user's main data. `src/esi/cachePrune.ts` keeps an
  allowlist of anchored per-id patterns; a key matching none is never pruned.
  This rules out a size cap or LRU over the whole table.

- **Windows: 30 days for static-tier ids, 7 days for market rows.** Static
  rows (`STALE_AFTER.static`, 24 h) refetch after a day anyway, so 30 days is
  30x their window. Market rows (`marketPrice:`, `market-history:`,
  `structure-market:`, `marketHistory:`) go stale in 5–15 minutes, so a week
  is still generous. A new `marketHistory:<start>:<end>` key appears every
  day. Every allowlisted key has a loader that refetches on a miss, so a
  pruned row costs at most one lookup if it is ever wanted again. Keys that
  some reader consults cache-only, with nothing to refill them, are excluded
  instead (below).

- **Age is the last successful fetch, not the last read.** A row served from
  cache does not get younger. A row whose refresh keeps failing can be pruned
  while still in use, and then shows its raw id until a fetch succeeds. One
  example is a `/universe/names` batch that ESI rejects because of one invalid
  id. Accepted: 30 days of failed refreshes is already a broken lookup. Also
  `group:` rows: `loadGroupNames` fetches only missing ids and never refreshes
  a cached one, so a group name in steady use is dropped and refetched once
  every 30 days. That costs one GET per group.

- **Mail bodies, calendar event details and contract items stay while their
  list still points at them.** `mail:<id>`, `calendar:<id>` and
  `contract-items:<id>` are kept, whatever their age, while the same
  Character's `mail:headers`, `calendar`/`calendar:seen` or `contracts` row
  lists that id. That keeps offline reading of anything still on screen. Once
  the id has dropped off the list, the row is unreachable from the UI and is
  pruned like any static row.

- **Cache-only rows (PI, `system:`, citadel names) and `corp:` rows are
  excluded.** The alt-colony view reads `planet:`, `planet-info:` and
  `schematic:` cache-only, and those are bounded by the roster's colonies.
  The PI Advisor reads an alt colony's system security cache-only
  (`readCachedSystemSecurity`). A pruned lowsec or nullsec `system:` row would
  read as highsec and apply the wrong customs rates, and nothing would refill
  it. `system:` is bounded by the ~8k systems anyway. Corp-owned rows already have their own
  purge path (`purgeCorpScopedCache`). A citadel's `structure:<id>` row is
  ACL-gated: once a Character loses access, every refetch is a 403 that never
  rewrites it, so a pruned name could never come back. Only its 24-hour
  `:forbidden`/`:roster-forbidden` memos are pruned.

- **At most once a day, online only, well after boot.** The prune runs 60 s
  after mount, in an idle slot, from its own chunk. A `settings` stamp is
  claimed in one transaction, so two tabs don't both run. It never runs
  offline, where a pruned row could not be refetched.

- **Ages come from `esiCacheMeta` (#2247), never from values.** No schema
  bump: meta is scanned in primary-key pages. Rows with no meta were written
  before that table existed. They are pruned by key once the persisted
  first-run stamp is older than the rule's window. That key-only scan stops
  for good once a run finds no allowlisted meta-less row, because none can
  appear later. Deletes go in chunks of
  200, each in a short transaction that re-reads the chunk's meta first. A
  row refreshed after the scan is left alone.
