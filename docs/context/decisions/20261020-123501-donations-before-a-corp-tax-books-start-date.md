# Scope decisions — Donations before a Corp Tax Book's start date are ignored at read time (issue #4505)

_Recorded 2026-10-20 · issue #4505._

- **A donation dated (UTC) before the book's start date credits nothing, is never Unmatched, and is only counted for officers.** The filter lives in `allocatePayments` and `buildBookView` at read time (a donation on the start date counts), so moving the start date re-evaluates stored donations and nothing is deleted; the `functions/` mirror applies the same rule so the scheduled sync and browser agree.
- **Hand-recorded (manual) payments are never filtered by the start date.** An officer typed them in deliberately; only wallet-journal donations are ignored.
- **The count shows as a muted line above the Miners table.** Mining before the start date had no officer-facing treatment to sit beside, so the donation count introduces it.
