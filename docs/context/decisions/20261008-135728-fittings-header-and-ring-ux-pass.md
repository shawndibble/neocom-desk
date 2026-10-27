# Scope decisions — Fittings header and Ring UX pass (issue #3079)

_Recorded 2026-10-08 · issue #3079._

- **The phone header is one row, so Rename moves into its ⋮ menu.** With the badges gone, Save and ⋮ fit beside the identity only if the name gives up the 44px Rename button; the name keeps two lines. Desktop keeps the Rename button. Supersedes the earlier "a long fit name gets its own line" layout.
- **The phone's badges are text in the ⋮ menu; Mastery opens as a sheet from its menu item.** The Mastery popover needs an anchor, and a closed menu unmounts its items, so `MasteryChip` has a `dialog` presentation (a sheet, mounted outside the menu) alongside the header's icon badge. Supersedes the 2026-09-26 decision that kept the badges in the header on every width — desktop still does.
- **Copy stats moves from the stats toolbar to the header's ⋮ menu** (desktop and phone), so the stats toolbar keeps only Overheat all.
- **One "Make it fit…" trigger** below the CPU/powergrid/calibration readouts (Ring) or bars (List), shown when any of the three is over; it replaces the per-readout triggers.
- **Make it fit gets a confirmation toast, not an Undo.** The editor has no in-app undo, only the browser's Back (a swap is one history entry), so adding Undo would need new state machinery; the toast names what changed.
- **The empty "nothing fits" result points at the module List** (a button that switches the view, absent when the List already shows). No existing surface answers "what to train", so none is invented.
- **Overheated, not "overloaded", on the new legend and click hint.** Matches the game's wording and the ticket; the tile's own tooltip and the List keep their existing "overloaded".
