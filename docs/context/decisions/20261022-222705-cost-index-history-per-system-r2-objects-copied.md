# Scope decisions — Cost index history: per-system R2 objects copied from EVE Ref (issue #4778)

_Recorded 2026-10-22 · issue #4778._

- **History comes from EVE Ref, not our own accrual.** EVE Ref publishes `/industry-systems/` (hourly files, yearly archives since 2017), so #4785's own daily snapshot was dropped and history exists from day one. The ticket's "nobody publishes history" premise was wrong.
- **Per-system R2 objects, `cost-indices/<systemId>.json`, 120 days.** EVE Ref's files are ~2 MB each (every system), so the app cannot read them for a chart (30 days is ~60 MB). One small object per system, all activities, columnar (`dates` plus one value array per activity, `null` where absent). Mutable key, `max-age=3600`, outside any lifecycle rule.
- **Rides `syncLpStoreOffers`, not a ninth scheduled function.** Same R2 secrets and daily cadence; the two halves fail independently. `functions/scripts/backfill-cost-indices.mjs` fills past days from EVE Ref (the day's last hourly file) and needs `bzip2`.
- **A popover, not an inline sparkline.** The number stays the main thing; the trend is detail on demand.
