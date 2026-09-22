# Scope decisions — Blueprint Acquisition modal compares every source; a pick is one purchase (issue #1240)

_Recorded 2026-09-22 · issue #1240._

- **The modal lists Owned, Contracts (copies and originals), Market (incl. NPC-seeded), LP Store and Manual in one scrolling panel, every row pickable.** Contracts and Market read one Trade Hub's region, defaulting to the Build Plan's own hub; the modal's hub picker changes only what the modal shows, never the plan. Contracts can widen to every region. Every row is shown, cheapest first per section and marked — no cap.

- **A picked price is one purchase of that row, not scaled to the runs a node needs.** `overridePrice` on a Blueprint Acquisition line is the whole line's ISK (a quantity-1 line) and one override applies at every node resolving that blueprint, so a picked contract listing writes its whole ask, a market order its price, an LP offer one redemption. Exact for an original; a copy whose runs × quantity fall short of a node's need is underpriced, unlike automatic selection's whole-copies shortfall cost. The modal shows runs and ISK/run beside every copy's price so the pilot judges that; Manual covers a multi-listing buy. Scaling would need the node's needed runs in the modal and a per-node override — not built.

- **An owned-tier pick forces the tier only; every other pick forces tier and price.** The engine finds an owned tier among its own options and costs any shortfall itself. It cannot reproduce a specific listing, another region's order or an LP offer, so those carry their price.

- **Multi-type bundles and zero-price barters are listed, marked, sorted last and never pickable** — the same stance `20260915-093419` and `20260915-102046` take for automatic selection.

- **Market sell orders are the whole hub region, with the hub's own station marked; the section does not claim which orders are NPC-seeded.** ESI names no seller, and a 365-day duration is not a reliable enough hint to label on. Market originals are ME0/TE0.

- **LP Store picks are priced ISK cost + LP cost × the pilot's LP Value, default 0 (ISK only, labelled so), and are ME0/TE0.** ESI's LP offer carries no ME/TE and no runs. Turn-in items are noted, not priced.

- **Contract originals are read from the same Public Contract Offers snapshot, carried beside the copies as `originals`, not merged into BPC Sourcing's copy rows.** Automatic tier selection is unchanged — it still considers copies at the hub and the hub BPO sell price only.
