# Scope decisions — Corp assets location rows unfold on click; Show by item moves to a one-action row menu

_Recorded 2026-11-21._

- **A Corp assets row grouped by location unfolds on a row click.** Supersedes
  `20261120-211543-corp-assets-location-rows-unfold-their-containers.md`'s
  "the row's own click still opens the by-item view" and its caret-only
  toggle: that contradicted §6c (a leading chevron row opens in place and
  never navigates), and pilots expected the click to unfold. A container or
  ship inside opens its contents on a click, one level at a time; a loose
  stack's name is an `ItemInfoLink` (the row has no action of its own, so the
  name is the action). Before this, a loose stack did nothing.
- **Show by item is a one-action row menu (right-click and ⋮).** It links to
  the by-item view filtered to the row's place and division, where the old row
  click went. Recorded exception to §6c's two-real-actions rule, at the
  owner's request: the row click no longer reaches it and the Location filter
  is several steps away. The item is a real link, so a middle-click opens a new
  tab; no `openHref`, since the row click is an expansion, not a route. Rows
  with nothing stored get no menu. The trailing go-to arrow is gone.
