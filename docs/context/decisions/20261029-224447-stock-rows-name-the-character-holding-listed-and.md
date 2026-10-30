# Scope decisions — Stock rows name the Character holding Listed and Ready-to-list (issue #5594)

_Recorded 2026-10-29 · issue #5594._

- **Variant A: holders sit inline in the Listed and In hangar cells.** One holder reads "40 · [portrait] Name"; several read "N characters" and open a popover with each count. A "Listing here: ..." line under the market title names the Characters with sell orders there. Attribution only: totals, status, alerts and Build Plan sizing are unchanged, and the per-Character lists sum to the totals (`holdersAtMarket`, `src/engine/stockTargets/onHand.ts`).
- **A pilot with one Character with data sees none of it.** The holder is always them, so naming them adds noise; the cells and header stay as before.
- **The Stock table gets a Columns picker and every data column sorts.** Reuses `ColumnPickerMenu` and `DataTable` sorting; visibility is device-local (`stockVisibleColumns`) like other tables. Item stays always on. The bar column gained a "Fill" header (sorts by fill) and Status sorts worst first.
- **Rejected: variants B (portrait stack only) and C (header summary, Restock naming the lister).** The owner chose A. "Can list all N" wording and hub-first ordering stay out until #5593.
