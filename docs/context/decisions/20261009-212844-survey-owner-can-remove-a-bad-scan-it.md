# Scope decisions — Survey owner can remove a bad scan; it is set aside, never deleted

_Recorded 2026-10-09._

- **A Survey's owner removes a bad paste by setting it aside; nothing is deleted.**
  Each change is one create-only doc in `shares/{id}/surveyIgnores`
  (`scanId`, `ignored`), the newest per scan winning, so Restore is a newer doc.
  This keeps the rule every Survey record already has (no update, no delete) and
  makes a mistaken removal undoable. It rules out hard-deleting a scan, which
  the rules forbid and which would lose the paste for good.
- **Only the owner is offered it, by name.** The app shows it when the Survey's
  owner Character is one of the viewer's, like the moon tax. The rules can't
  check that (any signed-in pilot can write the doc), so it is a UI guard, not
  security; the worst a stranger can do is hide a scan, and the owner restores it.
- **A removed scan leaves the chart and the totals** (filtered before
  `summarizeSurvey`'s dedup, so it can't be the copy dedup keeps), and the
  same-field check on a new paste compares against the counted scans. It stays
  in a list under the page, last, owner-only, where Remove and Restore live.
- **Right-click (touch-and-hold) on a chart node offers "Remove scan".** One item
  is an exception to §6c's two-action rule: a chart node has no row or ⋮, so the
  menu is only a shortcut, and the visible, keyboard-reachable list is the
  real control (WCAG 2.1.1), as `RowMoreActions` is for a row menu.
