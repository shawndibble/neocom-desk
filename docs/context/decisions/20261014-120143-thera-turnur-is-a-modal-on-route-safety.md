# Scope decisions — Thera / Turnur is a modal on Route Safety, not a Travel tab

_Recorded 2026-10-14._

- **Thera / Turnur is a modal opened from Route Safety, not a Travel tab.**
  The tab was a second page that answered "which open holes could I use?" and
  then sent the pilot back to Route Safety through a Route via link, with its
  own From and Route Preference that had to be kept in step with the page's.
  The modal answers it where the route is: it counts jumps from the page's
  From, under the page's own route rules, so a number in it is the number the
  route would use. It opens from the "Route through Thera / Turnur" label and
  a "Browse open wormholes" button in Route rules. It rules out a Travel tab
  and a `/travel/thera` page.
- **Use in route replaces Route via.** A visible `Button` (not a link) pins the
  chosen hole on the route's first leg (`pinFirstLeg`: `pin[0]` becomes the hole
  id, later legs keep theirs) and turns hole jumps on in the link only, never
  saved, then closes the modal. A pinned hole is looked up in the unfiltered
  list, so the page's ship size, minimum life and hub settings never hide it.
  Still offered only for a K-space exit a gate route reaches.
- **The From picker and Route Preference select are gone from the filters.**
  Origin and preference come from the page. Hub (with counts), Exit and Fits
  stay, as local state that starts fresh on each open, not URL parameters, in
  one row at one control size (DESIGN.md §3). This supersedes the filter set of
  `20261004-213447-thera-turnur-filters-are-selects.md` (Hub, Exit and Fits
  stay as in `20261003-190356-thera-turnur-back-to-a-slim-table.md`; the URL
  `space`/`hub`/`size`/`origin`/`pref` parameters and the phone chip menus go).
- **Old links keep working.** `/travel/thera` redirects to `/travel/route`,
  carrying `origin` as `from` and `pref`; the other old parameters are dropped.
  Conditions, never verdicts still holds: the modal states security, size and
  life left and calls nothing safe or unsafe.
