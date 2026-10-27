# Scope decisions — Mining Tax row detail shows how an estimate was priced, with Copy as text (issue #2832)

_Recorded 2026-10-07 · issue #2832._

- **An assigned row's detail shows a "How this was priced" card: per-ore quantity × unit price, the price tier, the Payee's hub, ore form and tax %, with a visible "Copy as text" button.** The corp's own figures need the Accountant role, so the player's half of a dispute is what the app used; a pasteable breakdown is the only thing they can send the landlord. Not a ⋮ item: it is the card's one job.
- **Unit prices and tiers are re-derived for the mined date, not frozen on the Assignment.** Frozen figures stay the bill (the copy ends with the frozen value and tax owed); when the re-derived total differs, the card says so. A hand-edited per-ore value is labelled "Edited by hand" instead of a source. Freezing prices on the record was ruled out: it widens the Dexie/Firebase schema for a diagnostic view.
