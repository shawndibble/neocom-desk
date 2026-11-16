# Scope decisions — Corp wallet transactions format ISK and wrap on phones like the personal panel

_Recorded 2026-11-16._

- **The corp wallet's Transactions table draws its six shared columns exactly as Market History's personal table does** (`walletTransactionBaseColumns`): market ISK precision (`formatMarketIsk` — cents below 10,000 ISK, whole ISK from there up, where it used to print two decimals always), and on a phone the date stacked over the time and the item name wrapping to two lines instead of truncating. A manager reconciling a division against a Character's wallet reads one format. What stays different on purpose: each panel's loaders and state owner, the personal panel's Character scope, station grouping, margin and Location columns, the corp panel's per-division export name and its "Filter to this item" row menu.
