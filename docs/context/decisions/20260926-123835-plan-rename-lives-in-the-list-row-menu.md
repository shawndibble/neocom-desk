# Scope decisions — Plan rename lives in the list row menu on wide screens

_Recorded 2026-09-26._

- **Rename lives in one place per layout.** With the plan list beside the editor (`lg` and up) a plan is renamed from its list row's ⋮ menu, and the editor header shows the name as plain text. Below `lg` the editor route has no list, so the header's name field stays the one rename control there. A new plan opens in rename mode in whichever of the two is present. Rules out showing both controls at once.
