# Scope decisions — Moons has Late notices, not calendar bills by period

_Recorded 2026-11-18._

Narrows decision 20261117-043246 (a late notice's days stay running days).

- **The Moons tab of calendar bills is now "Late notices".** No calendar bill was ever sent on the
  old period model, so nothing legacy needs a page. The tab holds the notice run and a table of
  notices sent per Miner. The per-period table and its page are gone; Moon settings no longer
  offers cadence, the calendar-bill minimum or Overdue days.

- **The stored fields and the server stay as they are.** `cadence`, the calendar-bill minimum and
  `overdueDays` are still accepted and kept by the Cloud Functions: dev and prod share one
  Firebase project, so older clients may still send them. Removing them server-side is a later,
  separate change once no client does (decision 20261120-235011).
