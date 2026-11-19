# Scope decisions — Moons has Late notices, not Statements by period

_Recorded 2026-11-18._

Narrows decision 20261117-043246 (a late notice's days stay running days).

- **The Moons "Statements" tab is now "Late notices".** No Statement was ever sent on the old
  period model, so nothing legacy needs a page. The tab holds the notice run and a table of
  notices sent per Miner. The per-period table and the `/corp/moons/statements/<period>` page
  are gone; Moon settings no longer offers cadence, minimum Statement or Overdue days.

- **The stored fields and the server stay as they are.** `cadence`, `minimumStatement` and
  `overdueDays` are still accepted and kept by the Cloud Functions: dev and prod share one
  Firebase project, so older clients may still send them. Removing them server-side is a later,
  separate change once no client does.
