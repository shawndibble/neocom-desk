# Scope decisions — Assets selection totals count items, not hulls (issue #6165)

_Recorded 2026-11-14 · issue #6165._

- **The select-mode bar sums exactly the selected ids; a cascaded ship or container adds its contents, never its own hull.** Its checkbox selects its contents' ids, not its own, the same set Appraise and both Copy actions read, and the tree's container value already leaves out the container's own value. A hull counts only when its own id is selected: a search hit, or an empty ship or container shown as a leaf.
- **Value is the Value column's stack value (`assetStackValue`); m³ is quantity × the m³ column's unit volume.** The column shows volume per unit, so the total matches the summed cells only for one-unit rows. It is the SDE volume, not the packaged volume the Move Plan hauls by (GLOSSARY Cargo Space): the ticket asked for the column's basis, and the two differ only for packaged ships.
- **A stack with no value counts as "N unpriced", left out of the ISK**, as asset totals already treat unpriced items (decision 20261016-105151). ISK and the unpriced count wait for market prices, so nothing reads unpriced while they load.
- **Below `sm` the bar drops m³ and keeps ISK.** The screen-reader status reads every part.
