# Scope decisions — Build Plan page reads verdict first, on a profit basis

_Recorded 2026-10-24. Amends 20260906-091110 (Industry page reads verdict first)
and supersedes ADR 0006's gross/net toggle and its hero-level Acquisition Verdict._

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
- **Costs & revenue is the working, not a second hero.** A bar of where the
  sale goes and a ledger from the sale down to profit; margin, ISK/hour,
  break-even and market price are not repeated there. ISK to spend, buying
  instead, job time and volume sit under the ledger. The cheapest nearby
  system with a lower cost index is one line inside the job cost breakdown.
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
