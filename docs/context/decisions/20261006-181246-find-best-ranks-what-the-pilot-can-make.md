# Scope decisions — Find best ranks what the pilot can make today above what needs a planet they lack

_Recorded 2026-10-06. Code: `src/features/pi/findBestView.ts`, `FindBestSections.tsx`. Amends [20261005-215512](20261005-215512-find-best-ranks-over-budget-setups-tagged-needs.md) (order)._

- **Find best's Best picks orders: fits the Command Center first, then recipes one of the pilot's own planet types hosts, then ISK a day.** Before, a recipe on a planet type they lack could be pick #1, marked "Find one". A pilot asks "what should I make", so what they can make today leads.
- **A divider, "Add a planet to unlock these", sits above the first recipe that needs a planet they lack.** Shown only when the can-make-now recipes form a clean top block, and never with no colonies. A what-if planet does not count as owned: its recipes stay under the divider, tagged "New with this planet".
- **Only Find best reorders.** `rankRecipes` and `PlanAdvice.recipes` are unchanged, so Plan picks, the Map and All products keep their ISK-only order.
