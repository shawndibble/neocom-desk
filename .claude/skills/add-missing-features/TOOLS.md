# Survey ledger

What `/add-missing-features` already knows about the third-party EVE tool
ecosystem and Neocom Desk's own coverage. This is a **reference for the next
run**, not a run log — it's updated in place each run, never appended to.
Read it in step 1; update it in step 7 (curate, don't append — see the
skill's step 7).

## Tools surveyed

| Tool | What it does | Live |
| --- | --- | --- |
| Adam4EVE | Market stats/graphs over time, PI profitability and chains, industry indices | yes |
| Ravworks | Multi-item production planning, full material tree, ME/TE and facility bonuses | yes |
| EVE Tycoon | Profit tracking, order management, market browser, per-item stock | yes |
| Slipway | Industry planner: what to build, where to build it, where to sell it | yes |
| Janice / Iron Whales Appraiser | Bulk appraisal, ore reprocessing, live BPO/BPC contract pricing | yes |
| EVE Blue Desk / EvE Blueprint | Blueprint market and production platform | yes |
| EVE Courier | Route planning, gatecamp check, arbitrage finder, contracts manager | yes |
| Fuzzwork | Blueprint calculator, reprocessing, static data dumps | yes |
| EVE Ref | Reference data and market browsing | yes |
| EVE Retroindustry | Local BOM/make-vs-buy planner, multi-char asset/blueprint/PI/wallet tracking, contract search | yes |
| ISK.GG | Market browser: multi-region price history, depth charts, saved views, CSV export | yes |
| EVE Miner Hub | Cross-character mining ledger aggregator, ISK/hr, OBS widget | yes |
| EQM | All-in-one: production economics, multi-hub appraisal, Corporate Exchange, wallet trends, JF fuel planning | yes |
| EveLens | EVEMon-style skill planning + Skill Farm ISK/hr dashboard | yes |
| EVE Horizon | Manufacturing + PI planning: hangar-sweep BOM netting, PI plan-vs-actual scorecards, cross-colony coordination, market restock | yes |
| EVE Forge | Nested BOM/capital parts, reactions, invention calc, PI calc, trading indicators, Gantt scheduling | yes |
| EVE-Industry-Scanner-Tool | Manufacturing/reaction/PI profitability scoring across 5 hubs, hub arbitrage, opportunity score | yes |
| EVE-HUB | PI planner (P0-P4), hub-to-hub arbitrage scanner, route/threat intel, multi-hub watchlist | yes |
| EVE TradeLooper | Cargo valuation, mining/industry planning, LP store analysis, pasted cargo/ore/dscan scanner | yes |
| EVE Night Trade Tools | FIFO P&L dashboard, undercut alerts, station-trading and inter-region scanners | yes |
| IndustrialEVE | PI notifications | yes |
| jEveAssets | Established multi-account asset manager | yes |
| EVEAIO | Bug-bounty preview, no feature list disclosed | unknown |

**Skimmed by thread title only, confirmed out of domain (mapping/intel/
fitting-sim/crew-sim, no industry or market surface):** EVE Crews, Nexum,
EveWebMail, EVE-NAV, Capsuleers.app, Wayfinder, Atlas, MISMAPS/MISKILLZ, NPC
Sites Help, Fly Safe, WHMapper, Socketkill, PEARL, EVE Hacking Simulator, EVE
Nexus, Eve PvP Radar, EVE-O Preview, EVE MCP Server, EVE Threat Checker, EVE
Fit Assistant, SLH Local Scanner, EveBoosters.com, Dd24tool.de (a paid
buyback business, not a tool gap).

**The forum category JSON paginates** (`more_topics_url`). Fetch page 0 *and*
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
4. **Engine exists but has one caller.** Grep the engine's *callers*, not
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

## Filed candidates

| # | Verdict | Candidate |
| --- | --- | --- |
| #642 | NARROW | Build Opportunity Finder — seeding/sorting tab over Build Plan Compare |
| #643 | NARROW | Restock / reorder points |
| #671 | NARROW | Mining Yield Tracker — ordinary ore/ice |
| #672 | NARROW | Appraisal refine-then-sell comparison |
| #679 | NARROW | Build Opportunities — job-slot header count |
| #680 | SHIP | Quickbar price alerts |
| #689 | SHIP | Appraisal multi-hub comparison |
| #690 | SHIP | Wallet balance-over-time chart |
| #711 | SHIP | Production Log realized-profit-over-time chart |
| #712 | SHIP | Assets total portfolio value |
| #713 | NARROW | Open Orders sell-through column |
| #717 | SHIP | Contracts market-value appraisal |
| #718 | NARROW | Loyalty Store cross-corp offer list |
| #722 | NARROW | Build Opportunities unowned-blueprint coverage |
| #725 | SHIP | PI Production Run/Log |
| #726 | NARROW | Quickbar → Appraisal multi-hub handoff |
| #730 | NARROW | Price History 7-day moving average |

## Killed / dropped candidates (never filed)

| Candidate | Reason |
| --- | --- |
| Hub arbitrage / trade route finder | Ships as `hubHaulGaps`; no ESI for per-route courier cost. Re-confirmed twice more against newly-found tools. |
| System cost index watch | No historical ESI data; distribution is a near-constant. |
| Corp ore buyback / fleet payout split | Cross-player aggregation wall. |
| Skill Extractor ISK/hr comparison | Narrow reach (multi-account SP arbitrage). |
| Market/order-book depth chart | Picture of data already on screen. |
| Public item-exchange contract deal browser | Reopens ADR 0013's Firestore write-budget limit at full scale. |
| Price history %-change headline stat | Thin-volume days make a naive delta unreliable. |
| Corp Wallet: extend balance chart to corp divisions | Narrow reach (Accountant/Junior_Accountant role only); explicitly deferred, not bundled. |
| Build Plan material row → PI colony link | Colony cache is Dexie-only, cold for most players most of the time. |
| EVE Forge-style Gantt production scheduling | Picture of data already on screen (`ActiveJobsPanel.tsx`). |
| Bulk relist / buy-queue automation | No write-scoped ESI; Open Orders is deliberately read-only. |
| EQM Corporate Exchange | Cross-player aggregation wall. |
| Asset staleness / idle-inventory detection | Assets endpoint has no acquisition/last-touched timestamp. |
