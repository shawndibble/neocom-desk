# Scope decisions — Items ISK/unit column: single-type only, on by default beside Qty (issue #5743)

_Recorded 2026-10-31 · issue #5743._

- **ISK/unit is shown only when `lineCount` is exactly 1.** A bundle's price covers several items and is never apportioned to one (decision 20260915-093419); an unstamped `lineCount` means unknown, never single. Those rows, unpriced offers and zero quantities show "–" and sort last.
- **It divides `offerAskingPrice`, the Price column's own figure**, so buyout vs. starting bid and PLEX at market can never disagree between the two columns.
- **On by default, next to Qty**, because Items already shows Qty by default. Users who customised their columns before this shipped keep their stored list and tick it in the column picker.
