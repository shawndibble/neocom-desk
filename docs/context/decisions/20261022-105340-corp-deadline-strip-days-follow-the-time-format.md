# Scope decisions — Corp deadline strip days follow the Time format clock

_Recorded 2026-10-22._

- **The Corp Deadline Strip (Overview `corpDeadlines` widget) cuts and labels
  its days on the Time format's clock.** With `eve` selected a bar is a UTC
  day and its label (`formatDateOnly`) is read in UTC; with `local` nothing
  moves. Same reasoning as the Calendar
  (`20261022-101910-calendar-days-follow-the-time-format-clock.md`): the day
  bucket and the day label must agree. `deadlinesByDay` takes an optional
  `zone`, and the Overview's view builders receive it as `BuildContext.zone`
  from `useTimeZone()`. Bars are matched by `dayStart`/`nextDay`, not by
  dividing by 24 hours, which was DST-fragile on local days.

- **Left alone, on purpose.** The "due soon" figure is a rolling 24-hour
  window, not a calendar day. The Corp people widgets already bucket and label
  by UTC month. The payee-change mail and Corp Tax Book code never bucket by
  local day. The countdown wording ("in 3h") has no day boundary at all.
