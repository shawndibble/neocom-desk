# Scope decisions — Hauling Opportunities: Any hub at one end (issue #2334)

_Recorded 2026-09-30 · issue #2334._

Amends `20260926-161750-hauling-opportunities-v1-scope.md` (one fixed From and To hub) and applies to both modes of `20260929-235337-hauling-opportunities-selling-into-buy-orders.md`.

- **From or To may be _Any hub_ (URL `from=any` / `to=any`), never both.** With one end on Any, each item is scanned on its single best lane from the fixed hub to the other four Trade Hubs, or from those four to it. Both ends on Any would be 20 lanes, which v1 does not scan. The pickers can't produce it: picking Any where the other end already holds it swaps the two ends, the same way two equal hubs swap. A hand-written link with both ends on Any shows a message and runs no scan.
- **The lane is chosen in the cheap pass and kept for the rest of the scan.** Pass 1 fetches Fuzzwork aggregates once per hub (five calls), and each item keeps the lane with the best gap in that pass. The history pass reads that lane's destination region, and the order-book pass reads that lane's two hub stations. An item is never shown on two lanes: the table and the Trip Plan are keyed by item.
- **The request caps stay overall, not per lane.** At most `MAX_PRICED_CANDIDATES` items reach the history pass and `MAX_BOOK_CANDIDATES` reach the order-book pass, whichever hubs they use. The order-book pass still costs two books per item, as for a fixed lane (ADR 0003).
- **Each row carries its lane, and a Hub column names the hub at the Any end**, in the table and the CSV. Only then: a fixed lane shows no Hub column.
- **Each row's sale is priced at its own destination's fees.** The broker fee follows the Character's standing toward that hub's owner, so with To on Any two rows can pay different broker fees. The row detail and the Trip Plan use the same per-row rates.
- **A multi-hub haul is still one Trip Plan.** With From on Any, the plan's items can be bought at different hubs. The plan does not route a pickup run between them. The Hub column is how the hauler sees where each item comes from.
