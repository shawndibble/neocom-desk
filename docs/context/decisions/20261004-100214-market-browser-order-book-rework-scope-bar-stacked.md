# Scope decisions — market browser order book rework: scope bar, stacked side cards, variations tab

_Recorded 2026-10-04._

- **A scope bar above the Order Book mirrors the finder's filters.** It says
  where the book is reading — the hub station with its security and distance,
  the region, or "Within 5 jumps of Badivefi · 6 stations" — and edits the
  same `BrowserFilterValue` the finder's funnel does: Distance inline, the
  rest behind its own funnel (a popover, a bottom sheet below `md`). The
  finder keeps its funnel (20260929-204125: the range is set before
  searching); this adds the control where a reader looks for "why is the book
  showing this", and is the only way to it on a phone, where the finder is
  hidden once an item is open. Rules out moving the filters off the finder.
- **Sell and Buy stay separate tables, now each its own card, stacked Sell
  over Buy at every width and in every Location Mode.** Setting a range never
  re-lays the page; only width does. A phone shows one side at a time behind
  a Sell | Buy toggle that carries each side's count and best price; the
  other card is hidden by CSS, not unmounted. Station shows on every row in
  every mode (it was considered for removal in Trade Hub mode, and kept: a
  station name is what a pilot flies to). Rules out side-by-side Sell/Buy and
  any mode-driven layout switch.
- **Price ties sort nearest first.** Each side is ordered best price first,
  then by jumps from the Current System; an order that can't be placed sorts
  after the measured ones at its price.
- **An expanded order row carries facts about that order only:** fill,
  age, value, gap to the best, and what buying (or selling) the book down to
  it takes, plus Set destination (one autopilot waypoint, the same ESI call as
  Route Safety's), Only this station and Copy price. The item's Required
  Skills moved out of every row into one disclosure under the item name.
  Order rows no longer carry the trailing More actions button; the context
  menu stays on right-click / Shift+F10, and its common actions are buttons
  in the expanded row.
- **Bait sells are flagged, never hidden:** a sell asking 10× the best sell
  or more carries "N× best" beside its price.
- **A set range adds a hub comparison line** — the header's hub (or region)
  best sell and buy against the best in range, signed, with jumps, View (clears
  the range) and Set destination. Its prices come from the same per-item cache
  the Variations rows use at the header's scope, so the two can't disagree.
- **Variations is an item tab** beside Order Book and Price History, grouped
  by meta tier, a tier with no sell orders at the header's scope folded shut,
  with a signed "vs <item>" sell delta and the item's own prices on top. The
  tab stays when an item has no variations, as an empty state, so the tabs
  never move between items. Rules out Variations under the order book.
- **The Browser tab widens to 96rem** (other Market tabs keep 6xl) and its
  finder column is sticky. Expires drops out of the table below ~1680px
  (105rem) and Min. volume below 1920px, where Location needs the room; both
  remain in the expanded row. The Cum. qty column was dropped after use (the
  expanded row's depth line still gives units and ISK to that row). Below a 48rem order-book width
  (a 1024–1366px window beside the finder) the rows become the phone's
  two-line card, picked from the book's own width (ADR 0017).
