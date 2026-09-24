# Scope decisions — Market labels name one thing each: Order Book, Ended orders, Corp Transactions (issue #1424)

_Recorded 2026-09-24 · issue #1424._

- **Market's item sub-tabs read "Order Book" and "Price History"; the History picker's ended-orders option reads "Ended orders"; Wallet's corp-only tab reads "Corp Transactions".** Fixes label collisions across nesting levels (Market containing "Market Data", "History" meaning two different things, "Orders" meaning open orders on one tab and ended orders on another). No id, param, or path changed — only display strings. Narrows, does not reverse, round 54 (`20260904-201711`) and `20260922-231750`: Transactions stays folded under History's view picker rather than promoted to a top tab, since the bar already overflows at 390px (`20260907-073634`). The item chart tab keeps "Price History" — it is the CONTEXT.md glossary term and "Price" already distinguishes it from the top History tab.
