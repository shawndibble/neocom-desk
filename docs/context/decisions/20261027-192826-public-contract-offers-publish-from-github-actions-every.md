# Scope decisions — Public contract offers publish from GitHub Actions every 30 minutes

_Recorded 2026-10-27._

- **The public contract offers and courier snapshots publish from `public-data-contract-offers.yml` every 30 minutes (was hourly on a Cloud Function).** The job was the largest billable function (1 GiB, hourly). It needs no Firebase, so it runs on the free runner, fired on time by the `public-data-dispatch` Worker's second cron. An unchanged archive ends after one R2 read, so 30 minutes costs little. Supersedes the 60-minute cadence of #5066.
- **Its four state records moved from `systemConditions` docs to R2 objects under `contract-offers-state/`**, read through the S3 API (never the CDN). First runner run has no state and re-uploads every type once.
- **Cutover: one writer at a time.** Pause the Cloud Scheduler job for `syncPublicContractOffers` before the first runner run, delete the function after a day of clean runs. The function's export is gone from `index.ts`; a manual functions deploy prompts to delete it.
