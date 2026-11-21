# Scope decisions — Corp moon pages' times follow the Time format clock

_Recorded 2026-11-20._

- **Every instant on the corp moon pages (`src/features/corp/moons`) renders on
  the Time format's clock.** Chunk arrivals, fractures, pops, payments, audit
  rows, statement issue and mail times, invites, removals, stale-since dates
  and the next-read time used to be hard-wired to UTC by `moonsFormat.ts`, so a
  pilot with `local` selected saw them in EVE time anyway. Instants now go
  through `wallClock` / `atDate` / `atDateWithYear` / `shortDateTime` /
  `dateTimeAt` / `clockAt`, which take the zone from `useTimeZone()`. The
  "UTC" mark is shown only when the clock is EVE time. This is the same rule
  as `20261022-103947-date-only-labels-and-the-production-log-day.md`.

- **A ledger day stays an EVE day.** The book's granularity is the EVE (UTC)
  date (`20260905-170644-moon-mining-tax-ledger.md`): mining days, payout
  dates, rate effective dates, coverage, paid-through and statement periods
  are `YYYY-MM-DD` days with no instant behind them, and keep `shortDate` /
  `dateWithYear`. Re-reading one in a local zone would move it to a day the
  ledger does not have.

- **The player's Mining Tax page follows the same split.** Its mining days and
  the tax owed on them are EVE days and stay so; the payments, donations and
  transfers it shows with a time (`eveTimeLabel` on screen before) are
  instants and now use `dateTimeAt`. `eveTimeLabel` stays for mail text and
  the public Remove now page.

- **Accepted edges.** A payment an officer types in by day is stored at noon
  EVE time (`paidAtFor`), so in UTC+12 and beyond its local date is the next
  day; it is still shown as the instant it is stored as. A statement's due
  date on screen is the overdue instant on the viewer's clock, so it can sit a
  day off the EVE-day due date the mail states.

- **Left on EVE time, on purpose.** The public Verify page and the statement
  body (`src/features/corpTaxBook`) mirror the mailed statement, which is
  written in EVE time for a reader whose setting is unknown. Anything sent in
  EVE mail stays UTC. The Net Worth chart buckets by EVE day, so its day labels
  stay UTC. The Wallet Journal's "history since" line now follows the clock,
  like the journal rows under it, and so does the Journal's "since" range label.
