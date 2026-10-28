# Scope decisions — Improve no longer counts owned stock

_Recorded 2026-10-27. Supersedes `20261025-092934-improve-a-buy-list-that-subtracts-owned-items`._

- **Improve prices every swap and the fit's total at the Trade Hub's market price; it does not subtract what the Character owns.** The "Count what I own at" switch, its place picker, the "You own N of M" cost lines and the still-to-buy budget are removed. The summary's total cost and its change are then the same figures the Price section shows, so the stats column's Price can always follow the previewed rows. Rules out a still-to-buy comparison against inventory; the remembered `fittingsImproveCountOwned` setting is simply unread.
