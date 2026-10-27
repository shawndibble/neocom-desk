# Scope decisions — Reaction Location cost index and Build Group sweep resolution (issue #698)

_Recorded 2026-09-10 · issue #698._

- **The Reaction Location's own manufacturing cost index comes from a second,
  independent `useMarketSnapshot` call** (`hub`, the plan's own type ids,
  `reactionBuildSystemId`, activity `'reaction'`), not from the plan's
  primary snapshot. `useMarketSnapshot`/`loadMarketSnapshot` already accept a
  `costIndexSystemId` + `activity` pair for exactly this — the ESI cost-index
  response is fetched once and cached, and `getHubPrices` already caches by
  (station, type), so the second call only really costs one additional
  cost-index lookup, not a second full price fetch. Sharing the primary
  snapshot's index would charge a reaction job at the manufacturing
  facility's system, which is exactly the wrong number Include Reactions
  exists to fix.
- **A Build Group's Craft Sweep resolves Include Reactions per member, not
  group-wide.** Each member keeps its own `includeReactions` flag and its own
  Reaction Location (`craftSweepGroup.ts`'s `applyGroupCraftSweep` computes
  each member's own `craftScope` and its own resolved `reactionFacility`,
  the same way it already prices each member at its own hub/build-system).
  The group's own Craft Sweep chip (`groupCraftScope`) lights up Reactions
  the moment _any_ single member is eligible — a group-wide flag would force
  every member to share one Reaction Location, which contradicts "Include
  Reactions is per-plan" from `docs/context/decisions/20260910-082559-
reaction-location-a-second-facility-context-lets-craft.md`.
