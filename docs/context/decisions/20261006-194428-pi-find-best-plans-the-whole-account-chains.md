# Scope decisions — PI Find best plans the whole account: chains may be a pick

_Recorded 2026-10-06._

- **<Decision>.** <Why, and what it rules out.>

_Code: `src/engine/pi/accountPlan.ts`, `src/features/pi/accountPlanModel.ts`, `useAccountPlan.ts`, `AccountPlanPanel.tsx`. Amends [20261006-095530](20261006-095530-pi-p3-p4-chain-estimate-never-a-pick.md) ("never ranked", "nothing bought") and [20261006-170236](20261006-170236-pi-find-best-lists-p3-and-p4-chains.md) (the separate P3/P4 list, now gone). Decision 20261005-123211's "P3+ are never offered" now holds only for the one-planet picks below the plan._

- **Find best's picks view opens with a whole-account plan for a pilot with colonies.** The question is "what is the best use of all my planets", not "what is the best one planet". The plan splits the colonies into groups: a chain across several, one colony on a product from bought inputs, or one colony left on its own best pick. The total is the sum. The separate P3 and P4 chain list is removed.
- **A chain may be recommended, because it is compared fairly.** Its gain is what the colonies it uses earn under it, less what those same colonies earn apart (their one-planet figure, or with a buy tier their best solo-from-bought-inputs). Never against a Baseline, and never counting colonies the chain leaves alone. A chain with no positive gain is never taken. A gain under 5% is the same plan and is not shown as a change.
- **Two existing settings drive it; no new ones.** `haulBetweenPlanets` allows chains across colonies. `buyTiers` lets a colony make a product from inputs bought at the hub. With neither, the plan is each planet on its own pick and says so.
- **The plan names what each choice is worth.** Three totals: each planet alone, what buying adds, what hauling adds. These are differences between stages of one greedy search, not a proven optimum.
- **No typed-in cost per planet.** The figure shows what can be proven: net ISK a day, planets used, m³ a week. A pilot judges whether a planet or a haul is worth it.
- **Greedy, bounded, off the main render.** Candidates are the four best-selling P2, P3 and P4 the colonies can host. The engine is a generator, run in slices between frames, and cached by its inputs. `estimateChain` gains an `allowBuy` flag, off by default, so All products and the Map still never buy.
- **Not covered yet:** free planet slots and what-if planets are not in the plan; it plans the planets the pilot has. The one-planet picks still list below it for a free slot.
