# Scope decisions — Out-of-date EVE Workbench fits: removed items and lost slots only (issue #2485)

_Recorded 2026-10-03 · issue #2485._

- **A fit is out of date only for a removed item or hull, or a lost slot.** It
  names a type the app's current game data doesn't have (the EFT loader's
  `unknown item` / `unknown ship`), or puts more modules in a rack than the
  hull has slots (counted against the Ship Tree's hull stats, plus the
  loader's own `too many … slots`). CPU, powergrid and calibration never count:
  skills and implants change them. Badly written text (an unparseable line, a
  missing header) doesn't either: that's the author's typo, not a game change,
  and Load still reports it.
- **The check runs in the browser, over the stored EFT, each time the tab
  opens.** There's no server-side recheck, so a game update shows as soon as the
  app's own game data has it. Verdicts are kept per fit id and EFT for the
  session.
- **Missing data never marks a fit out of date.** A hull the Ship Tree doesn't
  list has its racks left uncounted. A Tech 3 cruiser's high, mid and low racks
  aren't counted either, because its subsystems set them; its rigs still are.
  If the game data can't be read at all, every fit counts as current.
- **"Removed" means gone by name from `types.json`.** That file keeps some
  unpublished types, so a module CCP unpublished but didn't delete still
  resolves and isn't caught. A rename always is.
- **Out-of-date fits stay loadable.** They sort below the current ones, behind a
  "show out-of-date fits" toggle. When every fit for a hull is out of date, the
  tab says so rather than looking empty. No PVE/PVP tagging.
