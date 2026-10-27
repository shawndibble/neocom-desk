# Scope decisions — Time format is a preference, with two exclusions

_Recorded 2026-09-07._

- **Which clock timestamps render on is the pilot's choice, device-local,
  defaulting to their own.** The app disagreed with itself and offered no way
  to settle it: `lib/eveTime.ts` renders UTC for exactly one column, while the
  `lib/timestamp.ts` family renders local across seventeen files.
  `eveTime.ts`'s own reason — "a job's end shown in the viewer's own zone would
  be the one number on the page they cannot read back to the game client" — is
  not specific to industry jobs; every timer in EVE is quoted in UTC by other
  players, killboards and the client. Default `'local'`, so nothing moves for
  an existing pilot. This rules out picking one clock app-wide, in either
  direction.

- **The zone is threaded through arguments, not read inside the formatters.**
  `formatTimestamp(date, timeZone?)` stays a pure function of its arguments,
  and a component that renders a timestamp subscribes to the preference — it
  would otherwise not re-render when the pilot changes it. This rules out a
  module-level global read by the formatters, which would render correctly only
  until something else happened to cause a repaint.

- **The Calendar grids are excluded.** `lib/calendarGrid.ts` buckets events
  into _local-day_ cells, so converting only the rendered string would file a
  23:00-local event in today's cell under tomorrow's UTC hour. Converting them
  means moving the bucketing too. This rules out a silent half-conversion; it
  does not rule out doing it properly later.

- **Industry's Active Jobs "Ends" column is excluded and stays on EVE time
  unconditionally.** That column exists to be read back into the game client.
  Making it follow a preference that defaults to `'local'` would change today's
  behaviour rather than preserve it, which every other control in this batch
  was careful not to do. The consequence is worth naming: with the preference
  on `'local'` the app still holds two clocks, exactly as it did before — the
  difference is that a pilot who minds can now settle it.
