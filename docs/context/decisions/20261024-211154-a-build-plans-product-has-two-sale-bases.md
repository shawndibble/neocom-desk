# Scope decisions — A Build Plan's product has two sale bases; the headline stays Sell order (issue #5007)

_Recorded 2026-10-24 · issue #5007._

Extends 20260906-072659 (Build Plan explanations live in one Calculation Breakdown).

- **The headline stays on Sell order.** Sale Profitability, the verdict, Margin, ISK/hour and the break-even price all price the product at the hub's lowest sell. Sell now (the highest buy order, sales tax only, no broker fee) is a secondary row, "Profit if sold now", directly under Profit in Costs & revenue, with an info tooltip. Rules out a toggle for the product's sale basis.
- **One pricing rule for both Sell nows.** The row reuses `ownedStockSale`'s `instant` rule, so it and the owned-materials Sell now cannot disagree. The owned-stock Sell now / Sell order switch stays separate and does not move the product row.
- **Same basis as Profit.** On the sell-value Profit Basis the row also charges the owned materials' forgone sale, so the two rows differ only by the product's sale basis.
- **The breakdown states it too.** The Calculation Breakdown's revenue section works the Sell now figure with the plan's numbers and the top-of-book caveat; no order-book depth is modelled.
- **No buy orders reads as such.** "No buy orders at <hub>" in place of a figure; Profit is unchanged.
- **Stale parts of the ticket.** The panel no longer has a Gross/Net toggle or a "Current market price" row (both already gone), so there is nothing to hide or remove.
