# Scope decisions — Wallet alerts key on the journal entry, not the day

_Recorded 2026-09-05._

- **`walletBalanceChanged`'s Occurrence Key is the journal entry id, superseding
  round 44's day bucket.** Round 44 read a wallet change as "a threshold
  crossing, not an entity with an id" and bucketed it on the poll day. It is
  not: `diffWalletBalanceChanged` high-water-marks on the journal entry's own
  `id` and emits one fire per entry, so the id was available all along —
  `corpWalletThreshold`'s `transactionAbove` case already keys on exactly that.
  The bucket cost real data. Every wallet alert after the first in a UTC day
  overwrote the previous row (only one survived per day, whatever else moved),
  the same entry seen on two different days became two rows, and the day row
  suppressed every later wallet _browser_ notification that day through the
  poller's `alreadyDelivered` check. A day bucket stays the rule only where
  there genuinely is no entity: `characterNotTraining` (the absence of
  training) and `corpWalletThreshold`'s `balanceBelow` (a balance crossing).

- **A Notification Feed row is dated by when the occurrence happened, where the
  fire knows.** `occurrenceFiredAt` supplies the row's `firedAt`, and falls back
  to the poll clock for the fires that have nothing better. A device polls only
  while the app is open, so one opened after days away reports everything it
  missed in a single poll; stamping all of it with that poll piles days of
  history onto one minute at the top of the feed. Wallet entries carry a real
  `date` and now use it. Market order fills do not — ESI's order history records
  when an order was _issued_, never when it filled — so they keep the poll
  clock, and the Overview's collapsed rows say how far back they reach instead.

- **A later observer of an occurrence may revise the copy, never a row's
  `dismissedAt`, and never its `firedAt` forward.** The second device, the
  Scheduled Push backend and this device's own poller re-diffing against an
  older baseline all write the same Occurrence Key. A whole-record `put` let
  the newest of those restamp the row and drop the dismissal with it, so alerts
  the user had already cleared came back, at the top of the list, dated now.
  The earliest `firedAt` of the two wins rather than whichever landed first,
  because the observers disagree on purpose — a push stamps its own arrival,
  the poller stamps the occurrence — and the earlier is the closer to when it
  really happened. This binds the sync pull path too, not only
  `recordFeedEntry`: `planSync`'s `syncFeed` writes the same rows.

- **A feed row is never trimmed by the write that created it.** The 300-row cap
  keeps the newest rows by `firedAt`, which used to be the write clock, so a
  new row could never be the one over the line. Now that a row can be dated
  days back, it can be — and deleting an alert in the same breath as raising it
  leaves nothing to re-fire it, since the poller's baseline has already moved
  past. It ages out through an ordinary later trim instead.
