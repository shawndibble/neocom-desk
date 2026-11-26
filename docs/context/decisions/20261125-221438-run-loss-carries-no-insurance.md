# Scope decisions — Run Loss carries no insurance

_Recorded 2026-11-25. Supersedes the insurance parts of `20261008-000350-run-loss-own-synced-record-insurance-outside-sales.md`._

- **A Run Loss has no insurance payout.** Insurance covers a ship hull, never cargo, and a Production Run's units are lost as cargo (hauled, jettisoned, seized). There is no wallet-journal picker, no typed ISK, no "+ Insurance" row in the profit breakdown and no insurance offset in the loss figure.
- **Realized profit is unchanged by a loss.** The whole run cost is still charged; the breakdown shows "Cost of lost units" on its own line, already inside the profit.
- **The synced field stays, always 0.** `insurancePayout` remains on the `productionLosses` record and remote doc and is written as 0, because production runs the older client, which sums it, and Firestore changes from `develop` stay additive. Nothing reads it; payouts stored by earlier losses are ignored. Drop the field after a `main` promotion.
- **New loss ids are random UUIDs.** Existing ids keyed on a journal entry id stay as they are.
