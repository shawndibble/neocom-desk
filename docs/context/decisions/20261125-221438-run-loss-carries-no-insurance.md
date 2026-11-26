# Scope decisions — Run Loss carries no insurance

_Recorded 2026-11-25. Supersedes the insurance parts of `20261008-000350-run-loss-own-synced-record-insurance-outside-sales.md`._

- **A Run Loss has no insurance payout.** Insurance covers a ship hull, never cargo, and a Production Run's units are lost as cargo (hauled, jettisoned, seized). There is no wallet-journal picker, no typed ISK, no "+ Insurance" row in the profit breakdown and no insurance offset in the loss figure.
- **Realized profit is unchanged by a loss.** The whole run cost is still charged; the breakdown shows "Cost of lost units" on its own line, already inside the profit.
- **The synced fields stay, untouched.** `insurancePayout` and `journalEntryId` remain on the `productionLosses` record and remote doc. A new loss writes `insurancePayout` as 0; editing an old loss keeps both fields as stored, so the older client's numbers do not move. Kept because production runs the older client, which sums it, and Firestore changes from `develop` stay additive. Nothing reads it; payouts stored by earlier losses are ignored. Drop both fields after a `main` promotion.
- **New loss ids are random UUIDs.** Existing ids keyed on a journal entry id stay as they are.
