# Scope decisions — Ranked rows follow the Profit Basis setting

_Recorded 2026-11-16._

- **Ranked builds and All owned rows count held stock by the pilot's Profit Basis setting, as the Build Plans list and the plan page do.** On "Owned materials = resale value" (`sellValue`, the default) a row charges the stock it uses at what it would sell for (`onPlanHeroBasis`), unchanged; on "Owned materials = free" it keeps the plan's own figure and charges nothing (`forgoneSale` 0). A row used to charge the sell value whatever the setting, so with free selected it read less profit and ISK/hour than the plan it opened. Supersedes the bullet "Ranked builds and All owned count the stock a row uses at what it would sell for, as the plan's hero does by default" in `20261027-084433-*`; the setting is `20261103-135206-*`.
- **Changing the setting reprices the rows.** It is part of `opportunitiesInputsKey`, so a large cached batch asks for Refresh like any other pricing input change.
- **Not changed:** Market-Wide rows stay stock-agnostic, and Ranked keeps pricing without Depth Prices through `computeBuildPlan` directly.
