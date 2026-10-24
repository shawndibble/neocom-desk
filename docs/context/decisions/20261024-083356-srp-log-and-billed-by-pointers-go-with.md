# Scope decisions — SRP log and billed-by pointers go with what they describe (issue #4942)

_Recorded 2026-10-24 · issue #4942._

- **The SRP retention sweep deletes a claim's SRP log entries with it, not anonymises them.** Filing, re-filing and every officer decision, matched by `detail.killmailId`, go in the same transaction as the claim. A killmail id leads back to the pilot through public killmail data, so an anonymised entry would still identify them. Supersedes the retention line of `20261023-125348-srp-pilots-file-officers-approve-corp-set-rules.md`: the sweep's own entry holds the count only, no claim ids. Corp-level entries (turn on/off, settings, reclaim, Doctrine Fits) keep no expiry.
- **Deleting a Corp Tax Book removes it from every billed-by pointer.** Run after the final delete pass, a pointer left empty is deleted. Turning a book on clears any pointer still naming that corporation, so a pointer stranded by a failed or raced delete never grants a new book's reads. No backfill of earlier sweeps or deletes.
