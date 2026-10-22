# Scope decisions — Skills planner dates follow the Time format clock, together

_Recorded 2026-10-22._

- **Every Skills planner date moves to the Time format clock in one change.**
  `formatLocalDate` takes an optional zone (`'UTC'` from `useTimeZone()`,
  omitted for the host zone), so plan header, plan list and card, queue
  strip/rows/lead, entry marks and done-by dates, attributes and remap
  cooldowns, fit-goal and optimize confirmations all agree on one clock. This
  keeps #207's rule (two surfaces showing the same instant never disagree by a
  day) and rules out converting some surfaces first. Its other callers
  (notifications, industry production log, mining tax) pass no zone and are
  unchanged.

- **The queue's period grouping moves with the dates.** `buildQueueView` takes
  the zone: "this week", "this month" and the per-month groups are filed by the
  calendar date on the chosen clock (whole-day arithmetic, so DST cannot shift a
  boundary), and the month heading is named from that same date. The week's
  first day is still the Calendar's device-local week-start setting; only the
  day it is counted on changes. This rules out a UTC date label sitting under a
  local-month heading.

- **The saved name of a plan made by "Optimize queue" stays on the host zone.**
  It is a persisted identifier, not a display of an instant; re-dating it when
  the preference flips is not possible, and a stored name that changed with a
  preference would break duplicate-name checks.
