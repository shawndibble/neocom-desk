# Scope decisions — Appraisal Undercut lists one tick under the hub's cheapest seller

_Recorded 2026-09-24._

- **An Undercut toggle on the Appraisal result adds a "List at" column: one legal price tick under the hub station's cheapest sell order, with a copy button per row.** It is how a pilot bulk-lists a pasted pile so that every item sits cheapest at the hub. ESI has no endpoint for placing orders, so the feature stops at the clipboard: it hands over the price, and the pilot creates the order in game. Anything that looks like order placement is ruled out.
- **The price ignores Price Percent.** The listing has to beat a real order, not a fraction of one. That is the same reasoning as the net-of-fees chips (`20260924-010954-appraisal-shows-net-of-fees-totals-at-100.md`), and `appraisalNet`'s List Net is built on the same `appraisalUndercut` price, so the column and the chip never disagree.
- **The price comes from the Appraisal's existing hub price source**: Fuzzwork's per-station `sellMin`, behind the 15-minute price cache, and Fuzzwork itself lags the live book. The column's note says so and tells the pilot to Refresh before listing. Live per-station ESI order books are the upgrade path. They were left out because they cost one paginated region call per pasted item.
- **A row whose undercut lands at or below the best buy order is flagged instead of hidden.** Selling into that buy order pays the same or more, with no broker fee.
- **Out of scope for now:** skipping items where the pilot already holds the cheapest order at the hub.
