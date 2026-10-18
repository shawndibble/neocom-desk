# Scope decisions — Appraisal net figures follow Price Percent

_Recorded 2026-10-18._

- **Selling now and Listing are priced at the appraisal's own Price Percent,
  like the Buy and Sell totals beside them.** This reverses the first bullet of
  `20260924-010954-appraisal-shows-net-of-fees-totals-at-100.md`, which kept the
  two net chips at 100% of market. A pilot who sets 90% is quoting at 90%, and
  a net that ignores it sat beside gross figures that did not, which needed a
  footnote to explain. `appraisalNet` now scales each side's price by the
  percent before tax and the broker fee, and the "always at 100% market" note
  and tooltip sentences are gone.
- **The Undercut column still shows the real order's undercut price.** It is a
  price to type into EVE's price field, so it is not scaled; the Listing chip
  at a Price Percent other than 100 is a figure for the scaled price, not the
  column's price summed.
