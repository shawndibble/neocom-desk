# Scope decisions — Phone filter sheet commits each pick; no Apply/Cancel draft

_Recorded 2026-10-24._ Supersedes the draft, Apply/Cancel and "keeps Cancel
honest" points of `20260905-144941`.

- **`FilterBar`'s phone sheet commits every edit as it is made, like the
  pointer-width box.** Apply, Cancel and the "Discard filter changes?" prompt
  are gone. Asked for on the Ship Tree ladder, applied to every page so one
  rule holds: a pick takes effect without a second tap. The sheet is
  `placement="sheet"`, so it stops short of the top and the list above it
  re-filters behind the scrim.

- **Every close keeps what was picked** — scrim, Escape, the close button,
  swipe down and Back. Back needs help on a route whose filters live in the
  URL: the route writes them with a replace, onto the sheet's own overlay
  history entry, so the pop would also undo them. The sheet re-commits its
  last value once the close has landed. Known limit (it existed with Apply
  too): after a close-button close on such a route, the overlay's entry stays
  as one extra Back step, which lands on the unfiltered URL.

- **An ISK amount still waits for blur or Enter, in the sheet too.** `250m`
  passes through 2 ISK on the way; committing per keystroke would hide every
  row. Other text and number fields commit per keystroke in the sheet, as
  they always did in the box.

- **Not covered:** `OwnedStockScopeControl`'s location sheet keeps its own
  Apply/Cancel. It is a scope picker with a tree edited under the thumb, not a
  `FilterBar` filter.
