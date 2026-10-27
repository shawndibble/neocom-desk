# Scope decisions — Job History is device-local, personal jobs only (issue #2866)

_Recorded 2026-10-07 · issue #2866._

- **Job History lives in Dexie `industryJobHistory`, device-local, never synced.** Delivered jobs are re-fetchable while ESI still lists them, and syncing a growing per-Character array would bloat Firestore documents. Rules out cross-device history beyond what each device has fetched.
- **Personal jobs only.** Corp jobs have no Log production flow today, so a corp delivered job could never become "logged".
- **Logged vs unlogged:** exact match on `ProductionRunRecord.sourceJobId` (set when logging from a job), else a fallback of same Character + product type with `loggedAt` at or after the job's end, each run used once.
