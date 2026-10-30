# Scope decisions — Appraisal Sell after fees replaces Sell after tax

- The opt-in **Sell after tax** column is gone. **Sell after fees** replaces
  it: **Sell total** less sales tax less broker fee. Supersedes the "sales tax
  only, no broker fee" line in
  `20261019-225152-appraisal-sales-tax-columns-tax-the-percent-scaled.md`.
- A separate opt-in **Broker fee** column sits between **Sales tax** and
  **Sell after fees**. All three are off by default.
- The broker fee is charged on the row's Price-Percent-scaled **Sell total**
  as one sell order (100 ISK minimum), at the Character's Broker Relations and
  hub standings. No undercut, matching the Sales tax column.
- Columns need the Accounting and Broker Relations levels resolved; never off
  an untrained placeholder. Not in the CSV export or the share view.
- A saved column pick of `sellAfterTax` drops out; the picker is device-local.
