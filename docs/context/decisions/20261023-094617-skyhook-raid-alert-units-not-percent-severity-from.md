# Scope decisions — Skyhook raid alert: units not percent, severity from the key (issue #4784)

_Recorded 2026-10-23 · issue #4784._

- **Part A only: the defender alert `skyhookRaidable`.** The raider alert, the
  `routeSafety` rows and the Calendar kind belong to other tickets. No corp
  board kind is added: the corp board already carries every skyhook window as
  `sovRaid` (#4775), so `corpDeadlines`, `Next` and the Deadline Strip have them.
- **The silo threshold is unsecured units, not a percent.** ESI sends no silo
  capacity (`corpSovereigntyModels.ts`, #4775), so a percent cannot be computed
  honestly. The threshold is the least unsecured reagent units that make an open
  window a danger Alert (options 0, 100, 1000, 10000; default 0, so every open
  window is one). An unread stock counts as at risk, never safe.
- **Lead time options 1, 2, 6, 12, 24 hours, default 2.** All inside the 72-hour
  Projection Horizon.
- **Three phases, two severities, one event.** `soon` (plain), `open` (silo below
  the minimum, plain) and `danger` (silo at or above it, Danger banner). Severity
  is otherwise per event (`alertSeverity`); this event's `danger` entries are
  critical because their Occurrence Key, which is the feed row's id, ends in
  `:danger`. That survives a push, a sync and a reload with no new field on the
  feed row or the push payload. A group wears its worst entry's severity;
  Acknowledge clears only the danger entries ("Mark all read" skips them).
- **Hedged Scheduled Push, from the baseline.** The Projection is built from the
  persisted snapshot, so it adds no ESI read; the poll's corp read is the
  Sovereignty widget's own cached one (about an hour), and a skyhook detail that
  cannot be read skips the poll rather than seeding a baseline that would
  announce its window as new later. The silo that picks `open` versus `danger`
  for the pushed opening is the one last polled, so the push is hedged like the
  other projections.
