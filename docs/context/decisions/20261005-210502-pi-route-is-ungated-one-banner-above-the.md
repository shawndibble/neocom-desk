# Scope decisions — PI route is ungated; one banner above the tabs (issue #2694)

_Recorded 2026-10-05 · issue #2694._

- **`/planetary-industry` is `UNGATED`; the page raises one banner above its tabs.** Without the planets scope the gate replaced the header and tabs, walling off Plan's Find best and Map, which need no colonies. Same shape as Contracts (`20260912-200442`) and /wallet. The banner comes from the page's own `needsReauth`; Plan, Map and the product planner no longer render their own banner and run as a pilot with no colonies. Colonies shows its empty state under the banner. Ruled out: a banner per tab.
