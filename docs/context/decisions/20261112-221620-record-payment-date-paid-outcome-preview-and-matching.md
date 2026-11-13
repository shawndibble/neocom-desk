# Scope decisions — Record payment: date paid, outcome preview, and matching a wallet donation

_Recorded 2026-11-12._

- **Record payment has a Date paid field; no server change.** The `recordPayment` edit
  action already took an `at` instant and stored it as given, so the client now sends the
  chosen day instead of always "now". It defaults to today in EVE time (UTC) and refuses a
  day after today or before the book's start date, in the dialog. Today is sent as the
  current instant; an earlier day as noon EVE time that day, because only the day was
  asked for and noon keeps the instant inside it whatever the reader's zone. The server
  still accepts any instant (it always has); a future-date check there would need a
  Functions deploy and was left out.
- **The outcome before confirming is the book's own allocation.** `previewPayment`
  (`src/engine/corpTaxBook/paymentPreview.ts`) runs `allocatePayments` with and without the
  new payment and reads the difference: per Statement credited, settled (tolerance
  included), owed and credit after. It never re-implements the allocation, so the preview
  cannot disagree with the book after the edit. A Statement the dialog was opened on is
  pinned (`statementId`) and listed first, the way the money goes.
- **Matching a wallet donation assigns it; it never records new ISK.** When Unmatched
  donations exist, Record payment offers "Wallet donation" beside "Not in the wallet".
  Picking one runs the existing `assignPayment` action for this Miner, so the same ISK is
  never in the book twice. A donation an officer marked wholly "not tax" is not offered.
  The list gets a search box (sender or amount) from four donations up; fewer read at a
  glance. Needs you's Assign to a Miner dialog is unchanged.
