# Scope decisions — Severity ladder: yellow under 24h, red under 1h, corp logistics keep the long lead

_Recorded 2026-11-04._

- **The default ladder is `warning` inside 24h, `critical` inside 1h or overdue, else `clear`.**
  The old 3-day amber and 7-day "watch" tiers made cards look busy days before
  anything could or should be done. Applies to the character's own clocks
  (Coming Up and its deadline).
- **`severityForRemaining` takes a `profile`; `logistics` keeps the old 7d / 3d / 24h
  lead.** Corp work that needs planning and hauling (the corp ops board's structure
  fuel and timers, sovereignty run-outs) starts warning earlier. A _source_ picks its
  profile once; nothing inside the ladder branches on what kind of clock an item is,
  so "one ladder, called by every source" still holds. Supersedes the single-profile
  wording in the corp ops board and Calendar decisions.
- **An unreadable clock (`null`) stays `warning`, and an overdue one stays `critical`.**
- **The Accelerator keeps its own 2-hour rule** (20261104-150222).
