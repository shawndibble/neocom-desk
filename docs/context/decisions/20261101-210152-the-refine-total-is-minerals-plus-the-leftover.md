# Scope decisions — The Refine total is minerals plus the leftover units, the same figure everywhere

_Recorded 2026-11-02._

- **The Refine total, the Refine chip and the breakdown's refined figure are one number: the refined minerals, net of tax, plus the units too few to fill a portion, at their as-is unit price on the selected Price Basis.** That is what a pilot holds after refining, and it is what the refine-versus-sell verdict already compared. Before, the column and chip showed the minerals alone while the breakdown's headline included the leftover, so clicking the chip's number showed a different one (the minerals-only figure was there, as the small Minerals line near the bottom).
- **The "!" hint on a row's Refine total is gone.** It existed to say that the leftover units tipped refine over selling as is; with the leftover in the figure itself, the figure is the comparison and needs no footnote.
- **The breakdown still shows the lines that make it up.** The minerals table lists the minerals, then a Minerals row under a heavier rule so it reads as their sum, then the leftover units, then the total; the by-item table's refined figure is the row's Refine total.
- **One engine path.** `refineTotalFor` (a row) and `refineTotalOfRows` (the pile) give the figure the page shows, `refineMineralsFor` the minerals alone, and a test holds the page's figures equal to the breakdown's on every basis and for every item. The CSV's Refine column is the same figure on the buy basis.
