# Scope decisions — Appraisal prices from the live hub order book (issue #5591)

_Recorded 2026-10-29 · issue #5591. Amends `20260924-124701-appraisal-undercut-lists-one-tick-under-the-hubs.md`._

- **The Appraisal page prices every row from the live hub-station order book, and no other surface does.** Best sell, best buy, the undercut, totals and the net chips read the book (`GET /markets/{region}/orders?type_id=`, filtered to the hub station). Assets value, widgets, Build Plans and Hauling keep Fuzzwork's cached prices. Refine material prices and LP-store ISK costs on the page also stay cached, because they are not the pasted rows.
- **Fast first paint, then live.** The table renders from the cached prices, then each row swaps as its book lands, most valuable rows first, 12 at a time. There is no large-paste cutoff: every row goes live at the selected hub.
- **A fetched book is reused for 10 minutes** (not ESI's 300 s, deliberately, for fewer calls). Re-appraising or copying the same types in that time makes no request. Refresh always refetches. The header shows the real age ("Live prices · checked N s ago"), so an old book is not passed off as fresh.
- **Own cheapest order is matched, not undercut.** If any of the pilot's characters holds (or ties) the cheapest sell at the station, the row lists at that price unchanged. Otherwise one tick under the cheapest seller. Own orders are the cached character orders already held, matched by order id. This replaces the "out of scope for now" in the decision above.
- **Compare Hubs goes live lazily.** The selected hub's books load with the page. The other four hubs' books load only once Compare Hubs is opened. A hub's card keeps its cached total, marked, until every row of that hub has landed, so a total is never half live and half cached.
- **A failed row stays on its Fuzzwork price and is marked.** A book ESI returns truncated counts as failed, since a partial book gives a wrong best price. The header never says "live" for a list with a cached row ("Live prices for 59 of 60 rows").
- **Copy waits for live.** A copy action waits for any row still loading before it reads the prices.
- **Presentation is mockup variant B:** the thin bar is the top border of the result card, the status text sits in its title bar, and a cached or failed price wears a clock or warning mark. Compare Hubs shows the same bar and text above the cards.
- **Accepted while checking: the result totals mix live and cached rows.** Compare cards wait for every row of a hub, the table totals do not. Each row's mark shows which is which.
- **Accepted: the `books` state is never pruned.** It is bounded by the session (one entry per hub and type pasted).
- **Accepted: Refresh pressed while Compare Hubs is closed does not force the other four hubs later.** They load from the 10-minute cache when Compare is next opened.
