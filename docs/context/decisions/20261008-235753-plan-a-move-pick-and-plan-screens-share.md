# Scope decisions — Plan a move: pick and plan screens share one rail

_Recorded 2026-10-08._

- **Plan a move shows a pickup as a rail stop on both screens.** The picker and the plan draw the same rail (Character heading, one stop per pickup location, ending at the destination), and each location keeps one hue from picker to plan. The rail is a drawing of shape, not a sequence: the engine does not order pickups, so the dots are not numbered.
- **Stacks at the destination cannot be picked.** Choosing a destination disables every stack already there, shows it unticked and ignores it in the footer and the plan (ticks are kept, so changing the destination back restores them) ("At destination"), so the "Nothing to move" result is no longer reachable from the picker. The picker footer shows live stacks, ships and packaged volume; trips stay on the plan screen because hauler capacities load only when the plan is requested.
- **The plan has no "Compare haulers" disclosure for short lists.** The suggested hauler and up to three alternatives sit inline; "All haulers" appears only when more exist.
