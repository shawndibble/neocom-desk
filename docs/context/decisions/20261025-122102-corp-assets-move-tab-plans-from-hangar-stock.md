# Scope decisions — Corp assets Move tab plans from hangar stock, flown by the active Character (issue #5167)

_Recorded 2026-10-25 · issue #5167._

- **Corp assets → Move is the personal Move tab with a corporation source, not a second planner.** `MovePlanTab` takes an optional `corp` source (the corp assets the page already loaded, adapted by `features/corp/corpMoveSource.ts`); the picker, plan, hauler comparison, ISK limit and haul view are the same code. Rules out a copy of the tab.
- **Only top-level hangar-division stock at a station or structure is offered.** An item in an office's `CorpSAGn` division is lifted to the office's station or structure as plain hangar stock. In space, deliveries, impounded, asset safety and container contents are not movable.
- **The active Character flies the plan.** The corporation read needs a Director, but the plan's source is keyed by that pilot: pickups resolve, measure jumps and start the route from them, and haulers come from their skills. The tab says so. A corp plan link therefore names the pilot's keys; another pilot opening it gets the empty planner.
- **A corp plan link carries `mvc=1`.** A personal link never rebuilds on `/corp/assets/move`, nor the reverse.
- **Move is a path segment, `/corp/assets/move`, not a ledger state.** It has no count and no ledger filter; the existing `/corp/assets/*` links and the Overview links are unchanged.
