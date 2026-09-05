# Scope decisions (round 24) — Variations attribute compare

_Recorded 2026-09-02._

- **"Compare" now names two different things in the Market route**, and this
  is accepted rather than renamed (issue #146). Round 6/8's **Compare** is
  the Quickbar price comparison — a `Compare (N)` bottom drawer over an
  explicitly built set, comparing _prices across hubs_. This round's Compare
  is a button in the Variations section header opening a modal that compares
  _dogma attributes across an implicit set_ (whatever the Variations table is
  currently showing). Both match what the EVE client calls Compare in the
  same two places, so renaming either to disambiguate would cost more
  familiarity than the collision costs. They are distinguishable in context:
  one is a persistent drawer with a count, the other a modal opened from a
  section header.
- **The compared set is exactly the Variations table's rows** — the same
  capped array the table renders (round 19's `VARIATIONS_LIMIT`), not the
  uncapped total, and not including the selected item itself, which is not a
  row in that table either.
- **Price is a row, not a mode.** Estimated Price (best sell) is the first
  row under a synthetic "Worth" group rather than a separate tab or toggle,
  so one matrix answers both "what does it do" and "what does it cost". It
  reuses the order-book summaries the route already fetched for the table.
- **No relative best/worst coloring.** Deferred: it needs a "higher is
  better" classification per attribute that the SDE does not carry, and
  guessing it would be wrong for resistances, signature radius, and every
  other lower-is-better attribute.
- **Flavor text is excluded** from the matrix — multi-paragraph prose does
  not tabulate; it stays reachable via Show Info / `ItemDetailModal`.
