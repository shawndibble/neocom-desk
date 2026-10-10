# Scope decisions — Move plan: trips count hauls plus ships, and only flyable haulers are suggested

_Recorded 2026-10-09._

- **The header's trip count is hauls plus ships to fly** (9 hauls + 4 ships = 13 trips). Each flown ship is a trip of its own; the line under the hauler name shows the split. This supersedes the earlier note that a flown ship is never one of the trips.
- **The dashed load-split bar is gone.** The trip list under the header (folded ranges, then one "Fly <ship>" entry per ship) carries the same information without truncating.
- **Only a hauler the pilot can fly is suggested or compared.** Skill requirements come from the bundled ship tree (no ESI call per hauler) and are checked against the active Character's trained skills (All V with no Character); a hull the tree lacks counts as flyable. Owning the hull still does not decide the order. With none flyable the plan says so instead of suggesting one.
