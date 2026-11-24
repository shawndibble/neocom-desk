# Scope decisions — Open Orders turn-ins: Market hub, Character orders only, outside the work-through (issue #6708)

_Recorded 2026-11-23 · issue #6708._

- **The turn-in's LP is valued at the Market page's hub (`useHubFor('market')`).** Open Orders prices nothing else at a hub (each order reads its own station), and the other Market pages (the order book, Stock) price at that hub. One hub keeps one load per page. Valuing LP at each order's region hub was ruled out: it would load once per region, and LP Value is a store price, not a station price.
- **The turn-in compares against the order's listed price.** "Beats its price" in the issue is read as the raw price, not the price net of sales tax and broker fees. The figure is already an estimate (LP at LP Value), and the badge says "~".
- **Only a Character's orders get turn-ins. The Corporation source gets none.** A corporation's stock belongs to no single Character, and Participate is per Character.
- **`turnInPays` stays out of the work-through queue.** The work-through walks repricing fixes, and "Turn in instead" has no price to copy. The row stays in Watch.
- **A buy order's glyph sits after its price, or after Do this while the Price column is off.** The Price column is off by default, and a glyph only in that column would hide the feature from most pilots. A phone card gets no glyph and no "Turn in instead" button: buttons don't nest, and the card's own tap opens the same Order Detail.
- **The badge detail reads "+~2K each".** It uses the shared `approxIsk` ("~2K"), like the rest of the turn-in surfaces (#6705). The Order Detail line reads "Pays ~2K each over your price (57,990)" for a sell order and "Pays you ~950K per 100 over this bid" for a buy order. Neither line is shown when the turn-in pays no more than the order's price.
- **The Order Detail shows the turn-in for a sell order whose problems include `turnInPays`, even when a real problem wins the column.** A sell order the turn-in does not beat shows nothing.
