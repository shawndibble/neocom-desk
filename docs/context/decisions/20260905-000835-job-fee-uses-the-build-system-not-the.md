# Scope decisions — job fee uses the build system, not the trade hub

_Recorded 2026-09-05._

- **A Build Plan names the solar system its job runs in, and the job fee reads
  that system's cost index.** The fee had been priced at the plan's _trade
  hub_ system, which is only right for a player who builds where they sell.
  Building in Badivefi (manufacturing index 2.72%) against an Amarr hub
  (8.23%) overstated the fee threefold — 492k where the game charged 279k on
  the same 4,000,739 EIV. Where a player sells and where they build are
  independent choices, so they are now two fields, not one.

- **The build system is stored, and empty means the hub's system.** A plan
  written before this field existed, or one whose owner builds at their hub,
  keeps behaving exactly as it did. The field is additive and unindexed, so it
  needs no Dexie version bump — the same shape `materialSourcing` and
  `ownedStockScope` already use.

- **The system is resolved by exact name through ESI `/universe/ids`, not
  searched.** The bundled SDE carries no solar-system table, and naming all
  ~5000 systems in the cost-index response to power an autocomplete would cost
  six `/universe/names` posts per session for a list the player needs one entry
  of. Players type the system they undock in; an exact, case-insensitive match
  is what that needs. Resolutions are cached for the session, including
  misses, so a typo is not re-asked on every keystroke.

- **The resolved name is stored beside the id.** The results panel labels the
  index with its system ("Cost index (Badivefi)"), and re-resolving an id to a
  name on every plan load would be an ESI call to render a label the plan
  already knew.

- **Callers with no build system keep the hub's index.** The LP store's offer
  rows and planetary plans share `loadMarketSnapshot`; neither has a plan, let
  alone a build system. They omit the new argument, so nothing about their math
  moves — this change is scoped to the Build Plan, not to every consumer of the
  snapshot.
