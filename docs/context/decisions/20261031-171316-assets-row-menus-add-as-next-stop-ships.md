# Scope decisions — Assets row menus: Add waypoint ships; system rows, item-row place actions and safety deep-link wait (issue #5741)

_Recorded 2026-10-31 · issue #5741._

- **Station and container row menus offer "Add waypoint in game" after "Set waypoint in game".** The shared `setWaypointsInGame` gained a `clearOthers` option (default true, so every existing caller is unchanged) and `SetWaypointMenuItem` a `mode="add"`. It sends one waypoint with `clear_other_waypoints=false`, says "added to your route", and drops the View route item (that belongs to Set waypoint).
- **No system rows.** Assets has no system-grouped row yet, so there is nothing to attach a menu to; it comes with that row.
- **Item rows keep their item menu, with no place actions.** The row click already opens the item's place, so a place action there fails §6c's restraint rule.
- **Still open on #5741:** carrying the page's route preference into the row jump count and View route, passing the station as the route destination, the safety-view deep-link, and the Storybook mockup. The PR says `Part of #5741`, so the issue stays open.
