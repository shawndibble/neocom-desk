# Scope decisions — Shorthand ISK on scanning surfaces, full precision on ledgers (issue #947)

_Recorded 2026-09-12 · issue #947._

- **Dense comparison tables and stat chips render ISK as shorthand; ledgers and
  editable fields keep every digit.** A board a player scans wants `1.3B` in a
  cell it can spare the width for; a wallet journal or transaction list is
  where a player reconciles against the game client, and a rounded figure there
  is a regression, not a tidy-up. The same rule rules out "shorthand
  everywhere" as the rollout's default: a surface qualifies because scanning is
  what it is for, not because it happens to show ISK.
- **`IskAmount` is a display treatment only — the underlying number stays the
  datum.** Sorting reads the true value (`DataTable`'s `sortValue`), CSV export
  and clipboard output keep exact figures, and the exact value is the element's
  accessible name so a screen reader gets it with no gesture. Shorthand rounds
  to one fraction digit, so two different values can render the same string;
  that collision is acceptable for scanning precisely because none of the above
  reads the rendered text.
- **The reveal gesture is a required prop, not a default.** `revealOn="tap"`
  where the figure is inert, `revealOn="longPress"` where the tap already acts
  (a row that opens a detail view owns its tap). The two cases are
  indistinguishable in JSX, so the call site has to say which it is.
- **`formatIsk` and friends stay, unchanged.** This is an expand-then-migrate
  sequence with no contract step: the old formatter remains the exact-value
  source for CSV, clipboard, accessible names and editable fields, and a
  half-converted app is a working app.
