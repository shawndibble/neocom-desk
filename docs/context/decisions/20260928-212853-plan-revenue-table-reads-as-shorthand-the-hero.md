# Scope decisions — Plan revenue table reads as shorthand; the hero carries the product's More actions

_Recorded 2026-09-28._

- **The plan's revenue table shows unit price and Total as shorthand.** It is the
  one exception to the Costs & Revenue panel's full-precision ledger (see
  `20260912-171626-shorthand-isk-on-scanning-surfaces-full-precision-on.md`):
  the product line is a glance at what the run sells for, and the ledger rows
  beneath it (sales tax, broker fee, net revenue) keep every digit. The exact
  figure stays one hover or long-press away via `IskAmount`. The column reads
  "Total", not "Line total" — there is only ever one line.
- **The revenue row has no visible "More actions" button of its own.** The
  product's button lives in the plan hero's top-right corner, so a second one
  on the revenue row duplicated it on the same page. The row keeps its
  right-click / long-press item menu. This narrows
  `20260924-151112-industry-rows-get-a-focusable-more-actions-button.md`: a
  row whose item already has a visible button elsewhere on the page doesn't
  need its own.
