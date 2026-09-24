# Scope decisions — Skill Plan waits only on the live queue ahead of its first shared level

_Recorded 2026-09-24._

- **The plan waits only on the part of the in-game queue ahead of the first
  level the plan also lists.** Before, every queued level counted as trained
  by queue end and the plan started there, so a plan copied from the in-game
  queue read 0m, "Skills 0" and "Nothing left to train". A plan sharing most
  of the queue also double-counted: the shared levels' time sat inside the
  queue's end date and was costed again as plan steps. Queue levels after the
  first shared one are neither waited on nor counted as trained: the plan
  doesn't list them, so it can't place them. A plan with no shared levels
  behaves as before. See `projectQueueEnd` in `src/features/skills/queueStatus.ts`.
- **Unallocated SP never shortens the plan.** Pilots bank it for unplanned
  changes, so it only feeds the Skill injectors panel, never the schedule.
- **The entry list has no scroller of its own.** Its viewport-measured cap
  (#237) put a second scrollbar beside a sidebar taller than the viewport.
  The page scrolls, and the summary strip stays `lg:sticky`.
- **A Booster row's Starts field shows only on the second and later rows, or
  once a start is set.** A start only matters for an accelerator queued
  behind another; the first one is "already running".
