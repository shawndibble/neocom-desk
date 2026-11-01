# Scope decisions — Characters: ISK default column, Net worth column, no PI chip on cards, no jump on switch

_Recorded 2026-11-01._

- **The wallet column is the "ISK" column and shows by default.** It was always the ISK balance (`wallet:balance`), never a total value; only the label changes ("Wallet" → "ISK" on the card chip, the table header and the sort menu). It stays right after SP in the catalog's order. Pilots who already saved a column choice keep it.
- **A "Net worth" column follows ISK, off by default.** It reads each Character's newest **Net Worth Snapshot** and sums every layer (ISK, assets, buy-order escrow, sell-order stock, contracts). It fetches nothing, so a Character the app has not snapshotted yet reads "—" like every other unknown cell in the table, and the tooltip names the snapshot's day and its layers so a stale figure never looks current. No totals row: the table has none.
- **Cards lose the PI chip.** Supersedes the PI half of `20260925-230353` (its Alerts chip stays). PI attention stays in the table's PI column.
- **Picking a Character on Characters no longer navigates when there is nowhere to return to.** `returnPathAfterSwitch` returns `null` for no origin or an origin of `/characters` itself, and the page stays put. A switch that started on another page's switcher still returns there, with the previous Character's ids dropped (#1764, #4691).
