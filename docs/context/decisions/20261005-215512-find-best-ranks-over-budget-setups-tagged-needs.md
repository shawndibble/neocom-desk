# Scope decisions — Find best ranks over-budget setups tagged needs CC level N (issue #2701)

_Recorded 2026-10-05 · issue #2701. Amends the first bullet of `20261005-123211`._

- **Find best ranks a setup that needs a higher Command Center, tagged, below every setup that fits.** The tag reads "needs CC level N" (N = lowest level that hosts it) with a `SkillLink` to Command Center Upgrades. Order: fits first, then lowest level needed, then ISK a day. If none fit, the tagged list is the result, not an empty state. Rules out hiding what training would unlock.
- **Only Find best's Best picks shows them.** The shared ranking (`PlanAdvice.recipes`, read by Plan picks and Map) and All products figures still stay within the trained skill, as `20261005-123211` says; the colony rebuild's "upgrade first" rule is unchanged. `bestAnywherePerDay` counts fitting setups only.
- **Missing prices never read as a Command Center problem.** An empty Find best with unpriced products says nothing could be priced, not "no setup fits a Command Center at level N".
- **An unknown skill is scored as level IV (as before), so a tag then means "above the assumed level".** The ranking basis already badges that assumption.
