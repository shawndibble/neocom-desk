# Scope decisions — Build Plan page reads verdict first, on a profit basis

_Recorded 2026-10-24. Amends 20260906-091110 (Industry page reads verdict first)
and 20260906-072659 (owned units cost 0 ISK, which is now the `free` basis rather
than the default), and supersedes ADR 0006's gross/net toggle and its hero-level
Acquisition Verdict._

- **One verdict, one figure.** The Verdict Hero states a single verdict pill
  (Build, Build — close call, Loses money, Sell your materials instead) and
  Sale Profitability as the one large figure, with margin, ISK/hour and
  break-even beside it. Two pills and a qualifier line competed with the
  figure for the first look; a reader could not tell which number was the
  answer. "Close call" is a profit whose break-even is within 5% of the market
  price (`CLOSE_CALL_HEADROOM_PCT`).
- **Owned materials are counted at sell value by default.** When a plan uses
  stock from the pilot's hangars, the hero's profit is net of what those units
  would fetch (the Use-or-Sell Check folded into the figure), and the line
  under it flips in place to "free" (the plan's own figure). Counting owned
  units as free made a plan that barely beats selling the minerals read as a
  35% margin. Page state, not plan state, like a sort.
- **The Acquisition Verdict moves to Costs & revenue** as "Buying <product>
  instead: +X more". It answers a different question (build to fly), so it is
  still stated, but not as a second headline beside the profit.
- **No Gross/Net toggle on the plan page.** Gross ignores the fees every sale
  pays; the page shows Net only. Rules out re-adding a toggle without a reason
  a pilot would choose Gross on this page.
- **Costs & revenue is the working, not a second hero.** A ledger in divider
  lines (no box inside the panel) from the sale down to profit; margin,
  ISK/hour, break-even and market price are not repeated there. No chart or
  colour swatches: a coloured where-the-sale-goes bar was tried and read as out
  of place against the rest of the page. ISK to spend, buying instead, job time
  and volume sit under the ledger, set apart by a gap and a rule. The cheapest
  nearby system with a lower cost index is one line inside the job cost
  breakdown, with Build there.
- **Setup is one line at the foot of the hero.** Runs moved to the hero's title
  row (with Break Even); the rest reads as one line with Edit setup, which
  opens the unchanged form below the hero.
- **The materials controls are one row.** Build Strategy applies on change
  with an Undo toast (no dialog, so no "…"). Which owned stock counts — scope,
  Corp Assets (its unavailable reason inline) and Use all / Use none — sits
  behind one Owned materials button. The Reactions hint is plain text: it was a
  chip that looked like a toggle and did nothing.
- **Cheaper parts are a line, not a banner.** Two or more bought rows that are
  cheaper to build get one "Build N cheaper parts · save X" link on the To buy
  heading; one row keeps only its own Build instead.
- **What was removed, not folded.** 20260906-091110 promised nothing would be
  removed; this redesign removes two things on purpose. The Gross/Net toggle
  (above). The Use-or-Sell per-material table and its CSV export: each fully
  owned row now says what it sells for in its Total cell, the owned heading
  gives the total, and the ledger carries it as one line, so a second table of
  the same figures earned no place. The plan's time moved, not removed: from
  the Materials header to the hero's title row beside runs, where it shows even
  when prices are unreachable.
- **Have and Price are edited in place on every width.** The value with a faint
  pencil (§6c), the field only while it is being edited; typing a digit on a
  focused value opens the field with it, so Tab-and-type down a column still
  works. Two boxes on every row made the table read as a form. Phone cards read
  as the errand — "Buy 317,000 @ 4 ISK", then "Need · Have" — so no section
  needs a column header, and sorting is one control above the list.
- **Known gap.** The sell-value basis counts owned units the top-level job
  consumes; owned stock eaten inside a sub-build is not yet charged, as the
  Use-or-Sell Check never charged it either.
