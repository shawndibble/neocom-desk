# Scope decisions — Fitting edits push browser history (issue #1533)

_Recorded 2026-09-24 · issue #1533._

- **Each Fitting edit pushes a history entry; it is the one exception to ADR
  0015's "writes replace history".** ADR 0015 keeps Back for places, not
  filter tweaks. An open Fitting's `?f=` is different: it is the Fitting
  itself (the URL is the working state, `20260924-150509`), so Back and
  Forward should walk its edits, as an undo does. `useUrlParams` takes an
  opt-in `{ push: true }` for this; every other view-state write still
  replaces.
- **Repeats of one control coalesce.** Edits from the same control within a
  second (a drone count typed digit by digit) replace the entry the run
  pushed, so Back undoes the whole run rather than one keystroke. Back,
  Forward or a pasted link ends a run. Add-panel search text, filter chips
  and the chosen slot never touch the URL.
