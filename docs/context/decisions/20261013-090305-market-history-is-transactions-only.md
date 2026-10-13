# Scope decisions — Market History is Transactions only (issue #3692)

_Recorded 2026-10-13 · issue #3692._

- **Market's History tab shows wallet transactions only; the Ended orders view
  is gone.** This **supersedes** the "two views stay distinct tables" and
  "picked from a select in the table's own header" points of
  `20260904-201711-transactions-folds-under-history.md`, and the
  `history/transactions` tab-id point of
  `20260922-231750-markets-history-transactions-subtab-is-a-tab-id.md`. Those
  decided how to show both views, never whether both earn a place. A filled
  order appears in both, and Transactions says more about it (quantity, unit
  price, total, margin, Sold / Bought / Net). All Ended orders added was the
  orders that closed with little or nothing sold — not worth a second table
  plus a picker and its explanatory tooltip. Transactions is the one that
  stays: it is the only place the character's fills are listed.
- **`/market/history/transactions` redirects to `/market/history`, query kept.**
  Through `PAGE_LEGACY_LOCATIONS`, like the Hauling and LP Store moves, so old
  bookmarks and `?highlight=` alert links still pulse their row. The
  `marketOrderFilled` route and Wallet's links now name `/market/history`
  directly.
- **Order history is still fetched.** `loadOrderHistory` and its boot prefetch
  stay: order cost basis, fill-time settling, sale linking and notification
  polling read it. Only its table went. This rules out reading the removal as
  dropping the `read_character_orders` history call.
