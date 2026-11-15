# Scope decisions — Automatic sync runs every 2 hours (issue #6234)

_Recorded 2026-11-15 · issue #6234._

> Amends the 6-hour cadence of ADR 0025 and of `20261018-231926-corp-tax-book-scheduled-sync.md`; the ADR text is left as written.

- **`syncCorpTaxBooks` runs every 2 hours at 35 past, 00:35 UTC first (12 runs a day).** `BOOK_SYNC_HOURS_UTC` is `[0, 2, …, 22]`, so the cron and the Moon owners tab's "next read" time follow from the one list. ESI caches the mining observer ledger and the wallet journal about an hour, so every run sees new data. The 00:35 run still closes yesterday after the 30-minute grace; Billable, the grace and the 00:35 close are unchanged.
- **A synced book rests 1 hour (`SYNC_REST_MS`), under the 2-hour spacing.** It was 5 hours under 6; the rest only has to stay below the gap so a late run never makes a book skip a slot.
- **The extra load is accepted, not throttled further.** Quiet runs keep an unchanged book to a few Firestore reads and still force one full read a day (`QUIET_MAX_AGE_MS`, 24 h). Moon owners have no rest, so each is read on all 12 runs a day instead of 4, spaced and bounded as before. A run already stops on a low shared ESI error budget, so three times the requests cannot starve other users.
- **Changing the schedule is not a new export.** The Cloud Scheduler job only changes once `syncCorpTaxBooks` is redeployed.
