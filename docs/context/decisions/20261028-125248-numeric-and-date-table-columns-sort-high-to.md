# Scope decisions — Numeric and date table columns sort high to low on first click (issue #5394)

_Recorded 2026-10-28 · issue #5394._

- **A first click on an inactive column sorts numbers and dates high to low, text A-Z.** The rule lives in `DataTable` (`firstSortDirection`), typed by the column's first non-missing value so it never flips with the loaded rows. Clicking the active column still flips; explicit and URL sorts are untouched.
- **A column opts out with `sortFirst: 'asc'`** when its best row is the lowest: jumps and distance, ETA / time until something ends, rank / position / tier, and cheapest-first ask prices. The market order book Price column stays default (shared by sell and buy sides, whose own initial sorts are already right).
- **The phone picker and hand-rolled mobile lists follow the same rule**, so header and picker never disagree.
