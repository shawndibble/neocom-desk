# Scope decisions — Route Safety trip time constants and model (issue #6282)

_Recorded 2026-11-16 · issue #6282._

- **Two figures, both gate-only, for a base hull with skills at V.** "Warp to 0" is align + warp + 10 s session change per gate jump. "Autopilot" adds a landing 15 km off each gate and a ramped fly-in to the 2.5 km jump range at base speed. Hole, bridge and jump-drive hops add no time and the line says "Gate legs only."
- **Warp uses entry speed 75% of top speed (where align ends) and exit speed 100 m/s.** Acceleration rate is the hull's warp speed, deceleration the lesser of a third of it and 2. A warp too short to reach top speed peaks lower. The 15 km autopilot landing is not taken off the warp distance: gate positions are baked to the nearest 1,000 km.
- **Start and end systems measure to the star; a stop in the middle is two warps to the star.** Station and structure positions are not baked, so the star (the SDE's origin) stands in for where a pilot starts or ends. A system entered or left by a non-gate hop has no gate to measure from and is left out.
- **Hull flight stats are their own file.** `shipFlight.json` (agility, speed, warp speed) sits beside `shipMass.json` rather than widening its rows, whose optional jump-drive tail has a fixed position readers rely on.
