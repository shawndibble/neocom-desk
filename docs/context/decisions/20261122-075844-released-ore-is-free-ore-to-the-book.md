# Scope decisions — Released ore is free ore to the book

_Recorded 2026-11-22._

- **Ore released to a book is free ore to that book.** Follows decisions 20261122-053305 and
  20261122-062301. `releasedTypeIds` keeps the game's ledger from growing released ore back into an
  Assignment (`computeOwnership` skips it), but then nobody held it: it was neither free nor
  allocated, so the book's overlay called it a Conflict with no owner. The detail then found no
  entry of the pilot's, offered no take-over, and the banner's one-click fix vanished.
  `computeOwnership` now also returns `released` (what the entry still reports of a released type
  and no Assignment holds), the row carries it (`releasedOreLines`), and `personalEntriesOf` adds it
  to the free ore handed to the book, which bills it normally. It stays out of `unassignedOreLines`,
  so the Tax tab never offers it. Rules out un-releasing on a Conflict. Known gaps, not fixed here:
  Join and Continue session create records without the marker, and Coalesce keeps only the
  surviving record's marker.
