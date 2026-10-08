# Scope decisions — Dismissed deliveries in Job History are device-local (issue #2991)

_Recorded 2026-10-08 · issue #2991._

- **Dismissals are stored device-local, as `dismissedJobIds` on the Character's `industryJobHistory` row.** That table is already device-local and removed with the Character, so there is no new table, no migration, no sync registration and no FAQ change. The cost is that a pilot with several devices dismisses on each; syncing would mean a new synced collection for a convenience marking, which is not worth it. Revisit if pilots report being pestered on a second device.
- **The Dismiss control sits beside Log production in the row's existing action cell.** No new column or menu chrome (DESIGN §6c restraint); a dismissed row swaps it for Restore and keeps Log production, so logging a dismissed job still works and simply makes it logged.
- **A dismissal never hides a job.** A dismissed delivery stays in History with a Dismissed chip; a logged job ignores any dismissal and is not offered Dismiss.
