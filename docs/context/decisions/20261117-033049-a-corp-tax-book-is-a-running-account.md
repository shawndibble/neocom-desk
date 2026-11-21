# Scope decisions — A Corp Tax Book is a running account; calendar bills become late notices

_Recorded 2026-11-17 · issue #6294._

- **Each Miner's book is a running account, billed a day at a time.** A day is billed when it
  closes (after the book's grace hours), at that day's close-of-day price, onto the Miner's
  account. Payments pay the Miner's oldest unpaid day first, by amount (a donation cannot name a
  day or a moon), the moment the book holds them. Credit is only ever a real overpayment ahead of
  the days billed. This rules out holding payments as "credit for the next bill" for weeks
  while the corp member's days read unpaid.

- **The tolerance is per day, in percent.** A day a payment reaches counts as paid when the money
  falls short of its tax by no more than the book's tolerance (0.5% by default, corp setting); the
  gap is written off. A day nobody paid stays owed in full, and there is no per-day ISK minimum (a
  100,000 ISK floor per day would forgive millions a month). This absorbs the drift between a
  same-day payment at a live price and the book's close-of-day price; a Miner who pays after the
  day has closed pays the book's exact figure and has no drift at all.

- **Every Miner has one status, the same for officers and the Miner.** "Paid through {date}" when
  no billed day is unpaid, otherwise "Owes X (N days, oldest {date})". Officers can also read a
  Miner's days for a date range (e.g. the last 7 days) with the tax and payments in it.

- **What is mailed is a late notice, not a calendar bill.** A notice goes out only when a Miner is
  behind: their oldest unpaid day is at least N days old (14 by default), or on a fixed day of the
  month the corp picks, and only when the unpaid total is at least the book's minimum (10M ISK by
  default). After a notice, at most one more every 7 days (corp setting) while the Miner stays
  behind; none once they are paid up. A notice links to a pay page with the live total owed and the
  Reason code, and each follow-up mail lists every unpaid day (date, moon, tax), oldest first. The
  Overdue clock starts from a notice as before.

- **Each book switches over at a moment.** From the book's switch-over instant no calendar bill
  is issued; every closed day on no bill yet (late or rolled-over days from before included) is
  a running day, so nothing unbilled is forgiven by the switch. In the event no book in production
  had issued a calendar bill, so the calendar bill was removed (decision 20261120-235011). No migration rewrites the past. Firestore changes are additive only (dev and
  production share one project).

- **What this supersedes, for a book after its switch-over.** Decision 20261018-134401: the
  monthly calendar bill and its 5M roll-over minimum give way to late notices, and its
  max(0.5%, 100k) tolerance goes with the calendar bill. Decision
  20261021-084414: an officer write-off now forgives running days, oldest
  first, after every payment; what is left over is still dropped, never credit. Decision
  20261115-124520: the run card becomes a notice card (still a click from an officer's tab; automatic
  sync still never issues or mails). Decision 20261026-193440: a Miner's page reads back to their
  oldest unpaid day, not only to the newest bill's first day.

- **A day is settled a date at a time.** What one date's lines owe together (every moon that day) is
  one unit for payment and tolerance, and an open dispute on a date holds the whole date while it is
  open. Days a dispute holds neither stop nor advance "Paid through" and are not in what is owed.
