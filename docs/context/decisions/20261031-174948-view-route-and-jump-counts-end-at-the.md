# Scope decisions — View route and jump counts end at the station (issue #5741) (issue #5741)

_Recorded 2026-10-31 · issue #5741._

- **<Decision>.** <Why, and what it rules out.>

- **`useViewRoute` passes the place as the route's station stop** (when it is not itself a system), so a jump-count link or View route opens Route Safety ending at that station or structure, not just its system. The jump count already opened Route Safety, the page's safety view; no new URL param was needed.
- **Still open on #5741 (Storybook mockup only):** the row-layout story. System rows do not exist; item rows get no place actions (§6c). The page has no route picker, so there is no preference to carry.
