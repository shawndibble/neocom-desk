# Scope decisions — Stock Runs reads the plan's rows with owned quantities stripped (issue #6382)

_Recorded 2026-11-18 · issue #6382._

- **Each trial run count resolves the plan as if it owned nothing, over every Materials table row except Blueprint Acquisition.** A typed Have can pool onto an intermediate and shrink a sub-build's need, which would make the count move with what the pilot already typed and break "more runs never need less" against a fixed stock. Stripping the Haves gives the need of a run count alone; the stock side is the **Owned-Stock Offer** quantity (`offerableStock`), shared with the Materials table. Quantities never depend on prices, so trials skip Depth Prices (`resolveQuantitiesAt`). Rules out reading `result.materials` top-level rows only: a built row's inputs are rows the offers reach, so they cap runs too.
