# Scope decisions — Goal Planner UI: buying, colonies and what the tab shares

_Recorded 2026-10-05._

- **With no colonies, only P1 goals can be bought outright.** The solver buys P1 only (milestone 1); a P2+ goal with no colony to host its factories is a "no host" shortfall, not a purchase. The tab says so in words ("P2 and up need a colony to host the factories") rather than widening buying to every tier for the colony-less case — a second buying rule just for that state would make the same goal plan differently depending on whether a colony is switched on.
- **"Buy P1 at the hub" is the Advisor's buy-inputs switch, not a second one.** It writes the shared `marketSourcing` pref, and while it names a hub that hub prices the plan too. The planner's own hub pick (`piGoalPlanner.priceHub`) only prices while buying is off. Two switches for "can this pilot reach a hub" would let the Advisor and the planner advise one pilot on two different operations. Off by default — pilots are all over New Eden, many far from a hub.
- **Customs edits on the planner are the per-system override the Advisor writes.** A colony row's rate edits its system's synced override, and the tooltip says it applies to every colony in that system on both tabs. A per-colony override would need a new synced key for a distinction a customs office does not make.
- **Switched-off colonies are URL state (`?off=`), beside `?goals=`.** They define the answer as much as the goals do, so a shared or reloaded link must reproduce the plan. `?type=` (the Industry "PI Plan" link) seeds a goal at 10/day and is then cleared.
- **A colony the planner cannot cost is listed, never silently dropped.** No loaded detail, or no link cost of its own and none of the pilot's to borrow, leaves it out with the reason on its row.
- **Change-list colony names link to the Colonies tab, not to the colony.** That tab's expanded rows are not URL state, so there is no address for one colony's detail yet.
