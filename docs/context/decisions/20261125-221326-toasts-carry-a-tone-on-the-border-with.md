# Scope decisions — Toasts carry a tone on the border, with a glyph and a spoken word

_Recorded 2026-11-25._

- **A `Toast` takes an optional `tone`, and the border is what carries it.** Every toast looked
  the same whether it said "Copied" or "Couldn't remove character", and the app does raise real
  failures through toasts (`characters.removeFailed`, `market.hauling.copyFailed`,
  `market.sharedAppraisalLoadFailed`, `market.appraisal.janiceFailed.*`). `success` tints the
  1px border `success` and `danger` tints it `danger`, in place of `line-bright` — the border
  only, not a fill or a thick edge, so a toast still reads as the one surface it was.
- **Neutral stays the default, and only two rungs exist.** A routine confirmation ("Copied",
  "Plan deleted") is untoned: a toast that is only ever green teaches nothing by being green.
  `success` is for an outcome that could have failed and didn't — a save that went through —
  which is why it is on the moon settings save and the reclaim result and not on every copy.
  No `warning` rung was added for a caller that does not exist yet. This is not the corp board's
  severity ladder (`severityTone.ts`): that one is an ordered magnitude, this is two outcomes.
- **Colour is never alone, and the tone reaches a screen reader as text.** `TOAST_TONE` holds
  the border, the glyph and the i18n key in one record rather than three, for the reason
  `SeverityIcon` gives — three maps keyed the same way make forgetting one as easy as getting it
  right. The glyph (`Icon.Succeeded`, a new semantic alias for `CheckCircle` so `Toast` does not
  borrow a severity-ladder name, and `Icon.Warn`) is `aria-hidden`, and the word "Success" or
  "Error" is spoken ahead of the message in the existing `LiveStatus` region (DESIGN.md §7).
- **Nothing else about the toast changed.** The 200ms `toast-in` rise, the absent exit
  animation, the 8s clock and its hover/focus pause, the Alt+Z undo and the portal into a
  `Modal`'s own container all stay as they were. In particular, toasts raised by different
  features still render at the same fixed coordinates and overlap: there is no global host or
  queue, `ToastStack` fixes it only within one call site, and that remains open work.
