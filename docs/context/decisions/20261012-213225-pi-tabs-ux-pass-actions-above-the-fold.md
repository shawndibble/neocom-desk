# Scope decisions — PI tabs UX pass: actions above the fold, fewer bars

_Recorded 2026-10-12._

A UX pass over Plan, Map and Colonies, rendered with seeded colonies and
checked against Mobbin references (recommendation lists, monitor tables,
graph-with-detail layouts). Each item departs from `docs/design/pi-tabs/ref/`
on purpose; a mockup comparison should not flag it.

- **Plan: the question picker is one row.** Three one-line options and one dim
  line (the opening reason, then the picked option's hint). The art and the
  per-option hints went: they pushed every answer down ~75px.
- **Plan, Make more: the summary leads, Quick wins next.** Order is "What you
  could add" (heroes, before/after chips, What matters more) → Quick wins →
  Rebuild → Your planets (strip, haul-between opt-in, slot nudge) → Bigger
  chains → Hauling. The to-do list now starts above the fold at
  1440×900; the planet strip moved below it.
- **Plan, Rebuild: planets that keep their setup fold.** Changed rows stay
  visible; "N planets with no rebuild" (kept or unmeasurable) is a closed `Disclosure`, opened by a
  `#plan-<slug>` link to a card inside it. The As-is tag went (the group says it).
- **Plan: a rebuild's in-game steps open inside its row.** The "What to do
  in-game" panel at the foot of the page is gone; each changed rebuild row has
  an "In-game steps" toggle (count, minutes, how many are ticked) that opens
  the steps right under it, and starts open once one is ticked. Measured on a
  6-colony account, the old panel began ~1.5 screens down, below Your planets
  and Hauling, far from the rebuild it explained.
- **Map: one how-to line, a legend, no "Got it".** The dismissible hint row
  merged into the what-if line's idle text. The Planet map header carries a
  legend for ▲ ≈ ▼, the figure and the Est. chip (hidden while hub prices are
  down: no tile carries a figure then). Wires off a traced chain dim further. Empty gap slots lost their
  fill; an empty tier column says "None from your ticked planets".
- **Colonies: column labels once, in a list header.** From `lg` the Extractors
  and Storage labels and their help sit above the rows; per row they stay
  for screen readers and below `lg`, where a row is a stacked card (a
  five-column row has no room on a tablet).
- **Colonies: the row draws a bar only when it means something.** No CPU/Power
  bars on the row (they live in the opened row's Command center); no storage
  bar unless storage fills before the haul (a full green bar read as "storage
  full"); no bar for "No extractors".
- **Colonies: Today's check drops the planet strip.** It repeated the sorted
  list directly below. "What we can't see" moved from above the list to its
  footnote.
