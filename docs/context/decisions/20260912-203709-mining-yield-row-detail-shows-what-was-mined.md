# Scope decisions — Mining Yield row detail shows what was mined, not a per-day rate

_Recorded 2026-09-12._

- **The row detail modal carries no ISK/hr of its own.** For a single entry
  `iskPerCalendarHour` reduces to value ÷ 24 — a number that looks measured and
  is not, since ESI's mining ledger has no time of day at all. The rate stays on
  the tab's summary strip, where its calendar-time basis is labelled beside it.
  This rules out a per-day or per-session rate anywhere in the modal.

- **The modal is read-only, and is its own component.** A Mining Yield row
  records what ESI reported; nothing about it is a pilot's to edit, so it has no
  action row. It is `YieldDetailModal.tsx`, deliberately not a generalization of
  the Tax tab's `RowDetailModal.tsx` — that one is bound to the Assignment /
  Payee / status model this tab has no concept of. Same ledger, different
  question; they share the visual vocabulary and nothing else.

- **Both totals state their basis in the modal itself, not in a tooltip.** Raw
  ore is priced as its compressed counterpart at the mined-date Jita average,
  and refining is computed at the character's own skills over an NPC station's
  50% base rate with no station tax. `engine/industry/reprocessing.ts` requires
  a caller showing refine values to say the second out loud; the first is what
  separates this number from what the pilot actually sold for. Both ride a
  permanent panel in the modal body.

- **An unpriced line renders as an em dash.** A line ESI had no mined-date
  history for values at 0, which means "unknown", not "worthless" — so it shows
  `—` per line and is left out of both totals rather than dragging them down.
  The entry-level Full/Partial badge on the table row keeps its existing
  meaning.

- **Part-batch leftovers are shown, never rounded up.** Ore short of a whole
  `portionSize` refines into nothing, so the modal names the leftover units
  instead of quietly implying the whole pile refines.
