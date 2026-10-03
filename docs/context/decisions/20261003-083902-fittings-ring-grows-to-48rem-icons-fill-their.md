# Scope decisions — Fittings ring grows to 48rem; icons fill their tiles; charge at 75%

_Recorded 2026-10-03._

- **The Ring grows to 48rem, bounded by the window height.** Supersedes `20260925-095734`'s 36rem cap. Asked for bigger slots: the tiles can't grow inside the ring (at the 12° pitch neighbours' inner corners touch past ~49 of 648 units), so the ring grows instead — ~57px tiles at the cap. It stays under `100dvh - 16rem` (floor 20rem) so the sticky Ring column still shows it with the first row of readouts: ~644px at 1440×900, the full 768px at 1920×1080.
- **The module icon fills its tile, clipped to the tile's frame.** Supersedes the same decision's 88%. The icon stays upright as in the game, so on a slanted tile a full-size icon's corners would spill onto its neighbours; the clip trims them instead. The hardpoint badge and can't-use flag stay unclipped.
- **A loaded charge's icon is 75% of the tile** (was 50%, and 38% before that). A full-tile charge would hide the module; at 75% the module still shows along the top and left. It is clipped with the module, so on slanted tiles its bottom-right corner is trimmed.
