# Scope decisions — Market-wide scan prices troll sell orders at the average, and can hide rarely sold products

_Recorded 2026-09-29._

- **A hub sell price more than 3× CCP's average traded price is a troll order, and the product is priced at the average instead.** A thin item (special editions, officer drops) can have nothing listed below a joke price; ranking it there put 78.9T ISK/hour at the top of the scan. The average is ESI's `/markets/prices` `average_price`, already loaded for the job fee's EIV. 3× leaves room for a hub's normal premium over the galaxy-wide average. The row shows a marker saying it was priced at the average.

- **The check runs before the liquidity pass.** Sell depth is price × units listed, so a troll price inflated depth too and let the product take a top-N slot and read as "Deep". Priced at the average, it can do neither.

- **A product with no average price has never traded and isn't ranked.** Any price for it would be a guess. If ESI's price list can't be read at all, the check is skipped rather than emptying the scan.

- **"Rarely sold" means fewer than 5 units a day, summed over the five trade-hub regions, averaged over 30 days.** ESI's market history is per region, and asking all ~65 regions for every ranked product is thousands of requests a scan. The Forge, Domain, Sinq Laison, Heimatar and Metropolis carry nearly all player trade. Days with no trades count as zero.

- **The rarely-sold filter is off by default and fetches only while on.** Like every other filter it starts off, so a first scan costs no history requests. Each region's history is cached until ESI's daily rollover. It narrows the ranked rows, like the build-cost cap, rather than re-scanning. A product whose history can't be read stays visible: an under-count would hide something that does sell.
