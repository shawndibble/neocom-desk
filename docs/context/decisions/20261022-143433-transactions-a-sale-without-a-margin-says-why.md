# Scope decisions — Transactions: a sale without a margin says why (issue #4736)

_Recorded 2026-10-22 · issue #4736._

- **Only reasons the realized-margin engine itself decides.** A sale without a Margin carries one of three: `noBuy` (the wallet buys before it don't cover every unit), `outside` (covered, but another sale of the item outran the buys, so the engine drops it too) and `noTax` (covered, no sales tax line found). Never "built", "mined" or "received free": units are fungible and a wallet transaction carries no marker for a contract, transfer or build, so those would be guesses, and a wrong label is worse than a bare dash. Rules out any read of industry-job or mining-ledger data here, and any typed cost (hand-entered cost basis stays killed).
- **`outside` wins over `noTax`.** A covered sale of an item some other sale outran gets no margin even with its tax found, so adding a tax line would not fix it; it says `outside`.
- **A sale not on the character's own behalf keeps the dash.** The engine ignores corp-side fills entirely, so they have no reason and are not counted as uncosted.
- **The uncosted line counts sales shown, not all sales.** "N sales uncosted · X ISK" follows the table's filters, like the rest of the totals strip, and is hidden when it is zero. X is the sales' revenue (quantity × unit price), not a margin.
- **The reason is desktop-only, like the Margin column.** Below `sm` the Margin column is hidden today, so a phone sees only the uncosted line. The Date cell stacks date over time below `sm` (the Wallet journal's pattern) so the table fits 390px.
