# Scope decisions — Corp Tax Book Needs you: not-tax donations, leavers and waivers (issue #6207)

_Recorded 2026-11-15 · issue #6207._

- **An Unmatched donation marked not tax in full leaves Needs you, on both the client and the server read model.** A partly marked one stays until the rest is assigned. For an unassigned donation the "not tax" dialog says it leaves Unmatched and credits no one, instead of "the debt reopens".
- **A leaver's account bills no new days unless they mine again, so the card no longer says "still mailed each month".** It offers "Send reminder", the same manual reminder as an overdue Miner's (one per Late notice), and "Write off" as the secondary action. This corrects the "still mailed" line in `20261018-134402`.
- **The overdue card's secondary action is "Waive all", not "Dismiss".** It opens the same dialog, which already says the whole balance is waived; the label now says so before the click.
- **A source the last sync could not read (donations, Extractions) is a warning on the Overview's health strip, not only in Settings.** A source the active scheduled sync did read covers an officer visit that could not read it, so an officer without wallet roles is not warned while the schedule reads the wallet.
