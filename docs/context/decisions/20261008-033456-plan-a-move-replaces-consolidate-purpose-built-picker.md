# Scope decisions — Plan a move replaces Consolidate; purpose-built picker and destination (issue #2947)

_Recorded 2026-10-08 · issue #2947._

- **Plan a move replaces the Consolidate panel.** The panel and its Tools-menu checkbox are removed; nothing else used them. `planConsolidation` stays in the engine because `movePlan` shares its helpers and tests. This supersedes the Consolidate v1 scope decision.
- **The picker is purpose-built, not the Items list.** The Items view is inline in `Assets.tsx`, virtualized and bound to page state, so there was no component to reuse. The picker is a flat checkbox list per Character and pickup location, with a select-all per location.
- **Destination is any system, or one of the user's own stations.** There is no local snapshot of every NPC station or structure, so a station outside the user's assets cannot be searched; pick its system instead. A system destination covers every pickup station inside it (those items count as already there).
- **Hauler hulls are the "Haulers and Industrial Ships" market class**, sized with the active Character's pilot profile and cached per modal session; hull class and ownership only, no per-pilot fit.
