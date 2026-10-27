# Scope decisions — an appraised row is an item: link, menu and hint

_Recorded 2026-09-08._

- **An appraised row carries the standard `ItemContextMenu`, not a menu of its
  own.** A priced line is an item like any other, and every action the menu
  already offers is apt on one: add it to the Quickbar, show info, add to
  Compare, view it in the Market, copy the name, open a Build Plan, open a PI
  Plan. Writing an appraisal-specific menu would have meant a second list of
  actions to keep in step with the tree's, the Quickbar's and the Variations
  table's, for no action they do not already have. This rules out
  paste-editing actions on the row for now — "drop this line from the list"
  is a plausible ticket, but it would be the first menu item anywhere in the
  app that rewrites the surface it was opened from, and it is not what this
  change is.

- **`ItemDetailModal` and `CompareDrawer` are not duplicated onto the tab.**
  `routes/Market.tsx` already renders both outside its `section ===` guards,
  so Show Info and Add to Compare work here with nothing but the menu wired
  in. A second copy scoped to the Appraisal tab would be two modals racing to
  answer the same state.

- **The item name links into the Market Browser via `MarketItemLink`, with no
  hub of its own.** `marketLinkParams` preserves whatever region/hub the URL
  is already scoped to and drops `section` — and that dropped `section` is
  exactly what `crossLinkedToBrowser` reads as an incoming item link, so the
  click lands on the order book rather than looking like a dead link on the
  tab it was pressed from. The paste survives the trip because `useAppraisal`
  lives at route level (`20260908-164742`). Hand-building the link from
  `effectiveHub` instead would quote the Browser at the appraisal's own hub
  even when the pilot never picked one — a second precedence rule diverging
  from the menu's own "View in Market", to fix a case the device's Location
  Mode already answers.

- **The hint sits on the result panel, not the paste panel.** `ContextMenuHint`
  says "these rows have a menu" (`20260908-130811`), and the paste box has no
  rows. It goes after the CSV download in the same action cluster, the order
  Assets and the order-book headers already use.
