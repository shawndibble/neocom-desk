# Scope decisions — Mining Yield: ISK/hr basis is calendar time, not active mining time (issue #671)

_Recorded 2026-09-09 · issue #671._

- **ISK/hr is total value divided by wall-clock hours across the covered date
  range (earliest to latest date with a mining entry, inclusive, at 24h/day)
  — not active mining time.** ESI's personal mining ledger has no intra-day
  timestamp (CONTEXT.md's Mining Ledger Entry), so there is no data to
  measure an actual mining session's length from. The ticket's acceptance
  criteria ask for "ISK/hr" without defining a basis, and no human was in the
  loop to ask. Inventing a fixed "hours played per mining day" constant would
  present a guess as a measurement, which this app's pricing/valuation
  conventions elsewhere (partial-pricing badges, `pricedAll`, `unpriced`
  sets) consistently refuse to do. Dividing by the full calendar span instead
  needs no invented constant — it is a defined, reproducible rate ("value per
  hour of the window this covers"), not a claim about time spent at the
  keyboard.
  - Rules out: any UI copy or tooltip presenting this figure as "hourly
    earnings while mining" — it must be labelled with its basis (e.g. "ISK/hr
    (avg. over date range)") so a pilot does not read it as a live yield
    rate. See `src/engine/miningTax/yieldRate.ts`'s `iskPerCalendarHour`.
  - Rules out: adding session/interruption detection to make this more
    "accurate" — already out of scope per the ticket, and the ledger's
    granularity makes it unattainable regardless.
