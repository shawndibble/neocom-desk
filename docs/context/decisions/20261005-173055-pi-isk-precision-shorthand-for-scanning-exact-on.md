# Scope decisions — PI ISK precision: shorthand for scanning, exact on comparisons and prices

_Recorded 2026-10-05._

- **PI ISK figures are price-based estimates: shorthand for scanning.**
  Headlines, chips, tiles and ranked lists on the Colonies and Map tabs show
  shorthand (`2.5M`). A figure the reader may need exactly renders as
  `IskAmount` (exact on hover, focus and for screen readers), never as bare
  `formatIskCompact` text.
- **Where a component cannot go, the exact figure rides on the same element.**
  A button label or a tile (a focusable `IskAmount` inside a button is nested
  interactive) keeps shorthand text plus a tooltip and visually hidden exact
  text. The Map's `figureSentence` (tooltip, accessible name, phone row) now
  carries whole ISK instead of shorthand. Rows that open on tap provide
  `RowTappableContext` so a tap on a figure opens the row.
- **Comparisons and prices keep more digits.** Two shorthand figures a reader
  compares (from -> to, A vs B) that would read equal show a computed delta or
  more digits; per-unit prices and corp buyback keep full precision. The
  Colonies and Map tabs show gains (already deltas), not from/to pairs.
