# Scope decisions — PI Find best lists P3 and P4 chains beside the picks

_Recorded 2026-10-06. Code: `buildChainPicks` in `src/features/pi/findBestView.ts`, `ChainPicksPanel.tsx`. Extends [20261006-095530](20261006-095530-pi-p3-and-p4-get-a-multi-planet.md)._

- **Find best's picks view shows P3 and P4 in a "P3 and P4 chains" panel under the one-planet picks.** Before, a pilot who hauls between planets saw them only in All products. Each row carries the existing multi-planet "needs hauling" estimate (`useChainEstimates`), most ISK a day first.
- **It is a list of its own, not one merged ranking.** No pick number, no "better than" comparison, no effect on "already your best" or the Slot nudge. A merged list would put every chain above every one-planet recipe, and a chain's figure assumes new planets and hauling that a one-planet figure does not. Decision 20261006-095530's "never ranked against one-planet figures" stands.
- **Same reach rule as the picks.** Only products the pilot's planet types (or all, with no colonies), less any switched off, plus what-if planets can make. Products still being priced are counted, not shown at zero.
- **Shown under "Make: Any" only.** A P1 or P2 filter hides the panel, and chains are not priced while it is on.
