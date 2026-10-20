# Scope decisions — Appraisal sales tax columns tax the percent-scaled sell total

- The Appraisal table's opt-in **Sales tax** and **Sell after tax** columns
  are off by default and charge the Accounting-reduced sales tax on the row's
  **Sell total** — the same Price-Percent-scaled figure shown in the column
  beside them, so each row reads across consistently. This differs on purpose
  from the net-of-fees chips
  (`20260924-010954-appraisal-shows-net-of-fees-totals-at-100.md`), which are
  priced at 100% of market: a chip is a summary of what the pile is worth, a
  column is arithmetic on the number on screen.
- Sales tax only: no broker fee (it depends on listing and standings), no
  one-tick undercut.
- Like the net chips, the columns exist only once the active Character's
  Accounting level has resolved; never off an untrained placeholder.
- Not added to the CSV export or the share view (no Character there).
