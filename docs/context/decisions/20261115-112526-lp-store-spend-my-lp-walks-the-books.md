# Scope decisions — LP Store Spend my LP walks the books on click (issue #6199)

_Recorded 2026-11-15 · issue #6199._

Amends 20261030-180139 ("only Offer Detail's How many walks the books").

- **Spend my LP is the second surface that walks the books, and only when its button is clicked.** Nothing is fetched on page load: a plan reads the live book of every required item and output of the store's top 10 offers (one redemption's ISK/LP, current filters), roughly 15–30 book reads. The table's one-redemption figures are unchanged.
- **One shared, consumable book state across the whole plan.** Each step is the next single redemption with the best marginal ISK/LP; an output sold by two offers fills one buy book and a required item two offers need comes off one sell book. Each type sells (or is bought) as one stack, so a step is priced as the walk with it minus the walk without it, with the existing walkers (`walkSellIntoBuys`, `walkSellBook`). Owned turn-ins (every account Character's assets) are used before buying, at zero cost.
- **Instant basis only, whatever the page's Price basis.** The candidates are picked by the table's ISK/LP (on the page's basis), then re-priced on Sell now; there is no order-basis plan.
- **The floor is the pilot's LP Value.** The plan stops when the next step's marginal ISK/LP is under the pilot's typed LP Value, else this store's market rate, else (no rate) 70% of the plan's best step. Below the LP Value, keeping the LP is worth more than redeeming it. No new %-threshold setting.
- **Purchases are capped at a known wallet.** With the active Character's wallet balance known, the plan stops before its purchases (ISK cost, required items bought, build cost) would pass it, and says so. With it unknown, there is no cap and the plan says that too.
- **Blueprint offers are included.** Build cost scales linearly with N (as 20261030-180139); the product's buy book is part of the shared state like any other output.
- **Unpriced, never free.** A required item the sell book can't fill, or an output whose book failed to load, drops that offer from the plan; the plan states how many offers were left out.
- **The stop is stated:** LP exhausted, nothing profitable, under the floor (naming which floor and the offer), or the wallet.
