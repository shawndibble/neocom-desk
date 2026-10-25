# Scope decisions — Sell value charges owned stock a sub-build consumes

_Recorded 2026-10-24._

- **On the sell-value Profit Basis, owned stock is charged wherever in the build tree it is consumed, not only at the top level.** Owned units are claimed from one shared pool across the whole resolved tree, so a sub-build's inputs hold stock the top level never sees; charging only the top level understated what building uses up. `planOwnedStockSale` (`src/engine/industry/ownedStockSale.ts`) walks the tree and merges each type into one stack, and the Verdict Hero, Costs & revenue and Break Even all read it. A Materials row's "sells for" now matches its own Have, which was already whole-tree.
- **An owned type with no price on the chosen side of the book still drops the plan to the free basis, now at any depth.** A partial sell value is never passed off as complete. Owned intermediates deep in a tree are the likeliest to lack a buy price, so a plan that showed sell value before can now show free; that is the honest figure, not a regression. Break Even applies the same rule to each trial run count. A visible cue for why sell value is unavailable is not part of this change.
