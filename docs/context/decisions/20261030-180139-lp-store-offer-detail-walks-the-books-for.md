# Scope decisions — LP Store Offer Detail walks the books for N redemptions (issue #5659)

_Recorded 2026-10-30 · issue #5659._

- **Only Offer Detail's "How many" box walks the books; the table stays at one redemption.** At N = 1 nothing is fetched and the row's figures show unchanged. This is the one LP Store surface that reads reachable buy orders (#5653 left the table on the station-only best bid).
- **N redemptions are one stack, one listing.** Fees are `loyaltyOfferProfit`'s with N-scaled inputs: sales tax on revenue, one broker fee (100 ISK minimum once) on the list-order basis.
- **A required item the sell book cannot fill leaves the cost, and so ISK/LP at N, unpriced** and states the unfilled units; the redemption cannot be bought out. Output units the buy book cannot take earn nothing and are stated.
- **A blueprint offer's build cost scales linearly with N** (materials stay at top of book); only its required items and product are walked.
