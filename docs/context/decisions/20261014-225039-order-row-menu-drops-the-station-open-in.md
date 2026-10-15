# Scope decisions — Order row menu drops the station Open in EVE

_Recorded 2026-10-14._

- **An Open Orders row's menu carries no Open in EVE for the station.** The row's menu already offers the item's market window ("Open market in EVE") and Set waypoint; a plain "Open in EVE" beside them read as the item's information window, which ESI ignores for a type (`20261014-203537`), and the station entry used the same `information` call. Rules out a station information entry on this menu. Other station/structure uses of `information` are unchanged and still unverified.
