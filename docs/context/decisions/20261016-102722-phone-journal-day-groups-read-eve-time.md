# Scope decisions — Phone journal day groups read EVE time (issue #3915)

_Recorded 2026-10-16 · issue #3915._

- **The phone Journal's day groups are EVE (UTC) days.** The spec says so,
  and EVE's day rolls at midnight UTC, so a day total matches what
  other players and the client quote. This rules out local-day
  groups on the Journal.
- **The time on a grouped line is UTC too.** A line shown in local time under a
  UTC day header could sit under a day its own time contradicts. Flat lists
  (Amount or Type sort, beside-panel cards) keep the time-format preference.
- **The header says so.** "Thu 15 Oct · EVE time", so a reader whose time
  setting is local sees why the clock differs. A third exclusion to
  `lib/timeFormat.ts` beside the Calendar grids and Industry's Ends column.
