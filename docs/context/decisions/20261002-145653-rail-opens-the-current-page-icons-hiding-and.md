# Scope decisions — Rail opens the current page, icons, hiding, and a tile More sheet

_Recorded 2026-10-02._

- **The rail lists each page's views under it, for the current page only.** A
  page with views (its `PAGE_TABS` tabs plus its `subViews`) carries a caret
  and a count. The page you are on opens itself; any other can be opened to
  peek without leaving, and changing pages closes everything but the page you
  land on. Views come from the same descriptor the palette reads
  (`navDestinations.ts`), never a second list. One level only: group, page,
  view — NN/g finds more than two disclosure levels hurts usability. Rules out
  flyouts and a rail that remembers which sections were open. The footer's
  Settings and Help are plain links: Settings has its own section rail, and
  Help's two tabs sit right on its page.
- **Skills' four views join the descriptor as `subViews`**, so Skills gets a caret
  like every other page with views, and the palette finds them.
- **Every page gets an icon**, in the rail, the phone's bottom bar and the More sheet. The map lives
  beside the shell, typed over every page path, so a page added without an icon
  fails typecheck; `navDestinations.ts` stays plain data.
- **A pilot can hide pages and views they never use.** Synced, not device-local:
  which parts of EVE a pilot plays is about the pilot, not the screen. Hiding
  touches the rail and the More sheet only. A page's own tabs never change, the
  palette still finds everything, and the phone's bar keeps whatever the pilot
  put there, since that choice is explicit and per device. Corporation,
  Settings, Characters and Help cannot be hidden. The editor is the rail's on
  desktop and the More sheet's on a phone. Order stays fixed (rules out
  reordering, as `20260913-095527` already did for the bar).
- **The More sheet becomes icon tiles, grouped like the rail, pages only.** Views
  are not listed — that put ~40 choices on one sheet. They are reached through
  the page's own tabs, a short Recent row, and the search field. Hidden pages
  fold into one row that expands in place, so the sheet still reaches every
  page (`20260913-095527`'s “never in neither” invariant). The 4 + More bar is
  unchanged.
- **Recent is device-local**: the last three places visited (a view, or a page
  that has none), other than the one you are on. It answers for this screen's history, not the pilot's.
