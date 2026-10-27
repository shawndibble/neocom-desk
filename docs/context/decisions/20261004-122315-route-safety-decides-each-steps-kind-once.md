# Scope decisions — Route Safety decides each step's kind once (issue #2546)

_Recorded 2026-10-04 · issue #2546._

- **The trip assembly tags every Route Safety row with how it was entered:
  gate, hole (which one) or bridge (which one).** `assembleRouteSafety`
  (`engine/route/routeSafetyTrip.ts`) reads each step once. The strip, the
  table, the facts, a way's hole and bridge jumps and the in-game waypoints
  all read that tag; none of them looks up a hole or a bridge again. The
  first system of a leg (and of the trip) has no tag.

- **A gate always wins.** Where a stargate and a hole or an Ansiblex join the
  same two systems, the step is a gate jump: the pilot can always fly the
  gate. A bridge step names the Ansiblex standing in the system it leaves
  when both ends have one.

- **A step nothing known joins reads as a gate.** The adapter only reads a
  trip against the holes and bridges it was planned with, so no route holds
  one. This replaces the waypoint rule's own reading from the stargate graph
  (decision `20261003-175151-route-safety-sets-in-game-waypoints`, "a hop's
  kind is read from the plain stargate graph"): Set Waypoints no longer loads
  the graph, and its cut-off rules are otherwise unchanged. The stargate
  graph still never holds holes or bridges.

- **The route strip marks a bridge jump**, as it marks a hole jump: a cell of
  its own between its two systems, edged top and bottom in the bridge row's
  dashed line, and counted in the strip's spoken description.
