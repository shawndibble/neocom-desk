# Scope decisions — Assets place rows: one trailing menu, pin moves into it (issue #5741)

_Recorded 2026-10-31 · issue #5741._

- **A station/structure and a container row in Assets carry one trailing ⋮ (and the same menu on right-click/long-press); the Pin toggle moves into the menu.** Mobbin (Google Drive, Midday, Clay, Dovetail) shows one trailing ⋮ per row with favourite/pin inside the menu (Dovetail) and a row that stays one line. A pinned station keeps a small non-interactive pin mark; the › chevron stays the single drill-in cue. Rules out a separate always-visible pin button beside the ⋮.
- **Station rows: Set waypoint (with View route), Open in EVE, Copy name, Pin; container rows: Set waypoint to the station they sit in, Copy name.** Item rows keep `ItemContextMenu`. Unresolved (orphan) places offer only Copy name, so they get no menu. Which items a row offers is `placeMenuActions`.
- **The whole station row is a stretched link behind its content so the jump count can be a real link of its own.** It opens the route to that place (Route Safety is the route page); no separate safety-panel param exists. Rename of a Place Nickname stays on the opened station's heading; not duplicated in the menu (follow-up). Corp assets does not share these rows and is unchanged. There is no system-grouped Assets row yet.
