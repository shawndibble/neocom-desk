# Scope decisions — Date-only labels and the Production Log day filter follow the Time format

_Recorded 2026-10-22._

- **A date-only label of an instant follows the Time format preference.** An
  order's expiry and listed date, wallet-buy and loss dates, a roster member's
  join date and a system note's updated date are real instants, and the day
  they fall on depends on the clock. They render through `formatDateOnly(date,
timeZone)` with the zone from `useTimeZone()`, like every other timestamp.
  This rules out `toLocaleDateString()` on an instant, which always read the
  host zone. ESI date fields that are already midnight UTC stay fixed-UTC.

- **The Production Log's day filter buckets runs on the same clock the Logged
  column displays.** `filterProductionRunsByDate` takes the zone, so with EVE
  time on, a run shown as 10 March is found by a 10 March range. The range
  inputs are read as days on that clock. This rules out a row that shows one
  day and is filtered under another.
