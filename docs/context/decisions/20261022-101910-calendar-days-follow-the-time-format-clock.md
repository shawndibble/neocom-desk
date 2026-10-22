# Scope decisions — Calendar days follow the Time format clock

_Recorded 2026-10-22. Supersedes the "Calendar grids are excluded" bullet of
`20260907-102126-time-format-is-a-preference-with-two-exclusions.md`._

- **The Calendar cuts its days on the Time format's clock.** With `eve`
  selected, a day is a UTC day: the Map and Day Ticker cells, their counts, the
  Coming Up rail's day groups and headings, "Today", the selected-day export
  filter and the times in rows and the event modal all agree. With `local` they
  are the pilot's own days, as before. The exclusion existed to forbid a silent
  half-conversion (a string in UTC under a cell bucketed in local time); moving
  the bucketing with the string removes the reason for it.

- **A grid cell is a local-midnight `Date` that carries the day's calendar
  fields; the clock only decides which instants land in it** (`cellDayStart`,
  `dayStart` in `engine/localDay.ts`). This rules out rebuilding
  `lib/calendarGrid.ts` on a zone argument: the weekday and month arithmetic
  there is about calendar fields and is the same on both clocks.

- **Switching the clock clears a selected day.** A selected day is a midnight
  on one clock and names no day on the other.

- **Calendar event retention stays on local days.** `calendarRetention.ts`
  decides how long a past event is kept, a device-side housekeeping rule, not
  something the pilot reads; the worst a clock mismatch does is keep an event up
  to a day longer or shorter.
