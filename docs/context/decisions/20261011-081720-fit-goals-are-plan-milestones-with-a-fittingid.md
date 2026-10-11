# Scope decisions — Fit goals are Plan Milestones with a fittingId (issue #3564)

_Recorded 2026-10-11 · issue #3564._

- **A fit goal is a Plan Milestone with an optional `fittingId`, not a new kind of goal.** It keeps the (skillTypeID, level) anchor, so the schedule, the Next milestone chip, orphaning and sync work unchanged. The plan editor re-anchors it to the latest step the Fitting needs whenever the Fitting, the plan order or training changes, and names it after the Fitting. Rules out a second goal type with its own storage and status code.
- **Two fit goals may share an anchor; one row mark shows.** Two Fittings can finish on the same skill, so fit goals dedupe by Fitting, not by anchor. The row shows one mark; the readout lists all.
- **A Fitting the Character can already fly offers no goal.** There is no step to anchor to, so the picker shows "Flyable now" and the row is not selectable.
- **A deleted Fitting orphans its goal.** Shown with the existing remove action, like an entry removed from the plan.
- **Requirements load only for tracked or listed Fittings.** Each type is one ESI round trip, so Fittings load on picker open or while a goal tracks them.
