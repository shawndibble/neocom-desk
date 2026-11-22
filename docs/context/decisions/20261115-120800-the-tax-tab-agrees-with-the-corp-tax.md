# Scope decisions — The Tax tab agrees with the Corp Tax Book (issue #6204)

_Recorded 2026-11-15 · issue #6204._

- **A day the member marked paid still named what the book billed.** While the book still counted
  the day unpaid, the row read "Marked paid" (warning tone), with "{corp} still shows {owed} ISK
  owed". Superseded by decision 20261120-235011: a Payee is paid oldest first, the pilot's figures
  for a book's Payee are read off the book's Running account, and there are no paid marks to
  reconcile.
- **Money pays only its own Miner.** Credit the book holds for a Miner, and a donation in flight
  from a character, pay only that Miner's days (`minerIdFor`), as the book credits them. A main's
  donation never reads an alt's separate Miner as paid. The pay dialog names whose each payment
  code is (the Miner name the officer stored, else its characters).
- **Ore a book bills is not owed to another Payee as well.** Once the book bills ore the member's
  own list gives another Payee (a closed day, or a Conflict that ran its 14 days), that share
  of the Assignment leaves every owed figure for that Payee (the owed strip and Manage Payees); an
  Assignment the book bills whole leaves Settle up for that Payee. The Assignment itself is not
  changed: an attention item names the overlap and opens the day, where "Let the corporation bill
  it" takes it off the list.
- **Credit shows on the Tax tab and in the pay dialog.**
- **Overdue is an attention item.** "{corp} late notice overdue since {date}", from the Late
  notices, payments and the book's Overdue days a member already reads. Declarations are
  officer-only, so the member's date ignores a declaration's pause.
- **A donation the book synced past stops counting.** An in-flight donation counts as paid until
  the book read its wallet 2 hours or more after it (`UNCREDITED_AFTER_HOURS`; was 3 days, shortened in 20261122); then it no longer
  pays any day and an attention item says "{corp} hasn't credited your {isk} donation of {date}
  — check the wallet division", naming the divisions the book reads. The Late notice mail and the
  verify page name those divisions as EVE's "Account" (the corp's own name when a Director
  stored it).
- **The pay dialog suggests the payer's Miner's payment code.** The Reason is pre-filled with the
  code of the paying character's Miner (one code per Miner, `minerPaymentCode`); with no payer
  known and several Miners owing, with none. The dialog says a payment goes to the oldest unpaid
  day first.
- **A day an officer wrote off in full bills nobody,** so its ore stays owed to the member's other
  Payee in the owed strip.
