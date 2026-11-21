# Scope decisions — Corp assets location rows unfold on click; Show by item moves to a one-action row menu

_Recorded 2026-11-21._

- **A Corp assets row grouped by location unfolds on a row click.** #6521 gave
  the row a leading caret that only the caret button toggled, while the row
  click still opened the by-item view. That contradicted §6c (a leading
  chevron row opens in place and never navigates) and pilots expected the
  click to unfold. Clicking a container or ship row inside opens its contents
  the same way, one level at a time. Clicking a loose stack opens Show info
  for its type. Before this, a loose stack row did nothing.
- **Show by item is a one-action row menu (right-click and ⋮), plus Open in
  new tab.** It is the by-item view filtered to the row's place and division:
  the destination the old row click went to. Recorded exception to §6c's
  two-real-actions rule, at the owner's request. The row click no longer
  reaches it, and the Location filter is several steps away. Rows with
  nothing stored get no menu. The trailing go-to arrow is gone.
