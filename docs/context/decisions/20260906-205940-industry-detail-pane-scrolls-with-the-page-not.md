# Scope decisions — Industry detail pane scrolls with the page, not inside itself

_Recorded 2026-09-06._

- **The Build Plan detail pane no longer gets its own `lg:`-gated inner
  scroller.** This reverses the "detail pane's inner scroll is `lg:`-gated"
  bullet of `20260902-110747-industry-side-by-side-layout.md` for Industry
  specifically — Mail and SkillPlans, which share the same two-pane idiom by
  that decision's own choice not to extract it into one component, are
  unchanged. On a wide screen the pane was capped to `window.innerHeight -
top - 24px` and given `overflow-y-auto`, so a plan with a tall materials
  table (a capital ship's worth of components, several of them expanded into
  their own sub-builds) scrolled in a small boxed region while the rest of
  the page sat idle — a second scrollbar next to the browser's own, on a page
  whose shell (`Layout.tsx`) already supports normal document scrolling with
  only the nav rail pinned (`sticky top-0 h-screen`). The list pane keeps its
  own cap unchanged; it is short by design and benefits from staying visible
  while the detail pane scrolls past it (`lg:items-start` on the grid
  already keeps the list from stretching to the detail's height).
- **`useViewportBoundedHeight` stays** for its other callers (Mail,
  SkillPlans' list pane, PlanEditor) — this is Industry's detail pane opting
  out, not the hook being wrong.
