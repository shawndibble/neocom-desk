# Scope decisions — Avoided Systems are a hand-entered synced list, separate from Route Preference

_Recorded 2026-09-30._

- **Hand-entered, not imported.** ESI has no read for the game client's
  autopilot avoidance list (no endpoint, no scope; `/ui/autopilot/waypoint/`
  is write-only), so the pilot enters their Avoided Systems in Settings →
  Travel. Rules out any "import from game" control until CCP ships a read.
- **Synced, one list per account** (`sync.avoidedSystems`, solar system ids
  only). Which systems a pilot refuses to fly through is about the pilot, not
  a machine or one alt. Name and security come off the local snapshot at
  display time, never stored.
- **Not a Route Preference.** Route Preference picks a _kind_ of trip
  (prefer highsec, shortest, avoid highsec); Avoided Systems is a set of
  systems. So this persisted control does not trigger the vocabulary
  unification CONTEXT.md owes before a second persisted _preference_ ships.
- **Every jump count honours it — a cost, never a wall.** Local-graph routes
  (Courier, route exposure, Jump Range, Route Safety, Thera) price entering an
  avoided system above any security penalty, so a route crosses as few as it
  can and a destination only reachable through one still has a route. ESI's
  `avoid` is a hard filter (verified live: 404 "No route found" when
  unavoidable, and for an avoided destination), so Assets and market order
  jumps send the list without the two ends and retry without it on a 404
  (`features/route/esiRoute.ts`). Every distance cache is keyed by the list.
