# Scope decisions (round 54) — Transactions folds under History

_Recorded 2026-09-04._

- **The Market page's top tabs are Market, Open, History.** Transactions is no
  longer a fourth top-level tab: it is one of History's two views, beside
  Orders. Both are the character's past, both key on item and side, and they
  answer the same question from either end — which orders ended, and which
  fills paid out. Four peers implied four unrelated things; three peers plus a
  pair says what is actually true. The round 48 consolidation stands, this
  only regroups its result.
- **The two views stay distinct tables, not a merged one.** A row means
  something different in each: a History row is one closed order (cancelled or
  expired, with its remaining volume), a Transactions row is one fill (ISK per
  unit, quantity, counterparty). One order can produce many fills, and a
  cancelled order produces none — merging the rows would leave half the
  columns empty on every line. They also come from different ESI scopes
  (`read_character_orders` vs `read_character_wallet`) and different
  pagination (all pages vs the last five), so a single loader would fail as a
  unit where two fail independently.
- **The view is picked from a select in the table's own header, not a second
  row of tabs.** Tabs under tabs read as a hierarchy that isn't there, and
  these are two readings of one past rather than two places to be. The select
  carries an `InfoTooltip` beside it, because "Orders" and "Transactions"
  sound interchangeable until you have hit the difference: an order is what
  you asked for, a transaction is what actually changed hands.
- **`?section=history` and `?section=transactions` are unchanged.** The views
  keep their own `section` values rather than moving behind a nested param, so
  every existing link still lands where it did, and each view keeps its own
  `useRouteSnapshot` — opening one never fetches the other, which is the round
  48 rule this inherits. Re-clicking the History tab while inside it is a
  no-op rather than a reset to the Orders view.
