# Scope decisions — Settle up drops the wallet-journal link step

_Recorded 2026-09-11._

- **The Settle-up dialog is two steps, not three.** Direct request, after
  using the shipped three-step flow: step 3's "link to a recent outgoing
  wallet-journal entry" always came up empty, because ESI's wallet journal
  lags real time by minutes — a payment just sent in step 2 is never posted
  yet when step 3 immediately searches for it. Step 3's other two fields
  (paid-on date, method) merge into step 2, which now ends with the same
  "Record payment" action step 3 used to. `commit()`'s `journalRefId` is
  simply never set from this dialog anymore; `PaymentInput`/`MiningTaxPaymentInfo`
  keep the optional field unchanged; a manual link from `RowDetailModal` (if any
  is added later) or a future `journal` sync pass could still fill it in
  after the fact.
- **No replacement "link it later" UI for this specific case.** A pilot pays
  a lump sum through Settle up, ESI eventually shows the transaction, but the
  Assignments are already `status: 'paid'` and so drop out of
  `computePayeeBalances`'s "owed" set — `paymentLinks.ts`'s existing
  suggestion engine (`suggestLinks`/`LinkPaymentDialog`, issue #540) only ever
  offers a payment against a Payee's _outstanding_ balance, by design. Losing
  the never-actually-working live search costs nothing today: a mining tax
  figure is specific enough (exact ISK, the EVE day, and the recorded method)
  that this is a non-issue in practice, and no one has asked to re-verify a
  Settle-up payment against the journal after the fact. If that's ever
  wanted, it's a new feature — matching an already-`paid` Assignment's
  `payment` against a later wallet entry — not a fix to this dialog.
- **Dropped as dead weight along with the step:** `findPaymentCandidates` and
  the `WalletJournalEntry`-based `amountMatches` from `paymentMatches.ts` (no
  other caller), and the `settleUpStep3`/`settleUpNextRecord`/`settleUpJournal*`/
  `settleUpSummary` i18n keys. `paymentMatches.ts` keeps `PAYMENT_REF_TYPES`,
  `LINK_WINDOW_DAYS`, and `amountsMatch` — `madePayments.ts` and
  `paymentLinks.ts` (the paying-backwards flow) still use them.
- **The Mining route's "last updated" badge moves into the shared
  `PageHeader`'s `meta` slot, next to the title — the convention every other
  route already follows** (`PageHeader.tsx`'s own docstring calls this out).
  It previously lived inside each tab's own control row, alone on the left
  with nothing to line up against. Each tab now reports its own
  `data.fetchedAt` up to `MoonMiningTax.tsx` via an `onDataAgeChange` prop —
  each tab still owns its independent fetch lifecycle, this only surfaces the
  timestamp for display — and the route resets it on tab switch so the badge
  never shows the other tab's stale figure. With the badge gone, the Tax
  tab's own row (Manage Payees / Ore tags / Refresh) is left-aligned instead
  of pushed to `justify-between` against an empty slot.
