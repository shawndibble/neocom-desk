# Scope decisions — One Conflict and Fix my records for a paid closed day (issue #6767)

_Recorded 2026-11-25 · issue #6767._

- **A closed day the auto-fix may not touch because money reached it is one Conflict.** The
  `conflict` plans from `planClosedDayFix` (decision 20261125-221213) are computed once in
  `useTaxCorpBooks` (`closedConflicts`) and matched to a book row by character, day, system and
  corporation (`closedConflictFor`). Such a day counts in the Conflicts summary even when its row
  is `billed` or `paid`, opens the Conflict in its day detail, and its Resolve target is a
  `conflict` problem carrying the plan. Per the user: when a payment is made or recorded on a closed
  day that differs from the book, flag it and let the miner choose.
- **The copy says what differs, from the plan itself.** `closedDayDifferences(plan)` (pure, in
  `closedDayFix.ts`) names ore listed for the corp's own Payee beyond the book (`overListed`), ore
  the book recorded that went to another Payee (`elsewhere`), ore it recorded that the miner had not
  assigned (`unlisted`), and a different rate (`rate`). The blockers say why nothing changed on its
  own (a paid Assignment, or money on the book's day). The old "claimed twice" title and "its book
  also recorded it" line are gone for these days; the legacy row-conflict facts now follow the row's
  cause (own entry needs review, moon owner) instead of always claiming the book recorded the ore.
- **Fix my records is the same planner and the same apply as the auto-fix, confirmed.** The day
  notice shows a before → after preview of every Assignment (`ClosedDayFixPreview`) after a first
  click, then applies; the Resolve dialog shows the preview under the preselected Fix my records
  choice and applies on its one button. Both call `fixClosedDay(plan, 'fixMyRecords')`. Its Record
  Change id gets the time appended, since a miner may fix, undo and fix again.
- **Undo uses the Record Change.** `fixClosedDay` now also returns the Assignments as they were
  read inside its transaction; the Undo toast calls `undoClosedDayFix`, which checks every changed
  Assignment still matches the change's "after" (else it writes nothing and says so), deletes the
  ones the fix created, puts the originals back (clearing their tombstones), and saves a new
  Record Change with the new reason `undo` (before and after swapped). Rules need no change: they
  never checked the reason.
- **The old separate paths are retired.** "Let the corporation bill it" (`TakeoverConfirm`,
  `planTakeover` and its `releaseOre` takeover) is removed; the Conflicts banner's one-click fix,
  offered when one day is in Conflict, now runs Fix my records on that day's plan. A
  row Conflict on a day with no plan yet (another book on the entry still open, a Hold, two rates)
  keeps its facts, Tell {corp} and Resolve, and says that Fix my records puts the records right
  once the whole day has closed and nothing holds it; the Resolve dialog offers Fix my records only
  when a plan exists. Dispute, I don't owe this and Not paying are unchanged, and after those it is
  between the miner and an officer.
- **The display-only own-Payee trimming in `overlayCorpBooks` stays.** While a paid day's Conflict
  stands (the miner may dispute or choose Not paying instead of fixing), the book's rows still stand
  for the own-Payee entry, so the excess must still not be billed a second time; the Conflict now
  names that excess. Once Fix my records runs, the stored records match and the trim is empty, as on
  an auto-fixed day.
- **What is still owed is the book's Running account, as before.** Money paid to the corp is read
  off the running account; if it falls short of the fixed day's bill by more than the tolerance the
  rest stays owed on the day, within it the day closes with a tolerance Record Change (#6765).
