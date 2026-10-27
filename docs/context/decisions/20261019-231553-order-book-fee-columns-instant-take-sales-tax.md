# Scope decisions — Order book fee columns: instant take, sales tax on buy orders only

_Recorded 2026-10-19._

- The Market Browser order book's opt-in **Tax & fees** and **Final price**
  columns (per unit, off by default, so they show in the expanded row's hidden
  columns until ticked) price taking that order outright.
- On a **buy order** you are selling into it: Accounting-reduced sales tax is
  charged and Final price is what reaches the wallet. On a **sell order** you
  are buying from it: EVE charges buyers no tax or fee, so Tax & fees is 0 and
  Final price equals Price. Broker fees only apply to placing your own order,
  so none is shown.
- Like the Appraisal net chips, the columns exist only once the active
  Character's Accounting level has loaded; never off an untrained placeholder.
