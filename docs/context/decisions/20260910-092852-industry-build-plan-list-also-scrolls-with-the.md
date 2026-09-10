# Scope decisions — Industry build plan list also scrolls with the page, not inside itself

_Recorded 2026-09-10._

- **The Build Plan list pane no longer gets its own `max-h-[28rem]`
  `overflow-y-auto` inner scroller either.** This reverses the "the list
  pane keeps its own cap unchanged; it is short by design" bullet of
  `20260906-205940-industry-detail-pane-scrolls-with-the-page-not.md` — that
  decision stopped the detail pane from getting a boxed inner scroller but
  kept the list capped on the theory that a short list benefits from
  staying visible while the detail pane scrolls past it. In practice a plan
  list on a busy account outgrows 28rem quickly, and having only one of the
  two side-by-side panes scroll internally reads as inconsistent — the list
  grows a second scrollbar next to the browser's own while the detail pane
  next to it does not. Both panes now grow with their content and the whole
  page scrolls together, with only the nav rail pinned (`Layout.tsx`'s
  `sticky top-0 h-screen`), matching the detail pane's behavior.
  `lg:items-start` on the grid still keeps the list from stretching to the
  detail pane's height when the list is shorter.
- Mail and SkillPlans, which share the same two-pane idiom by
  `20260902-110747-industry-side-by-side-layout.md`'s own choice not to
  extract it into one component, are unchanged — this is Industry's list
  pane opting out, same scope as the earlier detail-pane decision.
