# Scope decisions — Certified Plans hide when trained and drop trained levels (issue #2392)

_Recorded 2026-10-01 · issue #2392._

- **A fully trained Certified Plan is hidden from the "New certified plan" modal.**
  Nothing is left to plan. The career path tab stays; a tab whose plans are all
  trained shows "All Certified Plans Complete" in its box.
- **The new plan holds only the untrained levels.** This reverses the earlier
  rule that levels the Character already has stay in and show as trained.
  Milestones already reached are dropped with them.
- **Unknown trained levels filter nothing.** When ESI's skill sheet has not been
  read (fresh device, offline, 401), every plan shows and every level goes in.
  An empty map is not proof of an untrained pilot.
- **The plan is still a snapshot.** It does not re-add levels later or follow
  the Certified Plan; the earlier "no link back" rule stands.
- **The modal is titled "New certified plan".** The Skill Plans menu item keeps
  its label.
