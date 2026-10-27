# Scope decisions — Moon mining tax: link transactions from a joined group

_Recorded 2026-09-27._

- **Linking a transaction from `GroupSummaryModal` applies to every member of the joined group at once, not just one.** A joined group (issue #523's "join entries") is billed as one combined obligation, so a wallet-journal or contract reference attached from the group view is attached to every member — mirroring how a single row's own shared `paymentId` group already worked (`assignmentsSharingPayment`). Rules out a per-member link from the group summary; that's still reachable by drilling into a member via `onEditMember` → `RowDetailModal` if ever needed, but isn't the primary flow.

- **Fixed a real gap this surfaced: `linkPaymentTransaction` now mints one shared `paymentId` for the whole batch of assignments that lack a payment, not one each.** Before this, linking a transaction to several bare-paid Assignments (exactly what "mark all paid" on a joined group produces — no `payment` record at all) gave each Assignment its own independent payment, defeating the "one obligation" model. An Assignment that already carries its own `payment` (e.g. joined after being individually Settled-up) keeps its own `paymentId` untouched — only assignments genuinely missing one share the newly-minted id.

- **Gated on the whole group being Paid (`!anyOutstanding`), matching the single-row rule (`status === 'paid'`).** A joined group with any outstanding member offers no linking — the group's combined obligation isn't settled yet, so there's nothing coherent to attach a transaction to.

- **The group's linked-transactions list is the deduplicated union across every member's `payment`.** In the common case (one shared payment, or none) this is just that one payment's links; it also degrades sensibly for the rare pre-existing-mixed-payment edge case (a member already individually paid before being joined) without crashing or double-counting a ref linked to more than one member.

- **`GroupSummaryModal` gets no `paidAt` display.** Unlike the single-row `RowDetailModal` (which already shows it), a joined group's members can in principle have been marked paid at different moments before joining — showing one representative timestamp would imply more precision than the data guarantees. Out of scope for this pass; only the transaction-linking capability was asked for.
