# Scope decisions — A new Assignment remembers the ore a book took

_Recorded 2026-11-22._

- **The Assign form hands the new Assignment the ore a book took.** Follows decision
  20261122-053305. A release is remembered on the Assignment, which is lost when the pilot unassigns
  it and assigns again: the game's ledger still reports the book's ore, so it grew straight back
  into the new Assignment. The form offers only the ore no book took (the Tax tab subtracts the
  books' ore from the free ore); the display rows keep what the books took (`bookTakenOreLines`, read off the same status-correct
  free ore), and the new Assignment stores those types as `releasedTypeIds`. Rules out reading the books inside reconcile, which runs without them.
