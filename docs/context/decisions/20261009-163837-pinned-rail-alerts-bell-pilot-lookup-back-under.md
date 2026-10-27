# Scope decisions — Pinned rail, alerts bell, Pilot Lookup back under Travel, view picker for 4+ tabs

_Recorded 2026-10-09._

The rail had 17 destinations under four headings and five of them expanded
into tabs, which is a lot to choose from. Regrouping and folding groups were
rejected (relabeling, and nesting inside nesting). These keep the page list
and cut what is on screen.

- **The rail shows a short default set; the rest sit behind a flat "N more
  pages" row.** "Hide pages you don't use" (`useHiddenNav`, synced) is already
  this list stored the other way round, so there is one list, not two. The
  default for a new pilot is Overview, Skills, Industry, Ships, Market, Assets,
  Wallet and Travel. A first-run question ("What do you do in EVE?": mining, PI,
  trading, industry…) sets the starting set. Hidden pages open in place as a
  flat list, with a + to show one permanently; Ctrl K and Recent reach them
  without changing the rail. No backwards compatibility: existing hidden lists
  are not migrated, everyone gets the new default and the question once.
- **Alerts leaves the rail for a bell in the page header, on every page.** It
  shows the unread count and renders nothing at all when there are no alerts, so
  a phone header with other icons in the corner stays clear. The Alerts page is
  still a route, reachable from the bell and Ctrl K.
- **Pilot Lookup becomes a Travel tab again, and the Intel group goes.**
  Supersedes the "Pilot Lookup becomes its own page" half of
  `20261002-145653-lp-store-under-market-pilot-lookup-its-own`; its reasons
  (nobody looks for it under Travel, an Intel heading over one item) are gone
  with the heading, and Ctrl K and the short rail make it findable. Travel moves
  to the end of the Progression group. `/pilot-lookup` redirects to the Travel
  tab. A group heading with no visible item is not drawn.
- **A page with four or more tabs shows a view picker instead of a tab strip on
  a phone.** Today that is Skills (4), Industry (4) and Market (6); every other
  page has three or fewer and keeps the strip. The count is the page's full tab
  list, not what is left after a pilot hides views, so a page never flips
  between strip and picker. The picker is the page's title row (page name and
  current view), not a form field, so it reads as navigation and the filters
  under it still read as filters. Chips were rejected: they read as filtering
  the current page and a long list wraps to three rows. History's own view
  select stays. The 3-tab pages with long labels (Contacts, Contracts) are
  checked at 360px and join the picker if they do not fit.
