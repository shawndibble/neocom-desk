# Scope decisions — Use my stock: coverage over top-level priced materials (issue #2847)

_Recorded 2026-10-07 · issue #2847._

- **Stock covers is owned value over total value of a row's top-level materials, at the row's own unit prices; Still to buy is the summed remaining line cost.** Sub-builds' rolled-up cost is left out because the top-level remainder is what gets bought or built.
- **A row with any unpriced material has no coverage (shown as "no price", excluded by Mostly/Fully).** A partial percentage would mislead.
- **Filter is Any | Mostly (75%+) | Fully covered, kept in the `opps.stock` URL param, Ranked view only.** Ore sell/refine/craft (#2836) and cross-plan reservation (#2920) stay out of scope.
