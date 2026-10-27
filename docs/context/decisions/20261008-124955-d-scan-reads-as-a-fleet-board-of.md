# Scope decisions — D-Scan reads as a Fleet board of roles, with one expandable distance chart (issue #3075)

_Recorded 2026-10-08 · issue #3075._

- **A D-Scan is grouped by role, not by the old class buckets.** Capitals, Industrial, Transport, Support, DPS, Drones and deployables, Structures and wrecks, each pinned to SDE group ids in `dscanRoles.ts`. Drones are counted in their own role instead of being "left out"; capsules, shuttles, probes and celestials still are. This supersedes the bucket list in `20261007-224716-pilot-lookup-takes-a-pasted-local-list-or`.
- **Wrecks are recognised by the type name the client printed**, because the SDE holds no wreck types. A Rorqual (Capital Industrial) is Industrial, not Capitals.
- **The parser keeps the ship name (column 2) and the distance (column 4).** The stored Share Link text is unchanged, so every existing link gets the new view. Column 2 is the ship's own name, never the pilot's.
- **The share bar is the one control.** It expands in place to a distance lane per role (0 to 150 km, farther rows pinned to the edge). No chips, no table, no extra expand button (DESIGN.md §6c restraint). D-Scan has no bearing, so the lanes never draw a map.
- **Role colours reuse the clock-kind tokens**, as Net Worth layers already do, rather than a parallel palette. The legend and lane labels name every role, so colour is never the only signal.
- **A Share Link page for a visitor with no Character shows "Log in with EVE Online" and a small "Choose permissions" link** that opens the Customize permissions dialog first, instead of a hop through `/login`. Signed in, it stays "Open Neocom Desk". Applies to every `ShareShell` page. `forgetStrayLanding` keeps the stashed landing on `/share/*`.
- **Signals, hull worth and a diff against the previous scan are not part of this.** They are ticket #3076.
