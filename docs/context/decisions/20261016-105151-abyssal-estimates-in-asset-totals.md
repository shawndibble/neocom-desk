# Scope decisions — Abyssal estimates in asset totals

_Recorded 2026-10-16._

Wires `20261016-085744-mutamarket-is-the-abyssal-price-source.md` into the
places that value many items at once. Pure rules:
`src/engine/market/abyssalValuation.ts`.

- **An abyssal module is worth its own estimate or nothing.** Every surface
  keeps abyssal types out of type-wide prices (ESI averages and hub prices hold
  none today: 0 of the 97 abyssal types appear in `/markets/prices`, but the
  rule doesn't depend on that). A priced module counts at its MutaMarket
  estimate; any other is unpriced, left out of the total and counted beside it.
  `assetStackValue` now takes any per-item value first (blueprint copies already
  had one), so an estimate flows through the tree totals, search, sort and the
  min-value filter (CSV export's filter included) the same way.
- **Assets: cache first, then one bounded queue.** On load every abyssal item
  takes what this device already holds (one cache read, no network). One queue
  then looks up the rest, 4 at a time: rows on screen first (a row that scrolls
  away before its turn drops out), then up to 100 uncached modules in the
  background per set of Characters in view (a rebuilt asset list doesn't
  restart the count; switching Character does). An `unavailable` answer
  (function not deployed, MutaMarket down) pauses the queue for 5 minutes, then
  that module can be asked again. Leaving the page drops every ask not yet
  started. An estimate asked for elsewhere (Item Detail's import) reaches the
  page through `onAbyssalEstimate`. Answers land in batches, so the tree is
  rebuilt once per batch, not once per module. Rejected: rows-only lookups (the
  root total would miss every module until the pilot drilled to it) and an
  unbounded loop (a trader with thousands of modules would fire thousands of
  calls on every visit).
- **The MutaMarket credit is given once per view, not on every row.** This
  departs from "credit beside every value" in the source decision. A row's value
  carries a tooltip (the estimate note and its age, or why there is none); the
  line under the level header counts "N at MutaMarket's estimate · M not
  priced · K not looked up yet", the last two left out of the total, and
  carries the one "Price from MutaMarket" link. A link on
  every row would add a control per row to a dense list (DESIGN §6c restraint).
- **Net worth counts the last estimate this device holds, however old, and
  never looks one up.** The snapshot job runs at app start, usually before
  Assets is opened, so counting only estimates within their 6 h TTL would make
  the figure jump day to day with whether the pilot looked recently. A module
  never priced on this device counts nothing. If the mutaplasmid data won't
  load, the day is skipped (a later run retries), as when both price sources
  are down. Each day's row is final once
  written, so it keeps whatever estimates were cached that day; it is not
  re-valued when a later estimate arrives, so the line steps up on the day a
  module is first estimated; the Net Worth footnote says so. Rejected: a lookup from the snapshot
  job (network fan-out from a background job) and leaving abyssal modules out
  entirely (understates a pilot who holds billions in them).
- **Contracts value abyssal modules on their own line, never inside the market
  figure.** "Market value at {hub} (sell orders)" stays exactly that. A public
  contract's lines carry each module's `item_id`, so each is looked up (never
  imported), 4 at a time, stopping at the first `unavailable` and when the
  modal closes; abyssal lines never merge, like blueprint copies. A Character's own
  contract items carry no `item_id` (checked against the ESI spec), so those
  modules show as not priced, with the reason.
- **Appraisal and killmails can't price an abyssal module, and say so.** A
  pasted name and a killmail line name the type, not the roll. Abyssal names
  are not in the market catalogue, so they used to land in "lines not matched";
  they now get their own note with a link to MutaMarket's appraisal. The loss
  summary counts them apart from the market-unpriced items.
- **No import anywhere here.** Asking MutaMarket to import (and so publish) a
  module stays Item Detail's explicit, warned action. An abyssal row's Show
  info opens Item Detail on that module (its item id), and a not-imported row's
  tooltip says Show info can ask; the row tooltips reuse Item Detail's wording
  for the other answers.
- **Not covered:** Corp Assets (its rows take the per-item rule but nothing
  looks estimates up), Fittings prices, and contract list rows (only the detail
  modal values items).
