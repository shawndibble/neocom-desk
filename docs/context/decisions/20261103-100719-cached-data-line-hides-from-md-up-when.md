# Scope decisions — Cached-data line hides from md up when the header age badge shows

_Recorded 2026-11-03._

- **`CachedNotice` takes `withBadge`: on a page whose header shows a `DataAgeBadge`, the amber "Showing cached data · 3m ago" line is hidden from `md` up.** The badge already says how old the data is, so the line repeated it. Phones keep the line because the badge is hidden below `md`. A failed refresh still shows at every width, since the badge can't say that. Pages with no badge are unchanged.
