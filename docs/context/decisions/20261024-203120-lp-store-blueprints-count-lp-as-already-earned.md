# Scope decisions — LP Store blueprints count LP as already earned

_Recorded 2026-10-24._

- **A blueprint redeemed from an LP Store is priced at the store's ISK cost plus the turn-ins still to buy, with the LP free, unless the pilot has set their own LP Value.** A builder redeeming a copy spends LP they already earned. Pricing it at the store's market ISK/LP turned a 0-ISK Drake Navy Issue copy into an 809.7M blueprint and sank the plan's profit. This applies to the Blueprint Acquisition modal, automatic tier selection, an LP Store "Plan in Industry" seed and BPC Sourcing's LP rows (`blueprintLpRate`). It reverses the earlier "LP is never free" rule for blueprints only. Implants and the LP Store page still price LP at the market rate when no LP Value is set. A pilot who wants LP charged types a rate, and that rate still wins.
- **A computed blueprint price is whole ISK.** An ISK/LP rate carries a long fraction, and the picked price is written into the plan's price box unchanged.
