# Scope decisions (round 31) — draggable prereq rows

_Recorded 2026-09-02._

- **Prereq rows are draggable, and dragging one promotes it** (supersedes
  round 17's "dimmed, non-interactive rows"). There is nowhere else for a
  dragged prereq row to persist a position to: the normalizer rebuilds those
  rows from the entry list every run and would discard any parallel ordering
  stored beside them. So the drag creates the entry rather than trying to
  remember the row — target level is the level of the row dragged, and if the
  skill is already an entry that entry is moved and its target raised rather
  than duplicated (one entry per skill, as `reorder.ts` requires).
- **Promotion has a non-drag path.** Every prereq row carries a "+" button
  that promotes it exactly where it already sits. Drag is a discovery problem
  on a phone and a dexterity problem for some users, and neither is a good
  reason to be unable to claim a prerequisite.
- **No automatic demotion.** An entry whose levels a later edit makes
  redundant stays an entry; it leaves the plan only via its own remove
  button. Promotion is the user taking ownership of a row, and silently
  handing it back would be the same class of surprise this round removes.
- **A drop the scheduler would silently undo is refused, with a reason.**
  Prerequisite order is enforced by construction in `plan.ts`, so dropping a
  skill after something that requires it never errored — it produced a
  zero-time ghost row while the schedule trained the skill where it always
  had. The editor now rejects that drop outright and names the entry that has
  to stay behind it, leaving the plan untouched. This covers ordinary entry
  drags too, not just promotions: the silent correction was the same one.
  It is the same principle as "reorder never applies silently" (round 12) read
  from the other side — the plan never _ignores_ a reorder silently either.
