# Scope decisions — Corp Tax Book auto-assigns unassigned open-day ore (issue #6768)

_Recorded 2026-11-25 · issue #6768._

- **A record is "unassigned" per Mining Ledger entry, not per ore line.** The rule is "if it is
  already assigned, do nothing until the day closes". An entry with any hand-made Assignment,
  split, Survey connection, paid or dismissed record on it is left whole; only an entry with no
  Assignment, or only unpaid Default-System Assignments to some Payee other than the book's
  corporation, is assigned. Partial cover is left alone because growth on that day already goes
  to the pilot's own Assignment, and splitting the rest off to the corp would second-guess them.
- **A Default-System Assignment to the corporation's own Payee counts as assigned.** It already
  bills the right Payee (and the Default-System runner never targets a book-owned Payee anyway).
  A Default-System one to anyone else is taken over whole, the same way a Survey connection takes
  one over (`takeOverFromDefaults`, now shared).
- **The planner is `planBookAutoAssign` in `src/engine/miningTax/bookAutoAssign.ts`.** A system
  counts when the book has observed any refinery there (any miner, any day), the Character is in
  the book's `characterIds`, the day is on or after the book's start date and not yet Billable
  (`isDayBillable` with the book's clock). Exactly one such book, or nothing: two books in one
  system leave it Pending for the close-of-day fix (#6766).
- **The rate is the book's own `resolveRate` for this miner**, with the refinery, moon, feeder and
  guest status taken from what the book saw this Character at in that system today, else the most
  recent earlier day, else the system's only refinery. No book rate means no auto-assign.
- **The label is the refinery's name when the book knows it, else no label.** The row already
  names the system, so "else the system" is met without writing the system name into the label
  a second time.
- **The corp Payee is the miner's own stored one** (`payeesOfBookCorporation` for that
  Character), created once with the corporation's id, name, book hub and the rate when missing.
  The Assignment is an ordinary pilot-act record (`override` absent), so the overlay's step 1b
  reads it as own-Payee ore and shows the estimate; it takes growth for the rest of the day.
- **It runs in the feature layer next to the other book side-effects** (`useBookAutoAssign`,
  from `useTaxCorpBooks`), not in `loadMoonMiningTaxSnapshot`: the books are already read there,
  and reading them again in the snapshot would double the Firestore reads. It waits for the
  payment links and the Record Change pull (`linksReady`, `recordChangesReady`), re-plans against
  Dexie before writing, and refreshes the ledger when it assigned something.
- **Precedence is hand-made > Survey connection > book auto-assign > Default System.** Survey
  connections run inside the snapshot first, so they cover the entry before this runs; Default
  Systems are taken over. A Survey connection started later on a day this already assigned sees
  an ordinary Assignment and leaves it, as it would a hand-made one: telling them apart would need
  a new synced field, which this did not add.
- **An unassign is respected.** Unassigning records the entry's opt-out (`defaultOptOuts`), and
  the auto-assign skips opted-out entries, so the pilot's choice is not fought.
- **One `autoAssign` Record Change per auto-assign**, id `autoAssign:<assignment id>`, carrying the
  new Assignment and each Default-System one it replaced.
- **Closed days are out of scope.** Nothing here touches a Billable day; that is #6766.
