# Scope decisions — Mining Tax: one edit form for every entry

_Recorded 2026-10-04._

- **Every assigned entry edits in `EntryEditDialog`, single or combined, owed or paid.** Supersedes the single-entry half of `20261004-135551` ("that rule still holds for the single-entry editor") and the paid lock in `20260927-105434`. The pilot found three different edit screens (the inline Assign form for an owed entry, the same form behind "Unlock to edit" for a paid one, and the combined form), none matching mockup F1. Now Edit always opens the F1 form: Payee and tax % once, then each day's ore. `AssignDialog` only creates Assignments, and `updateAssignment` and `unlockPaidAssignment` are gone; `updateCombinedAssignments` is the one write.
- **A paid entry opens ready to edit.** Choosing Edit is the deliberate step; a second "Unlock to edit" only repeated it. A note says the entry stays paid and its recorded payment stays linked, and nothing is written until Save.
- **"Edit ore values individually" applies to editing only.** Supersedes the "Assign/edit form" scope in `20260927-105434`: assigning a new entry always uses the Assign form's whole-row fields. In the edit form, on: one value box per ore line per day. Off: one value box per day, which drops that day's stored per-ore corrections once changed (they would no longer add up). Directly typing a tax-owed figure is no longer offered; it follows value × tax %.
- **The detail view's Settle up button no longer names the Payee.** The name is already the heading right above it.
- **History opens its newest month.** Supersedes "every month folded" in `20261004-135551`: the month at the top of History starts expanded, older months stay folded. The pilot reads the current month most.
- **No settled-Payee chips under the owed cards.** Supersedes "settled Payees are one line of names" in `20261004-135551`: they only repeated the Payee filter beside them.
