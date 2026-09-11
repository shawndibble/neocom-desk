# Survey ledger

What `/add-missing-features` already knows about the third-party EVE tool
ecosystem and Neocom Desk's own coverage. This is a **reference for the next
run**, not a run log — it's updated in place each run, never appended to.
Read it in step 1; update it in step 7 (curate, don't append — see the
skill's step 7). Kept under ~150 lines — compress on sight, don't just add.

## Tools surveyed

Adam4EVE (market stats/PI profitability/industry indices), Ravworks
(multi-item production planning, full material tree), EVE Tycoon (profit
tracking, order mgmt, per-item stock), Slipway (what/where to build & sell),
Janice/Iron Whales Appraiser (bulk appraisal, reprocessing, BPC pricing), EVE
Blue Desk/EvE Blueprint (blueprint market platform), EVE Courier (routing,
gatecamp check, arbitrage, contracts), Fuzzwork (blueprint calc, reprocessing,
SDE dumps), EVE Ref (reference/market data), EVE Retroindustry (local
BOM/make-vs-buy, multi-char asset/PI/wallet), ISK.GG (multi-region price
history/depth charts), EVE Miner Hub (mining ledger aggregator), EQM
(production econ, multi-hub appraisal, Corp Exchange, JF fuel), EveLens
(EVEMon-style planning + Skill Farm ISK/hr), EVE Horizon (mfg+PI planning,
hangar-sweep BOM netting, cross-colony coordination), EVE Forge (nested
BOM/capital parts, reactions, invention, Gantt), EVE-Industry-Scanner-Tool
(mfg/reaction/PI scoring across 5 hubs), EVE-HUB (PI planner, hub arbitrage,
threat intel), EVE TradeLooper (cargo valuation, LP analysis, scanner), EVE
Night Trade Tools (FIFO P&L, undercut alerts), IndustrialEVE (PI
notifications), jEveAssets (multi-account asset mgr), EVEAIO (bug-bounty
preview, unknown feature set), MONW (recursive BOM w/ have-subtraction, corp
shared plans, structure pricing), Mudoteve/Solo Industry App (unit BOM
netting, job queue sync), ArmedATLAS V2 (route planner + hauling arbitrage),
PlanetFlow.APP (self-hosted corp PI, shareable templates), Cradle of War (ore
reprocessing value + buy-order lookup), EVE Data Site (market history charts,
PLEX ticker), PIM/EVE PI Manager (multi-char PI forecasting), Web-based PI
Tracker (client-side P0-P1 tracker), JitaStocks (corp build mgmt, material
reservation, LP↔ISK), Indeve (multi-product BOM, wallet-imported material
cost), EVE Fleet Mining & Ratting Tool (payout split, ore/reprocess overview),
FW LP Store shopping-cart tool (LP cart + ROI tracker in dev), EWT Planetary
Interaction Tools (PI commodity/pricing checker, colony builder), EVE ONE
(all-in-one companion: PI, market, in-progress industry suite), EVE Buddy
(char/corp monitoring, PI overview, slot summary), Dr.MoonGoo/CLI Metenox
Calculator (fuel-block/gas yield from scan input, no ledger), Eden Buyback
(standalone buyback marketplace — cross-player), EVE Appraisal (bulk
appraisal + Market Watcher watchlists/alerts), Evernus (desktop margin calc/
multi-region market analysis/mfg planning), GESI (Google Sheets ESI add-on
for jobs/orders/assets/wallet), Lazy Blacksmith (blueprint search/analysis,
rehosted), EVE Orchestra (mining ledger/reprocessing/job tracking, corp
mining tax), Alysii's PI Scheme (PI chain calculator, rehosted), EVE
Planetary Planner (PI chain planner w/ market history, ~7yr active), Upwell
Fuel Monitor (corp-director structure fuel tracker — already covered, see
below). All confirmed live unless noted otherwise above.

**Dead/abandoned, not gap-analysed this run:** EVE Panel (PI sim, iOS), EVE
GURU/Production Ledger, EveTerminal.io, Mining Timer Tool.

**Skimmed by thread title only, confirmed out of domain** (mapping/intel/
fitting-sim/crew-sim/DPS-meters/multibox/dev-tooling/feature-request threads
— no industry or market surface): EVE Crews, Nexum, EveWebMail, EVE-NAV,
Capsuleers.app, Wayfinder, Atlas, MISMAPS/MISKILLZ, NPC Sites Help, Fly Safe,
WHMapper, Socketkill, PEARL, EVE Hacking Simulator, EVE Nexus, Eve PvP Radar,
EVE-O Preview family, EVE MCP Server, EVE Threat Checker, EVE Fit Assistant,
SLH Local Scanner, EveBoosters.com, Dd24tool.de, ISKONOMY, EVE Market Order
Assistant (write-scoped, paid), EVE Empire, EVE NewBro, EVE Link, ECT EVE
Assets, PATT, W-Space Atlas, Pod, EveHunter, ADAPT, Helm, Nicotine,
fleet-manager/HARUSPEX/EasyEve, icon server, contract-monitoring Discord bot,
Ministry of Pantoscopic Observance, Modular All-in-One Desktop Tool
(revisit if it publishes specifics), EVE Market Pro/"ALL IN ONE TOOL!"
(abandoned), "Assets within structures" (Q&A thread), Ascension Labs Libs,
Z-S Overview Customiser, SMT Eve Map Tool, Eve-mentor-mcp, EVEMon Lives,
Prove scan helper, "Looking for Agent Finder tool" (request), TT Route
Planner (wormhole-only), OpsCore v2, WarBeacon, Project Eden, EVE 3D MAP,
@strata-eve/esi SDK, Eve Missile Analyst, Hamburger Helper, EVE Preview
Manager, Eve Ship Stats, Advanced Armor Layering, Grey Zone Automation,
EVE411, Eve Skillsboard, EVE Intelligence Nexus, Rangefinder, Eveswitcher,
Insurgency Tools, Battlefield.Space, EVE OQM integration, "Loyalty point
wallet/logs" (dev-recruitment thread).

**The forum category JSON paginates** (`more_topics_url`). Fetch page 0 _and_
page 1 minimum, keep following while present. Pages 0–10 (newest through
~late 2023) are fully surveyed and hold no unsurveyed industry/market tool
beyond this ledger — start at page 11 next time unless this ledger's own
last-updated is old enough that new threads landed above page 0.

## Already covered — don't re-propose

Mapped to the module/route that proves it:

- **Market**: undercut detection, order competition/health, full order book
  as sortable table (Market Browser), hub-to-hub price gap for an owned sell
  order (`hubHaulGaps`).
- **Appraisal**: single-hub, multi-hub comparison (#689), refine-then-sell
  (#672), contract-line market value (#717), reprocessing (`reprocessing.ts`).
- **Industry**: realized profit (`realizedProfit.ts`), build-vs-buy, Build
  Groups/Opportunities (owned-blueprint ranking, covers most of Ravworks'/
  Slipway's pitch), Order Depth column, open job-slot count (#679),
  owned-stock/Craft Sweep detection (materials only, not finished-product
  inventory), unowned-blueprint coverage ranking (#722), Active Jobs sorted
  by soonest with per-category slot usage, Production Log realized-profit
  chart (#711), price history + 7-day SMA (#730), reactions modeled as a
  manufacturing `activity` (no chaining across blueprints — kill-test 6).
- **PI**: stop-tier recommendation, fed/starved pin detection, reset-run
  batching, measured extraction rate, cross-colony coordination (ADR 0012),
  resource-richness estimate + fitted build plan for unbuilt planets
  (out-depths every surveyed PI tool). Production Run/Log equivalent (#725).
- **Wallet/LP**: balance-over-time chart (#690), corp wallet division sync,
  LP store ISK/LP ranking.
- **Assets**: total portfolio value across locations (#712).
- **Open Orders**: sell-through/days-to-clear column (#713), multi-character
  aggregation.
- **Mining**: moon-ore ledger tax tracking (renter-side reconciliation only —
  no moon composition/pre-extraction data), ordinary ore/ice yield tracker
  (#671).
- **Quickbar**: price alerts (#680), multi-hub Appraisal handoff (#726).
- **Restock**: on-hand vs. listed vs. par-level join, multibuy refill (#643).
- **Contracts**: item-exchange/auction market value (#717); courier
  reward-per-m3/jump/collateral ratio filed as #826 (not yet shipped).
- **Corp Ops Board**: structure fuel-expiry clock already tracked
  (`structureFuel` kind in `engine/corp/board.ts`).
- **Market**: item-variation/meta comparison (EVEMissioneer's pitch) already
  covered — `VariationsTable.tsx`/`VariationsCompareModal.tsx`,
  `engine/market/variations.ts`, `engine/market/attributeCompareMatrix.ts`.
- **Mining**: OMIP-style moon-mining tax tracking already covered by
  `miningTax` (see Mining bullet above); Lazy Blacksmith/EVE Orchestra-style
  blueprint material calc already covered by the Build Plan/BOM engine
  (`features/industry/blueprintCatalog.ts`, `BuildPlanDetail.tsx`,
  `MaterialsTable.tsx`).

Also settled: PI chain revenue/margin already prices at `revenuePrices`
end-to-end; no market-sell PI gap. Corp Industry Jobs' missing installer
column is real but deliberately out (narrow, corp-directors-only). A
per-planet fitted build plan for unbuilt colonies (round 51/53/56 successor)
already answers "what layout should I build" — a static, player-authored,
reusable PI colony template would be a worse, non-link-cost-aware version of
what the Advisor already computes per-planet; don't re-propose.

## Standing kill-tests

1. **Cross-player aggregation wall.** Local-first PWA; ESI data never syncs
   across players. Kills hub arbitrage, corp buyback/payout splitters,
   member exchanges, buyback marketplaces.
2. **No write-scoped ESI.** Zero write endpoints in `src/esi/registry.ts`.
   Kills bulk relist/buy-queue/order-automation.
3. **Picture of data already on screen.** A chart/viz re-rendering numbers
   already visible as rows isn't new capability. Killed: order-book depth
   chart (x2), Gantt job-scheduling timeline, working-capital-locked stat.
4. **Engine exists but has one caller ≠ covered.** Check whether the caller
   uses every field the engine returns. Reprocessing, wallet balance chart,
   and `realizedProfit.ts`'s tax/fee/margin fields (#824) were all real gaps
   of this shape; `orderFloor`/`linkCost.greatCircleKm` came back clean.
5. **No historical ESI series.** Kills cost-index-over-time (no ESI history,
   63% of systems at an identical floor).
6. **Settled scope wins.** Check `docs/context/decisions/` and
   `.out-of-scope/` first. Named precedents: ADR 0013 (public-contract crawl
   write-budget), invention/research/copying planning (no market price for
   the output), round 27's BOM-rollup rejection (one blueprint per plan, no
   cross-blueprint reaction chaining).
7. **Assets endpoint has no timestamp.** Kills staleness/idle-inventory
   detection.
8. **Not in a poll domain ≠ regularly sampled.** Check
   `pollDomains.ts`. Assets is page-visit-only — killed Total Assets Value
   chart on sampling cadence.
9. **A scope wired for one feature isn't free for another.** Unbuilt consent
   UI is part of the cost, not a formality (`structureMarkets` group).
10. **Materials are fungible — no per-unit purchase provenance.** Settled
    project-wide; kills FIFO cost reconstruction on both buy and sell sides,
    including pure station-trading P&L trackers built from wallet history.
11. **A `ref_type` Wallet journal filter already exists**
    (`walletJournalFilter.ts`). "A view of entries with ref_type X" is
    usually a saved filter, not new capability — but a *projection* computed
    from a ref_type's history (e.g. skill-training payback) is not disposed
    of by this alone; check what's actually new. Killed: LP Store redemption
    ledger off `ref_type: lp_store`.
12. **A module's own header comment can be a settled decision.** Not every
    scope boundary lives in `docs/context/decisions/`. Killed: PI Advisor
    arbitrary-system search.
13. **A pre-investment calculator with no ESI ground truth is a maintenance
    trap.** Formulas resting on hand-transcribed community numbers (not
    SDE-derivable, no ESI fixture) go stale silently. Killed: Moon Survey /
    Metenox Yield Estimator, Metenox ongoing fuel/yield ledger (also
    sub-slice-of-a-sub-slice reach: moon-owning corp leadership only).
14. **No bulk market-history endpoint.** ESI's market history is one type ID
    at a time — kills market-wide movers/trending dashboards; a bounded
    (Quickbar-scoped) version collapses into the existing Price History
    chart (kill-test 3).
15. **Every real route requires a Character.** `FEATURE_ROUTES` wraps every
    page in `RequireCharacter`/`ScopeGate` (`routeScopes.test.ts` enforces
    it); only `/login`, `/callback`, `/styleguide` are exempt, and none
    carry user/game data. A share-link/public-view candidate is the first
    thing that would break this pattern — narrow it to a hand-added route
    outside the map with its own exemption test, don't assume it's a
    drop-in extension (#831).

## Filed candidates

| #    | Verdict | Candidate                                                    |
| ---- | ------- | ------------------------------------------------------------- |
| #642 | NARROW  | Build Opportunity Finder — seeding tab over Build Plan Compare |
| #643 | NARROW  | Restock / reorder points                                      |
| #671 | NARROW  | Mining Yield Tracker — ordinary ore/ice                        |
| #672 | NARROW  | Appraisal refine-then-sell comparison                          |
| #679 | NARROW  | Build Opportunities — job-slot header count                    |
| #680 | SHIP    | Quickbar price alerts                                          |
| #689 | SHIP    | Appraisal multi-hub comparison                                 |
| #690 | SHIP    | Wallet balance-over-time chart                                 |
| #711 | SHIP    | Production Log realized-profit-over-time chart                 |
| #712 | SHIP    | Assets total portfolio value                                   |
| #713 | NARROW  | Open Orders sell-through column                                |
| #717 | SHIP    | Contracts market-value appraisal                                |
| #718 | NARROW  | Loyalty Store cross-corp offer list                            |
| #722 | NARROW  | Build Opportunities unowned-blueprint coverage                 |
| #725 | SHIP    | PI Production Run/Log                                          |
| #726 | NARROW  | Quickbar → Appraisal multi-hub handoff                          |
| #730 | NARROW  | Price History 7-day moving average                             |
| #819 | NARROW  | Build Opportunities market-wide finder, ownership-agnostic     |
| #821 | NARROW  | Industry job-slot utilization chart over time                  |
| #822 | NARROW  | Skills: Industry Skill ROI panel (job-slot skills only)         |
| #824 | NARROW  | Production Run realized tax/fee/margin breakdown, per-run       |
| #826 | NARROW  | Contracts: courier reward-per-m3/jump/collateral ratio, detail modal only |
| #827 | SHIP    | Skills: Market Fee Skill ROI panel (Broker Relations/Accounting) |
| #831 | NARROW  | Appraisal shareable link — typeId:qty payload, recompute-at-both-ends, byte-capped, unauthenticated route outside ScopeGate |

## Killed / dropped candidates (never filed)

| Candidate | Reason |
| --- | --- |
| Hub arbitrage / trade route finder | Ships as `hubHaulGaps`; kill-test 1, re-confirmed 3x. |
| System cost index watch | Kill-test 5. |
| Corp ore buyback / fleet payout split | Kill-test 1. |
| Skill Extractor ISK/hr comparison | Narrow reach (multi-account SP arbitrage). |
| Market/order-book depth chart | Kill-test 3. |
| Public item-exchange contract deal browser | Kill-test 6 (ADR 0013 at full scale). |
| Price history %-change headline stat | Thin-volume days make a naive delta unreliable. |
| Corp Wallet: balance chart to corp divisions | Narrow (Accountant-only); deferred. |
| Build Plan material row → PI colony link | Colony cache is Dexie-only, cold for most players. |
| EVE Forge-style Gantt production scheduling | Kill-test 3. |
| Bulk relist / buy-queue automation | Kill-test 2. |
| EQM Corporate Exchange | Kill-test 1. |
| Asset staleness / idle-inventory detection | Kill-test 7. |
| Player-structure pricing for Build Plans/Appraisal | Kill-test 9; widens a union for a minority. |
| Total Assets Value chart over time | Kill-test 8 (rescoped from #712). |
| Production Run: link material cost to wallet purchases | Kill-test 10 (buy side). |
| LP Store redemption ledger / ROI tracking | Kill-test 11; needs fragile free-text parsing. |
| LP transaction log / API-visible LP cashout audit | ESI has no LP transaction log. |
| PI Advisor: arbitrary-system search | Kill-test 12. |
| Multi-hop reaction-chain profitability | Kill-test 6 (round 27 BOM-rollup rejection). |
| Pure station-trading FIFO P&L tracker | Kill-test 10, extended to pure trading. |
| Public contract sell-advisor for manufactured goods | Kill-test 6 (ADR 0013). |
| Moon Survey / Metenox Yield Estimator | Narrow reach + kill-test 13. |
| Metenox Moon Drill ongoing fuel/yield ledger | Narrow reach + kill-test 13. |
| Market Movers / Trending Items dashboard | Kill-test 14. |
| Working Capital Locked in the Pipeline stat | Kill-test 3; job cost is fee-only, not materials. |
| PI Colony Layout Template (save/reuse pin layout) | Superseded by Advisor's per-planet fitted plan. |
| Upwell Fuel Monitor-style structure fuel tracker | Already covered — `structureFuel` in corp board. |
