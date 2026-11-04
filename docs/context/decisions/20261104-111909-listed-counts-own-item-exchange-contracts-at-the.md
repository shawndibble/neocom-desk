# Scope decisions — Listed counts own item exchange contracts at the market (issue #5974)

_Recorded 2026-11-04 · issue #5974._

- **Listed is the pilot's own sell orders plus the items of their own outstanding Item Exchange contracts that start at the market.** Revises the "own sell orders only" part of `20261010-182330`. Items leave the asset list when a contract is made, so a hull or module sold by contract read Out while it was for sale. Counted as Listed, so Status, Shortfall, the Overview card and the below-target alert agree; the Listed cell shows the contract part apart ("of which N on contract") and the attribution folds it into the issuing Character's share.
- **Own Characters' contracts only; corporation, courier and auction contracts add nothing.** Corporation hangars stay the named follow-up of the v1 decision. Items the issuer asks for (`is_included` false) are not stock.
- **Cache only, no new ESI traffic.** Contract items are fetched on demand (the contract detail modal) and by the net-worth snapshot, never by Stock or the alert, so the count is as fresh as the last snapshot or opened contract; a contract whose items were never read contributes nothing. A missing contract cache never turns the alert's Listed unknown: only the orders cache decides that.
