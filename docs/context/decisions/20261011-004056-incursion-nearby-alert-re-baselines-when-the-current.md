# Scope decisions — Incursion-nearby alert re-baselines when the Current System or N changes (issue #3542)

_Recorded 2026-10-11 · issue #3542._

- **A changed Current System or N re-baselines the Incursion Nearby alert silently.** The ticket forbids a burst of alerts for Incursions that were already near when the pilot raises N or moves. Each polled entry carries the origin system and N it was counted under, and a poll whose frame differs from the last one fires nothing. This rules out alerting while the pilot flies towards an Incursion: every jump changes the origin, so "comes into range" only fires for a new spawn, or when the route rules or network (Avoided Systems, pod-kill avoidance, a Thera hole, a jump bridge) bring a standing Incursion closer. Route Safety's Incursions panel and the Overview card already show the distance while flying.
- **Withdrawing Incursions never fire.** One that spawns or comes into range already withdrawing is leaving; there is nothing left to fly to.
- **The poll counts with Route Safety's full jump basis, holes and bridges included**, read outside React by `loadJumpBasis` (`features/route/jumpBasis.ts`), so "3 jumps" in the alert is the number Route Safety draws. One local graph pass per poll, never a route call per Incursion.
