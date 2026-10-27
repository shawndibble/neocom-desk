# Scope decisions — Stock Targets v1 scope (issue #3521)

_Recorded 2026-10-10 · issue #3521. Revised the same day: the feature moved
from Assets › Targets to Market › Stock once the user framed it as keeping a
market they sell at stocked._

- **A Stock List is a market: it belongs to one station or structure the
  pilot picks, and that is required.** The job is "does the market I sell at
  have what it should, and what is running low", so a list counted
  "anywhere" answered a different question. It lives on Market, next to Open
  orders, as the tab "Stock"; Assets keeps its three tabs. A list stored
  without a market (only ever written by pre-release builds) is dropped.
- **Status is measured by the pilot's own sell orders at that market
  (Listed). Their hangars at the same station count apart, as "ready to
  list".** A hangar full of stock is still an empty shelf until it is listed,
  but it is the cheapest restock, so the Shortfall is split: the part the
  hangar covers, then the part to buy or build. Only the second is priced and
  sized into Build Plan runs. Rules out, for now, every seller's orders at
  the structure: that needs the opt-in `esi-markets.structure_markets.v1`
  grant and its own prompt, so it is the follow-up that makes a corp market's
  shelf exact. Corp hangars are the other follow-up.
- **With two or more markets the tab opens on a list of them, worst first
  (most Out, then most Low, then cost); with one it opens that market.** The
  user asked to see which market needs attention. A market's own page is a
  deep sub-path (`/market/stock/<list id>`), so the Overview card and a
  browser back land on it. **One market per station or structure**: an
  alert carries the place (`?market=<location id>`, since alert subjects are
  numbers and list ids are not), so a second list at the same place is
  refused, and a shared market for a place already stocked fills in what
  that market lacks rather than adding a twin.
- **A new market can start from what the pilot already sells there**, each
  target set to the amount listed now. A pilot who already runs a market
  then only adjusts numbers; "Add everything I sell here" in the market's
  menu does the same later, adding only items not yet on the list.
- **Stock Lists are one account-wide synced setting (`sync.stockLists`), not
  a synced collection, and not keyed per Character.** The Build Groups
  precedent: a collection needs a `firestore.rules` clause deployed by hand,
  and a denied collection takes the whole sync pass down. Account-wide
  because the counts already span every Character. Accepts last-write-wins on
  the whole array.
- **The below-target alert reads cached orders and assets only, and is filed
  under one Character** (the lowest id holding the orders scope), so one
  empty shelf fires once. It fires when Listed drops into Low or from Low to
  Out — usually orders selling — never for a Stock Target the pilot just
  added or changed, and says how many wait in the hangar there.
- **The Overview's Stock card is absent until the pilot stocks a market**
  (`available: false`). It lists the markets needing restock, worst first,
  and counts the fully stocked ones in its footer.
- **A share link carries the list and its market, never the sender's
  counts.** The receiver saves a copy and counts it against their own
  orders. A base36 text code (`2|name|location|typeId:target,…`), like the
  Appraisal's, no backend and no expiry.
- **Builder's time per run is the blueprint's own time after its TE, before
  skills and facility.** "You can build now" means the active Character
  holds a blueprint (BPO or BPC).
- **Deviations from the mockup, for DESIGN.md:** the summary is `StatChips`,
  not boxed stats; statuses are the tinted-word pill (§6c's verdict cue); a
  market's need is the same pill ("2 out", "Stocked"), and phone cards carry
  no coloured left edge; the bar's legend sits under the table; the row ⋮ is
  the shared item menu plus "Remove from list".
