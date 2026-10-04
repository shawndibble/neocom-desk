# Scope decisions — Workbench sightings tolerate only counted unread lines (issue #2536)

_Recorded 2026-10-04 · issue #2536._

- **"Seen on zKillboard" overlooks an unread line only when it is written with a
  count (`x1`) and the game still has the item.** The issue asked for "a fit
  whose only unresolved lines are items that still exist" to be matched. Taken
  literally, that would also overlook an unread _fitted_ module — a mutated
  module is in the game's names but not the loader's catalogue — and matching
  on the modules left over could equal a smaller Popular fit, giving a false
  badge. A counted line can never load as a fitted module, so it cannot change
  `popularFitKey`; filaments and boosters in cargo are always written that way.
  An unread line without a count (fitted module or loaded charge) still rules
  the fit out, as do parse errors, an unknown hull and too-many-slots. Whether
  the item still exists uses the same `typeNames.json` rule (`isGameItem`) as
  the Out-of-date check (#2513).
