# Scope decisions — Dump exit and Appraisal Sell now walk every buy order whose range reaches the station (issue #5653)

_Recorded 2026-10-30 · issue #5653._

- **Open Orders' Dump exit and Appraisal's Sell now (and Compare Hubs' buy totals on the live book) walk every buy order whose range reaches the station, dearest first.** This amends the older station-only rule ("the app does not read range", e.g. `20260906-170442`, `20260906-215500`) for these exits only. Owner's choice, 2026-10-30. ESI orders carry `range`, `system_id` and `min_volume`, and both surfaces already fetch the region book, so the capability gap that justified the rule is gone.
- **Reach:** an order at the station; `region` range in the same region; `solarsystem` in the same system; a jump-count range ≥ the gate distance from the order's system to the station's. Jumps count over the plain stargate graph, shortest path. Never Thera/Turnur holes, Ansiblex bridges or the pilot's avoided systems: a buy order's range is gates only.
- **Walk rules:** an order whose `min_volume` exceeds the units still to sell at that point is skipped. Units no reachable order takes are shown as unsold, never priced at zero or at the top bid. A line is marked only when the walk moved the price below the top bid or left units unsold.
- **Unchanged:** paths that price from the hub-books snapshot or Fuzzwork aggregates (no range), Hauling, Open Prices, mining prices, Build Plan revenue and the LP Store keep the station-only best bid.
