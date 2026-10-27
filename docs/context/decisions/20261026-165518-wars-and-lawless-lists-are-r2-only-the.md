# Scope decisions — Wars and lawless lists are R2-only; the removals finalizer rides the dispatch tick (issue #5072)

_Recorded 2026-10-26 · issue #5072._

- **The app reads the open-wars and lawless lists from R2 only.** The Firestore fallback, `syncActiveWars`, `syncLawlessSystems` and the `systemConditions` client read rule are gone. A failed or stale R2 read shows the existing "none" state. Supersedes the R2-first-then-Firestore read path of #5067 and #5068.
- **`finalizeDueRemovals` runs on the hourly `dispatchProjections` tick** (the 15-minute tick whose UTC minute is under 15), not as its own Scheduler job. Behavior and deadlines are unchanged; a removal ends up to ~1 h after its deadline, as before. Cloud Scheduler goes from 11 jobs to 5.
