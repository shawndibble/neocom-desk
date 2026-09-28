# Scope decisions — Moon mining tax: manual and retroactive wallet transaction linking

_Recorded 2026-09-27._

- **A payment can hold more than one linked transaction.** `MiningTaxPaymentInfo.journalRefId`/`contractId` (single) become `journalLinks`/`contractLinks` (`MiningTaxPaymentLink[]`), each tagged `source: 'auto' | 'manual'`. Rules out a second valuation/grouping model: multiple entries settled together still go through the existing `paymentId` group (the Join flow), so this only needed to let one payment cite more than one real transaction (a lump sum paid in installments).

- **Linking is retroactive-capable, and purely informational.** The gap this closes: `linkRecordedPayment`'s silent auto-match (`autoMatchRecordedPayments`) only fires for an _unambiguous exact match_, and the pilot had no way to attach a transaction to an already-Paid row when the match was ambiguous, too old, or simply never found. The new `linkPaymentTransaction`/`unlinkPaymentTransaction` (`assignments.ts`) work on any Assignment regardless of status and never touch `status`, `taxOwed`, `amount`, or `paidOn` — a link is a reference, not a reconciliation. Rules out auto-recomputing a payment's `amount`/`paidOn` from its linked transactions; a pilot who wants those corrected edits the record by hand.

- **A `payment` can be created from the transaction itself.** `linkPaymentTransaction` accepts a `fallbackPayment` (paidOn/amount/method) used only when the target Assignment has no `payment` yet (a bare "mark paid" with no Settle-up record) — never forces a separate "record payment" step before linking. Rules out requiring Settle-up first; the transaction already carries what a minimal payment record needs.

- **Manual suggestions require exact amounts and always need explicit confirmation.** `exactAmountMatches` (`paymentLinks.ts`) is deliberately stricter than `suggestLink`'s fuzzy, tiered confidence: a row the pilot already marked paid needs no "maybe". A confirmed link is still tagged `source: 'auto'` when it came from the pre-selected suggestion (vs. `'manual'` for anything the pilot searched for and picked themselves) so the row detail can show "linked automatically" without claiming extra verification happened. Rules out silently auto-applying any link outside the existing `autoMatchRecordedPayments` path.

- **Deep-linking to the real transaction reuses the existing highlight-navigation, not a new mechanism.** A linked wallet-journal entry renders as a link to `/wallet/journal?highlight=<id>`; a linked contract to `/contracts?highlight=<id>` — the same `HIGHLIGHT_PARAM`/`useHighlightParam`/`row-pulse` chain already shipped for `walletBalanceChanged` notifications. Rules out building a second deep-link mechanism for this feature.

- **One-directional only.** The Wallet Journal/Contracts views gain no back-link or badge pointing at the Mining Tax entry that references them. Rules out reverse-navigation UI for this iteration — revisit only if it turns out to be missed in practice.

- **Personal wallet/contracts only.** No corp-wallet donation linking. A Payee's tax is a personal-character obligation, and `madePayments.ts`'s existing sourcing (`loadWalletJournal`/`loadContracts`, both character-scoped) already matches that.

- **No new retention table for the wallet journal.** Unlike the mining ledger's 90-day `miningLedgerHistory`, the wallet journal cache has no long-retention table — a transaction older than what ESI/the cache currently returns simply can't be manually linked (`RowDetailModal` shows the ref id with a "no longer cached" note in that case, via `LinkedTransaction.label === null`). Rules out adding a `walletJournalHistory` table now; revisit only as a separate, purpose-built ticket if this bites in practice.

- **Legacy single-ref payments read back without a Dexie migration.** `normalizePaymentInfo` (`paymentLinks.ts`) reads a pre-existing bare `journalRefId`/`contractId` as one `source: 'auto'` link, applied at every read boundary (`loadAssignments`, `linkedRefIds`, `unlinkedRecordedPayments`). Rules out a `db.version().upgrade()` migration, consistent with this file's existing rule that an unindexed field needs none.
