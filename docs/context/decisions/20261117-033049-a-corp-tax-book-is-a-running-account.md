# Scope decisions — A Corp Tax Book is a running account; Statements become late notices

_Recorded 2026-11-17._

- **Each Miner's book is a running account, billed a day at a time.** A day is billed when it
  closes (after the book's grace hours), at that day's close-of-day price, onto the Miner's
  account. Payments pay the Miner's oldest unpaid day first, by amount (a donation cannot name a
  day or a moon), the moment the book holds them. Credit is only ever a real overpayment ahead of
  the days billed. This rules out holding payments as "credit for the next Statement" for weeks
  while the member's days read unpaid.

- **The tolerance is per day, in percent.** A day a payment reaches counts as paid when the money
  falls short of its tax by no more than the book's tolerance (0.5% by default, corp setting); the
  gap is written off. A day nobody paid stays owed in full, and there is no per-day ISK minimum (a
  100,000 ISK floor per day would forgive millions a month). This absorbs the drift between a
  same-day payment at a live price and the book's close-of-day price; a member who pays after the
  day has closed pays the book's exact figure and has no drift at all.

- **Every Miner has one status, the same for officers and the member.** "Paid through {date}" when
  no billed day is unpaid, otherwise "Owes X (N days, oldest {date})". Officers can also read a
  Miner's days for a date range (e.g. the last 7 days) with the tax and payments in it.

- **Statements are late notices, not calendar bills.** A notice goes out only when a Miner is
  behind: their oldest unpaid day is at least N days old (14 by default), or on a fixed day of the
  month the corp picks, and only when the unpaid total is at least the book's minimum (10M ISK by
  default). After a notice, at most one more every 7 days (corp setting) while the Miner stays
  behind; none once they are paid up. A notice links to a pay page with the live total owed and the
  Reason code, and each follow-up mail lists every unpaid day (date, moon, tax), oldest first. The
  Overdue clock starts from a notice as before.

- **Each book switches over from a date.** The running account and notices apply from the book's
  switch-over date; Statements issued before it stay as they are (a settled Statement never
  reopens). No migration rewrites the past. Firestore changes are additive only (dev and
  production share one project).
