# Scope decisions — Improve's Train and Implants follow the goal's own stat (issue #5027)

_Recorded 2026-10-25 · issue #5027. Builds on `20261024-171917` and `20261019-144736`._

- **Train and Implants rank by the Improve Goal's own stat.** More damage ranks by DPS (implants: applied DPS), Tankier by EHP, Faster by speed, Longer reach by optimal range (implants: weapon range), Best overall by What to train's weighted overall. Each shows the top three rows of What to train's and the Implant Finder's own runs, only rows that raise that stat.
- **Cheaper has no Train and no Implants section, and Best overall has no Implants section.** Training and implants cost ISK or time, never save ISK, and Best overall has no single stat for the Implant Finder to chase. A section with no rows is not shown.
- **An over-budget fit shows only "Fix this first".** One text link per over-budget resource ("Fix CPU", "Fix powergrid", "Fix calibration") closes Improve and opens Make it fit on that budget. No search runs, so no goal chips, Train, Implants or swaps appear.
