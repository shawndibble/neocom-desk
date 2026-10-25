# Scope decisions — LP store offers and cost indices publish from a GitHub Actions job (issue #5069)

_Recorded 2026-10-25 · issue #5069._

- **The daily LP store offers crawl and the cost index merge run as one GitHub Actions job (`public-data-lp-store.yml`, 00:30 UTC), not the `syncLpStoreOffers` Cloud Function.** Same R2 keys and shapes, so the client is unchanged. The job keeps no state, so no state object. It cuts a 1 GiB scheduled function and a Cloud Scheduler job. Rules out any Firestore access from the job; the function export is gone, so deploy order matters (see the PR).
