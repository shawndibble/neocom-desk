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
- **An unread loaded charge still rules the fit out.** It can't change the key
  either, but the catalogue lacks few charges and the loader would need a
  second marker for them; a missed badge is harmless, so it stays out of this
  change.
- **If `typeNames.json` can't be read, counted unread lines are tolerated.**
  The sightings share the Out-of-date check's fallback (every name counts as
  the game's), which lists such fits as current too, so the badge and the
  list agree. The key is unaffected either way.
