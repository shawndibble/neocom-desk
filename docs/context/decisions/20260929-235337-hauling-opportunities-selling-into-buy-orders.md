# Scope decisions — Hauling Opportunities: selling into buy orders (issue #2333)

_Recorded 2026-09-29 · issue #2333._

Amends `20260926-161750-hauling-opportunities-v1-scope.md`, which assumed every haul is listed for sale at the destination.

- **Hauling Opportunities has two modes, chosen per scan and kept in the URL (`mode=list|instant`): _Listing for sale_ (the v1 behaviour, and the default) and _Selling into buy orders_.** The mode is not remembered with the filters: a link says which one it means, and a hauler who never touches it keeps v1's view.
- **Selling into buy orders prices the realised buy-order price, not an Expected Sell Price.** The load is bought off the origin's sell orders cheapest first and sold into the destination's buy orders dearest first, unit by unit, and stops at the first unit that would only break even or lose after sales tax (`walkInstant`, `src/engine/market/haulingMarket.ts`). The price column shows the average those orders pay for that load. The undercutting argument behind the Expected Sell Price does not apply: a standing buy order pays what it says.
- **Margin in this mode is after sales tax only.** Nothing is listed, so no broker fee. This amends v1's "only the sale pays broker fee and sales tax".
- **Quantity is capped by the depth of both books, not a week of sales.** Days to Sell and demand are neither read nor shown: the region-history pass is skipped, and their columns, filters and CSV columns are hidden. The only default filter left is Margin over 3%. The Trip Plan names the cap `supply`.
- **Only buy orders placed at the destination hub station count.** A buy order's range is not read, so one placed elsewhere in the region is never assumed to reach the hub — the same rule `orderExits.ts` keeps.
- **A scan is cached per route, category _and_ mode**, so switching mode rescans instead of showing the other mode's rows.
- **Both modes gain an ISK/m³ column** (profit per unit over hauled volume), in the table and the CSV. Ships stay out of the category list, as in v1.
