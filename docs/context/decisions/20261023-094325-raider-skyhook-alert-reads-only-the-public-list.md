# Scope decisions — Raider skyhook alert reads only the public list and shows no silo size (issue #4784)

_Recorded 2026-10-23 · issue #4784._

- **The raider half is a go: `GET /skyhooks/raidable` is public.** The alert
  reads it with no token through the one cache row the Overview raids widget
  already uses (`loadRaidableList`), so it costs one request per cache window
  however many Characters or skyhooks there are.
- **No silo size on the raider side.** The public list carries only system,
  planet and the theft window, so the `routeSafety` rows show jumps and time
  left only. The silo fill belongs to the defender half (role-gated).
- **Once per skyhook per window.** The Occurrence Key is character, system,
  planet and window start, so a window leaving range and returning does not
  re-alert, and the skyhook's next window does. A listing with no readable
  window is not alerted: there is no window to be once-per.
- **`routeSafety` rows are for the saved route's systems.** That widget is
  about the route, so a raidable skyhook "in range" there means in a system of
  that route; jumps are counted along the route from its first system. The
  alert's own jumps-from-home threshold is separate. Subject URL is the
  Overview.
