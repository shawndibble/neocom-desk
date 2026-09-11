# Survey ledger

What `/add-missing-features` already knows about the third-party EVE tool
ecosystem and Neocom Desk's own coverage. This is a **reference for the next
run**, not a run log — it's updated in place each run, never appended to.
Read it in step 1; update it in step 7 (curate, don't append — see the
skill's step 7).

## Tools surveyed

| Tool                            | What it does                                                                                                                      | Live    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Adam4EVE                        | Market stats/graphs over time, PI profitability and chains, industry indices                                                      | yes     |
| Ravworks                        | Multi-item production planning, full material tree, ME/TE and facility bonuses                                                    | yes     |
| EVE Tycoon                      | Profit tracking, order management, market browser, per-item stock                                                                 | yes     |
| Slipway                         | Industry planner: what to build, where to build it, where to sell it                                                              | yes     |
| Janice / Iron Whales Appraiser  | Bulk appraisal, ore reprocessing, live BPO/BPC contract pricing                                                                   | yes     |
| EVE Blue Desk / EvE Blueprint   | Blueprint market and production platform                                                                                          | yes     |
| EVE Courier                     | Route planning, gatecamp check, arbitrage finder, contracts manager                                                               | yes     |
| Fuzzwork                        | Blueprint calculator, reprocessing, static data dumps                                                                             | yes     |
| EVE Ref                         | Reference data and market browsing                                                                                                | yes     |
| EVE Retroindustry               | Local BOM/make-vs-buy planner, multi-char asset/blueprint/PI/wallet tracking, contract search                                     | yes     |
| ISK.GG                          | Market browser: multi-region price history, depth charts, saved views, CSV export                                                 | yes     |
| EVE Miner Hub                   | Cross-character mining ledger aggregator, ISK/hr, OBS widget                                                                      | yes     |
| EQM                             | All-in-one: production economics, multi-hub appraisal, Corporate Exchange, wallet trends, JF fuel planning                        | yes     |
| EveLens                         | EVEMon-style skill planning + Skill Farm ISK/hr dashboard                                                                         | yes     |
| EVE Horizon                     | Manufacturing + PI planning: hangar-sweep BOM netting, PI plan-vs-actual scorecards, cross-colony coordination, market restock    | yes     |
| EVE Forge                       | Nested BOM/capital parts, reactions, invention calc, PI calc, trading indicators, Gantt scheduling                                | yes     |
| EVE-Industry-Scanner-Tool       | Manufacturing/reaction/PI profitability scoring across 5 hubs, hub arbitrage, opportunity score                                   | yes     |
| EVE-HUB                         | PI planner (P0-P4), hub-to-hub arbitrage scanner, route/threat intel, multi-hub watchlist                                         | yes     |
| EVE TradeLooper                 | Cargo valuation, mining/industry planning, LP store analysis, pasted cargo/ore/dscan scanner                                      | yes     |
| EVE Night Trade Tools           | FIFO P&L dashboard, undercut alerts, station-trading and inter-region scanners                                                    | yes     |
| IndustrialEVE                   | PI notifications                                                                                                                  | yes     |
| jEveAssets                      | Established multi-account asset manager                                                                                           | yes     |
| EVEAIO                          | Bug-bounty preview, no feature list disclosed                                                                                     | unknown |
| MONW                            | Multi-char industry: recursive BOM w/ have-subtraction, corp shared plans w/ role delegation, structure-market pricing overlay    | yes     |
| Mudoteve (Solo Industry App)    | Unit-based BOM staging/netting, manufacturing job queue sync, freight/procurement cost logging, asset journal                     | yes     |
| ArmedATLAS V2                   | Route planner (gatecamp/hazard) + cross-hub hauling arbitrage dispatch; PI/mining on roadmap                                      | yes     |
| PlanetFlow.APP                  | Self-hosted corp-scale PI: inventory lots, bulk import, hauling/intel integration, shareable PI templates                         | yes     |
| Cradle of War                   | Ore/mineral reprocessing value + top-5 buy-order lookup for bulwark-site ore                                                      | yes     |
| EVE Data Site                   | Market history/distribution charts with outlier filtering, universe-avg pricing, PLEX ticker                                      | yes     |
| PIM (EVE PI Manager)            | Multi-char PI: storage-fill/factory-stall forecasting, POCO-to-planet material linking                                            | yes     |
| Web-based PI Tracker            | Client-side-only multi-char extractor/material tracker (P0-P1 only)                                                               | yes     |
| JitaStocks                      | Corp collaborative build management, material reservation/claim, LP↔ISK exchange                                                  | yes     |
| Indeve                          | Multi-product BOM planner w/ reactions/reprocessing, per-activity presets, material cost imported from wallet transaction history | yes     |
| EVE Fleet Mining & Ratting Tool | Fleet mining ledger/payout split (main+alt grouping), ore value + reprocess overview, minimal ratting bounty tracker, PI planner  | yes     |
| FW LP Store shopping-cart tool  | Faction Warfare LP store cart w/ LP/ISK filters, build-cost breakdown; in-dev redemption portfolio/ROI tracker                    | yes     |

**Skimmed by thread title only, confirmed out of domain (mapping/intel/
fitting-sim/crew-sim/combat-loot-tracking, no industry or market surface):**
EVE Crews, Nexum, EveWebMail, EVE-NAV, Capsuleers.app, Wayfinder, Atlas,
MISMAPS/MISKILLZ, NPC Sites Help, Fly Safe, WHMapper, Socketkill, PEARL, EVE
Hacking Simulator, EVE Nexus, Eve PvP Radar, EVE-O Preview, EVE MCP Server,
EVE Threat Checker, EVE Fit Assistant, SLH Local Scanner, EveBoosters.com,
Dd24tool.de (a paid buyback business, not a tool gap), ISKONOMY (PvE
loot/ISK-hr tracker — abyssals/DED/incursions, not industry or market),
EVE Market Order Assistant (write-scoped order-price editing, paid),
EVE Empire, EVE NewBro, EVE Link, ECT EVE Assets, PATT, W-Space Atlas,
Pod, EveHunter, ADAPT, Helm, Nicotine, fleet-manager/HARUSPEX/EasyEve,
icon server, contract-monitoring Discord bot, Ministry of Pantoscopic
Observance/observance.app (wormhole intel, no industry/market surface),
Modular All-in-One Desktop Tool (names Production/Market modules, discloses
no feature detail — revisit if it publishes specifics) (corp/fleet/intel
tooling, no industry or market surface).

**The forum category JSON paginates** (`more_topics_url`). Fetch page 0 _and_
page 1 minimum, and keep following the link while present — five early runs
only ever fetched page 0 and missed EVE Horizon/EVE Forge/EVE-HUB, which held
the only surviving PI candidates found so far.

## Already covered — don't re-propose

Mapped to the module/route that proves it, so a future run can verify fast:

- **Market**: undercut detection (`undercut.ts`), order competition/health
  (`orderCompetition.ts`, `orderHealth.ts`, `orderProblems.ts`), full raw
  order book as sortable table with context menu (Market Browser), hub-to-hub
  price gap for an owned sell order (`hubHaulGaps` in `orderExits.ts`).
- **Appraisal**: single-hub appraisal, multi-hub comparison (#689), refine-
  then-sell (#672), contract-line market value (#717), reprocessing
  (`reprocessing.ts`).
- **Industry**: realized profit (`realizedProfit.ts`), build-vs-buy/make-or-
  buy, Build Groups/Build Opportunities (multi-item planning — covers most of
  Ravworks'/Slipway's pitch), Order Depth column (`classifyOrderDepth` in
  `opportunities.ts`), open manufacturing job-slot count (#679), owned-stock/
  Craft Sweep detection (`ownedStock.ts`), unowned-blueprint coverage ranking
  (#722), Active Jobs sorted-by-soonest with per-category slot usage
  (`ActiveJobsPanel.tsx`, `jobSlots.ts`), Production Log realized-profit chart
  (#711), price history charted (`PriceHistoryChart.tsx`) plus 7-day SMA
  (#730).
- **PI**: stop-tier recommendation, fed/starved pin detection, reset-run
  batching, measured extraction rate, cross-colony coordination (ADR 0012,
  `network.ts`) — out-depths every third-party PI tool surveyed so far.
  Production Run/Log equivalent for PI batches (#725).
- **Wallet/LP**: balance-over-time chart (#690, `balanceHistory.ts`), corp
  wallet division sync (`engine/corp/assetDivisions.ts`), LP store ISK/LP
  ranking (`offerRows.ts`/`offerProfit.ts`).
- **Assets**: total portfolio value across locations (#712).
- **Open Orders**: sell-through/days-to-clear column (#713), multi-character
  aggregation (`CharacterFilterControl`).
- **Mining**: moon-ore ledger tax tracking (`groupMiningLedger`), ordinary
  ore/ice yield tracker (#671).
- **Quickbar**: price alerts on target price (#680), multi-hub Appraisal
  handoff (#726).
- **Restock**: par-level reorder points (#643).

Also confirmed and settled: PI chain revenue/margin already prices at
`revenuePrices` end-to-end (`chain.ts`/`stopTier.ts`/`network.ts`); no market-
sell PI gap exists. Corp Industry Jobs' missing installer column is real but
deliberately out ("active jobs, not installer/location bookkeeping",
`src/esi/endpoints.ts`) and narrow-reach (corp directors only).

## Standing kill-tests

Reusable heuristics — check a new candidate against these before drafting:

1. **Cross-player aggregation wall.** This is a local-first PWA; ESI data
   lives in Dexie per device and never syncs across players. Kills: hub
   arbitrage/trade-route finders, corp ore-buyback/fleet-payout splitters,
   EQM-style member-to-member exchanges.
2. **No write-scoped ESI.** `src/esi/registry.ts` has zero write endpoints —
   the app never places/cancels/modifies an in-game order
   (`docs/context/decisions/20260906-155913-open-orders-reads-as-a-worklist.md`).
   Kills bulk relist/buy-queue/order-automation candidates.
3. **Picture of data already on screen.** A chart/viz that just re-renders
   numbers already visible as rows is not new capability. Killed twice
   independently: order-book depth chart. Also killed a Gantt job-scheduling
   timeline (`ActiveJobsPanel.tsx` already answers "when do jobs finish" as
   rows).
4. **Engine exists but has one caller.** Grep the engine's _callers_, not
   just its existence, before assuming full coverage — reprocessing and the
   wallet balance chart were both real gaps hiding behind an already-built
   engine used in exactly one place.
5. **No historical ESI series.** System cost index has no ESI history at all
   (and 63% of systems sit at an identical floor) — kills any cost-index-
   over-time feature.
6. **Settled scope wins.** Always check `docs/context/decisions/` and
   `.out-of-scope/` before drafting; a plausible pitch can directly contradict
   an already-recorded decision (ADR 0013's Firestore write-budget limit on
   public-contract crawling; blueprint research/invention planning being
   out-of-scope for missing price data).
7. **Assets endpoint has no timestamp.** No acquisition/last-touched field —
   kills staleness/idle-inventory detection.
8. **Not in a poll domain ≠ regularly sampled.** A locally-accumulated time
   series (the pattern that rescues a feature from kill-test 5) only works if
   the underlying fetch actually happens on a schedule. Check
   `src/features/notifications/pollDomains.ts` before assuming one does —
   Assets is page-visit-only, not a poll domain, so a self-built history off
   it samples on whenever the player happens to open the page, producing
   misleading flat stretches rather than an honest series. Killed: Total
   Assets Value chart over time (rescoped from #712, which explicitly left
   the door open for this — still dies on sampling cadence).
9. **A scope being wired for one feature doesn't make it free for another.**
   `esi-markets.structure_markets.v1` (opt-in `structureMarkets` group,
   issue #538) is registered and fetchable, but has zero settings-page
   surface asking the player to grant it — "grantable in principle,
   ungranted in practice" per its own scope decision. Treat unbuilt consent
   UI as part of the cost, not a formality.
10. **Materials are fungible — no per-unit purchase provenance.** Settled by
    `docs/context/decisions/20260905-181537-production-log-row-per-allocation-sync-accept-wallet.md`
    for the _sell_ side (rejected automated FIFO cost reconstruction) and
    confirmed to apply with equal force to the _buy_ side: a Production Run's
    `materialCost` is one aggregate, user-editable number, not a per-material
    line list, and materials commonly come from mining/reactions/other
    characters/months-old stock, not one traceable purchase. Kills: linking
    a Production Run's material cost to actual wallet purchase transactions
    (mirroring the sale-linking picker `useSaleLinking.ts` already does for
    revenue) — the revenue side works because there's one output item and an
    occasional linking event; the buy side has no equivalent bound.
11. **A `ref_type` filter on the Wallet journal already exists.**
    `walletJournalFilter.ts` (`src/features/character/`) lets a player filter
    the Wallet page's journal by `ref_type` and export it, so a candidate
    proposing "a view of wallet journal entries with ref_type X" is usually a
    saved filter, not new capability — check this before treating a
    ref_type-scoped ledger/chart as a gap (kill-test 3's "picture of data
    already on screen" extends here). Killed: LP Store redemption ledger off
    `ref_type: lp_store`.

## Filed candidates

| #    | Verdict | Candidate                                                              |
| ---- | ------- | ---------------------------------------------------------------------- |
| #642 | NARROW  | Build Opportunity Finder — seeding/sorting tab over Build Plan Compare |
| #643 | NARROW  | Restock / reorder points                                               |
| #671 | NARROW  | Mining Yield Tracker — ordinary ore/ice                                |
| #672 | NARROW  | Appraisal refine-then-sell comparison                                  |
| #679 | NARROW  | Build Opportunities — job-slot header count                            |
| #680 | SHIP    | Quickbar price alerts                                                  |
| #689 | SHIP    | Appraisal multi-hub comparison                                         |
| #690 | SHIP    | Wallet balance-over-time chart                                         |
| #711 | SHIP    | Production Log realized-profit-over-time chart                         |
| #712 | SHIP    | Assets total portfolio value                                           |
| #713 | NARROW  | Open Orders sell-through column                                        |
| #717 | SHIP    | Contracts market-value appraisal                                       |
| #718 | NARROW  | Loyalty Store cross-corp offer list                                    |
| #722 | NARROW  | Build Opportunities unowned-blueprint coverage                         |
| #725 | SHIP    | PI Production Run/Log                                                  |
| #726 | NARROW  | Quickbar → Appraisal multi-hub handoff                                 |
| #730 | NARROW  | Price History 7-day moving average                                     |

## Killed / dropped candidates (never filed)

| Candidate                                                                                               | Reason                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hub arbitrage / trade route finder                                                                      | Ships as `hubHaulGaps`; no ESI for per-route courier cost. Re-confirmed twice more against newly-found tools.                                                                                                                                                                                                  |
| System cost index watch                                                                                 | No historical ESI data; distribution is a near-constant.                                                                                                                                                                                                                                                       |
| Corp ore buyback / fleet payout split                                                                   | Cross-player aggregation wall.                                                                                                                                                                                                                                                                                 |
| Skill Extractor ISK/hr comparison                                                                       | Narrow reach (multi-account SP arbitrage).                                                                                                                                                                                                                                                                     |
| Market/order-book depth chart                                                                           | Picture of data already on screen.                                                                                                                                                                                                                                                                             |
| Public item-exchange contract deal browser                                                              | Reopens ADR 0013's Firestore write-budget limit at full scale.                                                                                                                                                                                                                                                 |
| Price history %-change headline stat                                                                    | Thin-volume days make a naive delta unreliable.                                                                                                                                                                                                                                                                |
| Corp Wallet: extend balance chart to corp divisions                                                     | Narrow reach (Accountant/Junior_Accountant role only); explicitly deferred, not bundled.                                                                                                                                                                                                                       |
| Build Plan material row → PI colony link                                                                | Colony cache is Dexie-only, cold for most players most of the time.                                                                                                                                                                                                                                            |
| EVE Forge-style Gantt production scheduling                                                             | Picture of data already on screen (`ActiveJobsPanel.tsx`).                                                                                                                                                                                                                                                     |
| Bulk relist / buy-queue automation                                                                      | No write-scoped ESI; Open Orders is deliberately read-only.                                                                                                                                                                                                                                                    |
| EQM Corporate Exchange                                                                                  | Cross-player aggregation wall.                                                                                                                                                                                                                                                                                 |
| Asset staleness / idle-inventory detection                                                              | Assets endpoint has no acquisition/last-touched timestamp.                                                                                                                                                                                                                                                     |
| Player-structure pricing for Build Plans/Appraisal                                                      | `structureMarkets` scope has no consent UI yet; widens a 5-value literal union across ~15+ call sites for a minority (staging-citadel) population; a lone structure's book is usually thin so hub pricing still dominates the math anyway.                                                                     |
| Total Assets Value chart over time                                                                      | Assets isn't a poll domain (page-visit-only fetch) — a locally-accumulated series would sample on whenever the player opens the page, producing misleading flat gaps rather than an honest history.                                                                                                            |
| Production Run: link material cost to actual wallet purchase transactions (Indeve-style)                | Materials are fungible with no per-unit purchase provenance; `materialCost` is one aggregate number, not a line list; contradicts #525's settled FIFO-reconstruction rejection extended to the buy side. See standing kill-test 10.                                                                            |
| LP Store redemption ledger / ROI tracking (from an FW LP shopping-cart tool's in-dev portfolio feature) | Item-level ROI needs parsing the journal's free-text `description` (fragile, unconfirmed format) since `ref_type: lp_store` carries no structured item/qty. Even the safely-buildable aggregate ISK-spend-over-time version overlaps the Wallet page's existing `ref_type` filter — see standing kill-test 11. |
