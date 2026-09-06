# Scope decisions — Touch tooltips: tap to open explain-only triggers, and no auto-dismiss

_Recorded 2026-09-06._

- **A trigger whose only job is explaining opens its tooltip on a plain tap.**
  `Tooltip` takes `openOnTap`, and `InfoTooltip` sets it whenever the "?" has
  no `onClick`. The bare-`Tooltip` explain-only affordances take it too: the
  stale-cache caveat on the Corp board, the buy/build/react glyph in the
  Materials table, and the stale contract status. Tapping the same trigger
  again hides it. Rules out touch-and-hold as the only way to read an
  explanation.
- **A trigger that acts on tap keeps the tap for that action.** `InfoTooltip`
  with an `onClick` (today only the Calculation Breakdown "?", which opens the
  modal) stays on touch-and-hold, as does every `Tooltip` wrapping a real
  control — `IconButton`, roster rows, implant chips. The gate is "does the tap
  already mean something", not "does it open a modal": a future non-modal
  `onClick` is on hold too, deliberately.
- **A touch-revealed tooltip has no timeout.** The old 1.5s auto-dismiss
  closed the bubble before it could be read. It now stays up until something
  dismisses it — a tap outside, a scroll, Escape, another tooltip, or another
  tap on an `openOnTap` trigger. Rules out reading time being a fixed number
  the component picks.
- **The "?" icon keeps its 16px look and gets a 24px touch target.** An
  invisible inset pseudo-element extends the hit area to the floor of
  `docs/DESIGN.md` §3 without changing layout, because tap is now the
  sanctioned way to use it. It stops exactly at the floor rather than going
  wider: the "?" sits a `gap-1` from a `Select` in `HistoryViewSelect`, and a
  wider box would start stealing that control's taps. Rules out growing the
  glyph itself, and rules out the `size-11 md:size-9` control tier — this is
  an inline glyph inside a line of text, not a control on its own row.
