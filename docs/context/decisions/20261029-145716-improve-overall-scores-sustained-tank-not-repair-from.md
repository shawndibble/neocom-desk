# Scope decisions — Improve overall scores sustained tank, not repair from zero (issue #5555)

_Recorded 2026-10-29 · issue #5555._

- **Improve's Best overall scores the tank term as the change in sustained tank (`tank.sustainedEffective`, passive regen included), via `improveOverall`.** `gainMetrics`' active-repair term counts repair from 0 as +100%, so the smallest booster on a buffer fit beat a hardener that gave more EHP. A fit with a real active tank still gains from a better repair module. What to train keeps `gainMetrics` unchanged: a skill rarely takes repair from 0.
