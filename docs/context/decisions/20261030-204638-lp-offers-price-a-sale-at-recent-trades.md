# Scope decisions — LP offers price a sale at recent trades when one order lists far above them

_Recorded 2026-10-30. Follows the LP Store landing (#5707), where a lone 1B ISK Jita sell order on a ~17M ISK implant ranked it at 81,000 ISK/LP._

- **An LP offer's revenue is checked against the item's recent trades.** The **Traded Price Ceiling** is the higher of the hub region's volume-weighted median sale (last 7 days) and the latest day's top trade, from the daily `hauling-demand` object. A listed price more than 1.25× that ceiling is not the market's price: the sale is counted at the ceiling instead. Within 1.25× the listing stands, so a price rising today (latest day's band) is never cut back to last week's median.
- **Both bases.** The sell basis checks the lowest sell; the buy basis checks the highest buy too, since a buy order far above every trade is margin-trading bait.
- **Revenue only.** Turn-ins and materials stay at their listed prices: capping a cost would flatter ISK/LP.
- **One seam.** `computeLoyaltyOfferRows` takes the demand, so the store modal, the landing and the market **LP Value** (Build Plans, Appraisal) all count the same sale.
- **Shown, not hidden.** A capped offer's detail says it is priced at recent trades and names the listing.
- **No data, no check.** An item with no trades in the window, or a demand object that is missing or stale, keeps its listed price, as before.
- **Rules out:** hiding capped offers, a per-pilot tolerance setting, and checking thin but genuine markets (a product with a few real trades near its listing keeps its large ISK/LP).
