# Scope decisions — Improve: a tank conversion that loses more than half the sustained tank is rejected (issue #5517)

_Recorded 2026-10-28 · issue #5517._

- **A conversion that loses more than half of the sustained tank is rejected, not offered as a trade-off.** The tank goal scores buffer EHP, so a conversion can win on it while deleting the repair the fit lives on (an armor Sacrilege turned to shield: +8.5% EHP, armor repair to 0). The rejection is a named Guardrail on the same path as `capStable` and `keepsStats`, so it shows under the closest rejected options. It applies only to conversions: ordinary swaps stay inside one side's tank.
- **The threshold is fixed, not editable.** Guardrails are not editable in v1; half is the line between a trade and a loss of the fit's job. A fit with no sustained tank is never held back by it.
