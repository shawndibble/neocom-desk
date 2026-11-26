# Scope decisions — Record Changes: a saved write-once record of every automatic change to a miner's mining-tax records (issue #6765)

_Recorded 2026-11-25 · issue #6765._

- **The miner-side record is a Record Change, not an "Adjustment".** The corp book already has
  an `Adjustment` (an officer's correction, shown to the pilot as "Adjustment" in the Payee
  ledger), so a second thing by that name would collide in code, glossary and UI. The Synced
  Collection is `miningTaxRecordChanges`, the engine type `RecordChange`, and the ledger calls
  the line kind "Automatic changes".
- **One record per automatic change, four reasons from day one.** `tolerance` (a day closed
  within the book's tolerance) is the only one written now. `autoFix` (#6766), `fixMyRecords`
  (#6767) and `autoAssign` (#6768) carry the Assignments they changed, each with payee, tax %,
  tax owed and ore before and after (`null` for created or removed). The shape is in
  `src/engine/miningTax/recordChanges.ts`. Those tickets build a change with
  `assignmentRecordChange` (it drops Assignments that did not really change, and returns `null`
  when none did) and save it with `saveRecordChanges` in
  `src/features/miningTax/recordChangeStore.ts`.
- **Write once, by rule and by store.** `saveRecordChanges` only adds ids it does not already
  hold and never rewrites one. The Firestore rule allows create, delete, a tombstone and a
  re-save that changes only `updatedAt`/`ownerHash`; any edit of what a change says is denied.
  A later change that undoes an earlier one is a new Record Change.
- **A tolerance close-out is idempotent by its id.** The id is
  `tolerance:{corporationId}:{minerId}:{day}`, so running the books again, on this device or a
  second one, never saves a second record for the day. The writer waits for the collection's
  first pull on every Character it writes for, so a fresh device sees the other device's records
  before it decides.
- **What counts as a tolerance close-out.** A closed (billed) day that a payment reached, settled,
  not held, with a whole-ISK write-off no bigger than the tolerance: the corp's exemption for that
  day if it set one, otherwise `daySettleTolerance(billed, pct)`. A day forgiven only because the
  book's stored Paid through covered it is bigger than that and is not one. Outside the tolerance
  nothing is saved and the day still owes the rest, as before.
- **The miner side now settles at the corp's own tolerance.** The book's `dayTolerancePct` was
  only read on the corp side; members' Running accounts always used 0.5%. It is now threaded from
  the book doc through `readBookSettings` → `LoadedCorpBook` → `PersonalBook` → the open set, so
  the pilot's figures and the saved record match the book.
- **The saved line replaces the live tolerance write-off for its day, and keeps the balance
  honest.** The ledger derives a "Shortfall forgiven" row per closing payment. For a day with a
  saved close-out that row is dropped and the Record Change line carries the live write-off, so
  the forgiveness is never counted twice. If the day later changes and is no longer written off,
  the line stays (history survives) but moves the balance by nothing. Assignment changes never
  move the balance: the charges already show the new figures.
- **It belongs to one Character: the first of the miner's Characters the book tracks.** The id is
  account-wide, so the Character only decides where it syncs.
- **Not done here:** tolerance close-outs on the officer's Miner ledger (that reads the book's own
  records, not the miner's), and recording a close-out being undone when a day later reopens. The
  follow-up tickets add Record Changes for their own changes.
