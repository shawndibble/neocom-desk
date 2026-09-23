# Scope decisions — Mining Overview keeps 90 days of ledger history on the device (issue #1278)

_Recorded 2026-09-22 · issue #1278._

- **The Mining Overview keeps up to 90 days of each Character's mining ledger on the device.** ESI's personal mining ledger only returns the last 30 days, so a 90-day view is impossible without keeping what was already fetched. Each fetch merges into the saved rows (key: date + system + type; the newest fetch's quantity wins, since today's row grows through the day; rows one fetch reports twice for the same key are summed first). Days older than 30 can never be re-fetched, so history lives in its own Dexie table (`miningLedgerHistory`), not an `esiCache` row that "clear cache" would drop. Device-local, not synced; deleted with the Character.
- **The 90-day prune counts back from the newest day held, not the wall clock.** The merge then depends only on its inputs, and a pilot who stops mining keeps their history until a newer day arrives. The Overview's range filter still hides anything outside the chosen window.
- **Ranges are 90d / 30d / 7d / Today — no "All".** With history capped at 90 days, "All" would always equal "90d". Every range counts today as its first day (EVE/UTC dates).
- **The Tax tab is unchanged.** It still reads ESI's 30-day ledger directly; nothing about Assignments or Payees reads the saved history.
- **History starts when this ships.** Days before the first fetch after upgrade are gone for good; the "Days covered" card says when saved history starts rather than showing those days as unmined.
