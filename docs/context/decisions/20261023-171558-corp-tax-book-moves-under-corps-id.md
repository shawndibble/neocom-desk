# Scope decisions — Corp Tax Book moves under corps/{id} (issue #4858)

_Recorded 2026-10-23 · issue #4858._

- **The Corp Tax Book moves from `corpTaxBooks/{id}` to `corps/{id}`, in one cut-over.** Corp data and officers live under one umbrella. Only one test book exists, so no long dual-read period: copy it with `scripts/migrate-corp-tax-book.mjs`, deploy the functions and rules, merge, then delete the old tree. Subcollection names stay as they were.
- **Tokens, invites, feeder pointers, removal links, billed-by and sync grants stay top-level.** They are keyed by token or character, not by book, so moving them gains nothing.
- **A real corp book on the old path would need the copy first.** The old client and functions stop reading it the moment the new ones deploy.
