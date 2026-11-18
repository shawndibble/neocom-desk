# Scope decisions — Stock Cost Basis scope on the Assets page (issue #6381)

_Recorded 2026-11-18 · issue #6381._

- **One FIFO, generalised.** `walletCostBasis` takes Production Runs as extra lots (`productionLots`); `stockCostBasis` wraps it with the held quantity as the pool. Open sell orders keep calling it unchanged. A second FIFO is ruled out.
- **A row shows its stack, the unit cost is per type.** The basis is computed on the Character's holdings of the type across every location; each row shows its own stack's total (unit cost times that row's quantity) and the unit cost.
- **Only the active Character, browse rows only.** The basis is withheld while the list spans Characters (an all-Characters search), and search-result rows carry no cost, so one Character's history is never applied to another's units.
- **Needs the wallet permission.** Without it sells are invisible, so even a Production-Run-only history cannot prove coverage; the page shows no cost.
- **A gap in the transaction archive's coverage distrusts older lots.** A lot older than the end of an internal gap is not trusted, because a missed sell could have consumed an older lot. The open stretch since the last fetch is ignored.
