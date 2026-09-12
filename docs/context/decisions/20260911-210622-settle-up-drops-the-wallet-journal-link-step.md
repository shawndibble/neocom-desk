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
- **A recorded-but-unlinked Settle-up payment is matched and attached
  automatically later, with no confirmation dialog.** Once Settle up marks an
  Assignment `paid`, it drops out of `computePayeeBalances`'s "owed" set, so
  `suggestLink`'s existing dialog (`LinkPaymentDialog`, issue #540) — which
  only ever offers a payment against a Payee's _outstanding_ balance — would
  never surface it again. `paymentLinks.ts` gains
  `unlinkedRecordedPayments` (every `paid`, not-yet-linked Settle-up payment,
  grouped by its shared `paymentId`) and `autoMatchRecordedPayments`, which
  attaches a `MadePayment` only when its amount, paying character, and date
  (within `RECORDED_LINK_WINDOW_DAYS` of the pilot's own recorded `paidOn`)
  match exactly one candidate — an _ambiguous_ match (more than one
  plausible transaction) is never guessed. Direct request: unlike
  `suggestLink`'s dialog, this never prompts — a mining tax lump sum (exact
  ISK, a specific paying character, the pilot's own recorded date) is
  specific enough that asking to confirm would be busywork. `TaxTab` runs
  this in a `useEffect` keyed off the same `madePayments`/`everyAssignment`
  it already loads for `LinkPaymentDialog`'s suggestions, writes through the
  new `linkRecordedPayment` (patches `journalRefId`/`contractId` onto every
  Assignment sharing that `paymentId`, leaving the rest of `payment` alone),
  and guards against re-attempting an already-tried `paymentId` with a ref —
  it deliberately does not call `refresh()` (that always re-hits ESI); the
  same-render exclusion from `linkSuggestions` keeps the "unlinked payments"
  card in sync immediately, and the write itself is picked up on the next
  real reload like any other Assignment field.
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
