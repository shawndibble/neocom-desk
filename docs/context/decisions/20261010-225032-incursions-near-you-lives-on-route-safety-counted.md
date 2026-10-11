# Scope decisions — Incursions near you lives on Route Safety, counted with the jump basis (issue #3540)

_Recorded 2026-10-10 · issue #3540._

- **Incursions are a folded panel in Route Safety's rail, not a Travel tab.**
  Travel already has four tabs, and Route Safety is the page that answers
  "how do I get there and is it safe". Folded by default and remembered per
  device, so pilots who never run Incursions see one header; folded, it still
  names the nearest one. Rules out a new tab or page.
- **Jumps use the full jump basis (`useJumpRangeFilter`): Route Preference,
  avoided systems, and the holes and bridges Route Safety uses.** So "4
  jumps" is the route Route Safety draws when the pilot presses Route; the
  Overview card (#3541) and the "within N jumps" alert (#3542) reuse the same
  count. A staging system the rules cannot reach says so and sorts last,
  never 0.
- **Counted from the Current System, not the trip's start.** The panel answers
  "near you"; the Route action then adds the staging system to whatever trip
  is open.
- **Conditions, never verdicts.** A row states the state (as a word),
  influence, system count, whether the mothership is up, and distance; it
  never ranks Incursions as worth running.
- **Constellation names come from `POST /universe/names`, held for the
  session.** The bundled snapshot has no constellations, and names never
  change; a name ESI cannot give falls back to "Constellation <id>".
