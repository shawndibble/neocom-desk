# Scope decisions — The Tax tab agrees with the Corp Tax Book (issue #6204)

_Recorded 2026-11-15 · issue #6204._

- **A day the member marked paid still names what the book bills.** While the day's Statement is
  unsettled in the book, the row reads "Marked paid" (warning tone), and its tooltip and detail
  say "Marked paid by you — {corp} still shows {owed} ISK owed". It owes nothing on the member's
  side (their payment is done); it reads plain Paid once the Statement settles. A day no
  Statement bills yet keeps plain Paid by "Your mark".
- **Money pays only its own Miner.** Credit the book holds for a Miner, and a donation in flight
  from a character, settle only that Miner's days (`minerIdFor`), as the book credits them. A
  main's donation never reads an alt's separate Miner as paid. The pay dialog names whose each
  Statement code is (the Miner name the officer stored, else its characters).
- **Ore a book bills is not owed to another Payee as well.** Once the book bills ore the member's
  own list gives another Payee (on a Statement, or a Conflict that ran its 14 days), that share
  of the Assignment leaves the Payee's balance in the owed strip; an Assignment the book bills
  whole leaves Settle up for that Payee. The Assignment itself is not changed: an attention item
  names the overlap and opens the day, where "Let the corporation bill it" takes it off the list.
- **Credit shows on the Tax tab and in the pay dialog.**
- **Overdue is an attention item.** "{corp} Statement {period} overdue since {date}", from the
  Statements, payments and the book's Overdue days a member already reads. Declarations are
  officer-only, so the member's date ignores a declaration's pause.
- **A donation the book synced past stops counting.** An in-flight donation counts as paid until
  the book's last sync is 3 days or more after it (`UNCREDITED_AFTER_DAYS`); then it no longer
  pays any day and an attention item says "{corp} hasn't credited your {isk} donation of {date}
  — check the wallet division", naming the divisions the book reads. The Statement mail and the
  verify page name those divisions as EVE's "Account" (the corp's own name when a Director
  stored it).
- **The pay dialog suggests the payer's oldest open Statement's code.** Every Statement the book
  has not settled is listed oldest first with whose it is, whatever the tab reads locally. The
  Reason is pre-filled with the oldest open code of the paying character's Miner; with no payer
  known and several Miners' Statements open, with none. The dialog says a payment goes to the
  oldest open Statement first.
- **A day an officer wrote off in full bills nobody,** so its ore stays owed to the member's other
  Payee in the owed strip.
