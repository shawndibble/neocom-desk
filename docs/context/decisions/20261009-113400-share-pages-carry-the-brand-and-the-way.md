# Scope decisions — Share pages carry the brand and the way in at the top (issue #3225)

_Recorded 2026-10-09 · issue #3225._

- **`ShareShell` puts the brand and the one way in (Log in with EVE Online + Choose permissions…, or Open Neocom Desk) in a header at the top, and nothing at the foot.** A stranger opening a share link should see whose page it is and how to get in without scrolling past a long table; the entry control is not repeated (DESIGN.md §6c restraint). It is `accent`, not `primary`, so the page's own primary action (e.g. Copy chat message) stays the only one.
- **The public survey page's panel is titled "Field progress"**, via an optional `SurveyBoard` `panelTitle` the Mining tab leaves unset, so "Mining Survey" appears once (the `<h1>`).
- **The shared Fitting page now renders in `ShareShell`** like the others (#3497); Copy Fitting is its one primary action, in the actions slot.
