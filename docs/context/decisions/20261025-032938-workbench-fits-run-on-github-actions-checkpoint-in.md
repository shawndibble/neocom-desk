# Scope decisions — Workbench fits run on GitHub Actions, checkpoint in R2 (issue #5071)

_Recorded 2026-10-25 · issue #5071._

- **The EVE Workbench fits sync runs as a GitHub Actions job (`public-data-workbench-fits.yml`, 04:20 and 16:20 UTC), not the `syncWorkbenchFits` Cloud Function.** Same `workbench-fits/<shipTypeId>.json` objects, so the client is unchanged. The resume checkpoint moves from Firestore `workbenchFitsSync/state` to R2 `workbench-fits-state/state.json` (outside the client's prefix; a missing object is a fresh pass from page 1, so the first run re-walks the pass the function had started; re-storing a fit is idempotent). A run fetches for 15 minutes (was 6) at the same 250 ms gap, so a pass takes fewer runs. Rules out any Firestore access from the job. The ticket named an `EVEWORKBENCH_API_KEY` secret; the code never sent a key (the API is public and unauthenticated), so no key is required or sent. The function export is gone, so deploy order matters (see the PR).
