# Scope decisions — Fixing a Conflict takes one click with an Undo

_Recorded 2026-11-22._

- **"The book is right" is one click, with an Undo, not a confirm.** Fixing a Conflict took six
  steps (Review, pick, Open the day, Let the corporation bill it, Take it off my list, then often
  an Unassign and Assign). One Conflict day with ore to take off now has a primary "Let {corp} bill
  it" on the Conflicts banner; the Resolve dialog's "Fix my records" does the same instead of
  opening the day. Either takes the ore off at once (`planTakeover`, shared with the day's own
  notice) and shows a toast whose Undo puts the Assignments back exactly as they were
  (`restoreAssignments`, which also forgets their tombstones). The day's own two-step notice stays.
  Several Conflict days still go through Review. Rules out a confirm dialog on a reversible edit.
