# Scope decisions — LP Store landing hides offers that sell under 1 a day by default

_Recorded 2026-10-30. Owner's pick (option 1A) on the LP Store landing mockup._

- **"Sells at least: 1 a day" is on when the landing opens.** Across all 171 stores, the top ISK/LP is otherwise an offer nobody buys: one thin, high sell order prices it, and redeeming it turns LP into a stack that never sells. The floor is a filter, not a cap: the funnel badge counts it (like the store's own "I can afford", on by default), "Any volume" removes it, and nothing else is cut.
- **An offer with no volume figure passes the floor.** `null` sells/day (the daily volume object did not load) is unknown, not zero; hiding every offer while the volume loads, or when it is unreachable, would empty the page.
- **Rules out:** a hidden or unbadged default, and a floor on the store modal (it keeps its own filters).
