# Scope decisions — Corp Tax Book sync gaps assume 30-day ledger retention (issue #4062)

_Recorded 2026-10-18 · issue #4062._

- **A gap is the span between the last sync and what ESI still holds, assuming
  the observer ledger keeps 30 days.** The character ledger keeps 30 days; the
  corporation's 90 is claimed but unconfirmed, so the conservative figure is
  used. The day of the last sync counts as lost too, because a day's quantity
  keeps growing after a sync captured it. If ESI returns a row older than the
  assumed horizon, the horizon moves back to it (evidence of longer retention),
  so a wrong assumption can only over-report briefly, never hide a loss. A
  first sync reports no gap. Earlier gaps are carried into every later sync,
  because the server overwrites `lastSync.gaps` and lost history stays lost.
- **Wallet history gaps are not reported.** The journal's 30-day window can lose
  donations the same way, but the callable's gap shape is per refinery; a
  donation gap needs a backend field first.
- **An auto-sync on visit is skipped when anyone synced in the last 15
  minutes,** since ESI caches these endpoints for an hour.
