# Survey ledger

What `/add-missing-features` knows about the third-party EVE tool ecosystem and
Neocom Desk's own coverage. A **reference for the next run**, not a run log:
updated in place, never appended to. Read it in step 1, curate it in step 7,
keep it near ~150 lines. Delete run metadata on sight. When a section grows,
compress it (names over narrative, the reason over the story) instead of adding.

## Tools surveyed

Gap-analysed at least once; dedup before spending a slot. `(#n)` = ticket it
surfaced.

**Live, pipeline-relevant (all covered unless a ticket is named):**
eve-exchange.com (#5002), Eve-Omnitool (#5134), EVE Motor Market / MoMa
(#3985–#3995), EVE Ledger (#3908–#3910), EVE Farm (#5127, #5128), EVE Console
(#4530), EVE Market Tool, ForgeWire (#4550), JitaSpace, EVE-NAV, Missioneers'
Atlas (LP finder = #718/#1050/#1068), IndustrialEVE (PI alerts: kill-tests 12,
17, #956), EWT PI Tools ("User Planets" = Advisor worklist), Pod Warden (ADR
0020), EVE Nexus (mobile; EVE Empire/Pod-shaped, cleared item by item),
Adam4EVE, Ravworks/Slipway (Jobs view = Active Jobs), EVE Tycoon, Janice
(#4022), EVE Appraisal, Iron Whales Appraiser, Fuzzwork, EVE Ref, EveLens
(#5006), jEveAssets, Evernus, GESI, Dr.MoonGoo, EVE Horizon, EVE Forge,
EVE-HUB, RIFT (desktop; wallet Insights, asset filters, What's new list v2.2–6.2 read in full; #5601, #5602, #5605), EVE Industry Scanner Tool (#5007), Blizbor's skill trio (#2390; no
licence, data unusable), Quantum Anomaly (#1040), Uedama Scout (#1043).

**Examined, nothing left:** EVE Blue Desk, SolCore Dynamics, EvE Blueprint, EVE
Courier, EVE Retroindustry, ISK.GG, EVE Miner Hub, EQM, EVE-Industry-Scanner,
EVE TradeLooper, EVE Night Trade Tools, SquadB Excel workbooks (EVE Online
Excel Workbook v1.6, EVE Market Analysis v1.1; CCP's Excel add-in), TradeRelay, EVEAIO, MONW, Mudoteve,
Solo Industry App, ArmedATLAS V2, PlanetFlow.APP, Cradle of War, EVE Balance,
EVE Data Site, PIM, EVE PI Manager, Web-based PI Tracker, JitaStocks, Indeve,
EVE Fleet Mining & Ratting Tool, FW LP Store cart tool, EVE ONE, EVE Buddy,
CLI Metenox Calculator, Eden Buyback, Lazy Blacksmith, EVE Orchestra,
Alysii's PI Scheme, EVE Planetary Planner, Upwell Fuel Monitor, ETM v2,
AllianceAuth Market Manager, EVE Tycoon MCP server, EVE Metro, EVE Omni,
Canopus, Eve Deep Industry, SNOW//OPS, New Eden Command, eve-hub.ru,
Telescope, EVE Killmap, The Bounty Bid, PI Nexus, sde-deltas, Gatewatch, EVE
PvP Corp Activity Search, Forge Ledger, New Eden Trade, Keystar, AstraCore,
evehelper.pages.dev, eve-webtools PI, LedgerParser, IntelParser and Fitlab (roadmap.json and changelog.json per app; every item shipped here or killed: mining history = 90-day overview, PI alerts/forecast/ISK-hr = Advisor, Local threat/Pilot lookup, fit cost + Improve). EVE Crews (lore roleplay layer, no
market endpoint) and Isktracker Incursions (non-pipeline) are out of remit.
Weak gaps noted, never filed: J-space class/effect/statics in Place Info
(Anoik.is, ellatha.com); a downtime-vs-ESI-outage stale-data line
(eve-offline.net).

**Unconfirmed lead:** New Eden Trade says it reads CCP's "Safety Tax" from the
wallet journal. Nothing in our code models it; verify the ESI journal ref type
before pitching.

**Dead or unreachable:** EVE Panel, EVE GURU / Production Ledger,
EveTerminal.io, Mining Timer Tool, EVE Hauling Advisor, EVE Market Pro (HTTP
530), scan.eveonline.it (503). Reddit returns 403.

**Remit (#2328, decision `20260929-234357`):** intel and travel tools are in
scope: route safety, Thera/Turnur connections, pilot lookup. "Intel" alone no
longer clears a tool. Client-reading intel (Local scan, DScan) still dies on
kill-test 2.

**Three classes are closed**; a sweep's job is to notice a tool fitting none:

1. _Web industry planners_ (kill-test 6): eveindustry.app, EVE Cookbook,
   EveIndy, eveindustryplanner.com, eve-industry.org, eveonline-industry.com,
   EVE OS Industry, calculator.city, Eve Nexus, dev-eve.lothriell.com,
   angrytiki/eve-industry-tracker.
2. _Bulk appraisal_ (Appraisal does it and more): Goonpraisal, Fuzzwork
   Evaluator, EVE Workbench, dd24tool.de.
3. _Market/trading discovery_ (kill-tests 10, 1, 3): theoz.space, Adam4EVE
   margin finder, evetools.dev, evetrade.space, Oracle Market Genius, Trading
   Matrix, EveBoosters.com, ETT. All-in-one companion apps are the same set,
   their extras dropping on remit: EVE Online Tooling, EVE Tools Suite, Koru
   Desktop, EveTogether, ECT EVE Assets, Pod, EVE Empire, Esparto Industries,
   Capsuleers.app/eHub, ISKONOMY, Vigilant, EVE Flipper.

**The only open axis is eventing/actuation, not calculation.** EVE Market
Order Assistant (hotkeys the next reprice; kill-test 2, contested TOS) and EVE
Contract Bot (dead; prior art for #1091) are the only examples.

**Survey method:**

- **GitHub is swept** (520 repos, 58 queries): ~40% planners, ~25% screeners,
  ~15% ESI libraries, ~15% killboard/intel, a dead tail. Re-sweep only on
  **new-expansion vocabulary**, within ~6 months of a release (query the
  expansion's mechanic nouns). The web-search leg is worthless.
- **Forum category JSON** paginates (`more_topics_url`): fetch pages 0 **and**
  1 minimum, sort by `last_posted_at` (a bumped thread can carry a new feature).
  Individual tool threads (`/t/<id>.json?print=true`) list every update post.
- **Services category (id 61) is swept and spent**: buyback, freight and
  wormhole real estate are cross-player commerce (kill-test 1). Do **not**
  build a directory of third-party rate cards; they go stale and the app lies.
- **A title is a weak classifier.** Unexamined, not cleared: EveWebMail,
  Wayfinder, Atlas, MISMAPS, WHMapper, Socketkill, PEARL, Eve PvP Radar, EVE
  Fit Assistant, EVE Link, EveHunter, Eveswitcher, Insurgency Tools, Project
  Eden, Eve Ship Stats. Cleared as non-ISK before #2328 (re-check route
  safety, Thera or pilot lookup): Rangefinder, Nexum, Helm, EVE411, W-Space
  Atlas. Cleared on kill-test 1, not domain: ADAPT, OpsCore v2, EasyEve.
- **CapsuleerKit (capsuleerkit.com)** is a directory and is spent.

## Already covered — don't re-propose

**A closed issue is not proof**; a number alone can be an owner rejection. Grep
the module or route, in `GLOSSARY.md` vocabulary, on `origin/develop`.

- **Market**: undercut detection, order competition/health, full order book,
  hub gap (`hubHaulGaps`), variation/meta compare, Open Orders (sell-through,
  multi-char, outbid suggested price, work-through), Quickbar price alerts,
  Sold/day (`dailySales`), public structure markets (opt-in `structureMarkets`
  scope, decision `20260906-203425`).
- **Appraisal**: single/multi-hub, refine-then-sell off the character's REAL
  skills (facility rate assumed), contract-line value, shareable pile, saved
  shopping lists minus owned with hold-fit (#2868, #2931), Copy sell list.
- **Industry**: realized profit, build-vs-buy, Build Groups/Opportunities and
  Market-Wide (ranking covers Ravworks and Omnitool "What to build"), "All
  owned" blueprint library (#2335), Order Depth, job slots, owned stock/Craft
  Sweep, Active Jobs, Production Log chart, price history + 7-day SMA, reactions
  as an `activity`, blueprint material calc, `oreDecision` (owned ore).
- **PI**: stop-tier recommendation, fed/starved pins, reset-run batching,
  measured extraction rate, cross-colony coordination (ADR 0012), richness
  estimate + fitted plan, Advisor worklist (#954/#960) with ISK/hr (#956),
  restart cadence (#959), time-to-full (#958); `pi/chain.ts`, `factoryBalance.ts`.
- **Wallet/LP/Assets**: balance chart, corp divisions, ISK/LP nets cost and
  `required_items`, portfolio value. **Mining**: ISK/m³ survey (#3222, #2160),
  moon-ore ledger tax (renter-side), ore/ice yield. **Stock**: `/market/stock`
  (Stock Targets; #643 was rejected first). **Corp Ops Board**: fuel clock.
- **Contracts/Courier**: item-exchange/auction value; ISK/jump, ISK/m³,
  Reverse Lane, Endpoint Space, Completion Risk, Going Rate bait detection.
- **Travel**: Hauling Trip Plan (`haulPlan.ts`, multi-stop), waypoints, route
  safety, Thera/Turnur, Ansiblex legs.
- **Skills**: plan import (Append/Replace dedupes), EVEMon/EFT/queue import,
  remap optimizer, masteries with "Add tier to plan", Skill Detail unlocks
  (#400), Skill Compare, Alpha caps.

**The "engine computes it, the UI never shows it" scan is SPENT.** The
productive inverse is a surface drawing a conclusion the engine could sharpen.

## Standing kill-tests

Numbering is stable; later runs cite these by number. Append, never renumber.

1. **Cross-player wall.** No cross-player ESI; kills arbitrage, buybacks.
2. **No write-scoped ESI** (`esi/registry.ts`); kills relist, automation.
3. **Picture of data already on screen.** Killed: depth chart x2, Gantt.
4. **One caller ≠ covered**; the finding is a surface acting WRONG (#824).
5. **No historical ESI series**; kills cost-index-over-time.
6. **Settled scope wins**: `docs/context/decisions/`, `.out-of-scope/`.
7. **Assets endpoint has no timestamp**; kills staleness/idle-inventory.
8. **Not in `pollDomains/` ≠ sampled.** Assets is page-visit-only.
9. **A scope wired for one feature isn't free for another** (`structureMarkets`).
10. **Materials are fungible**; kills FIFO cost reconstruction either side.
11. **`walletJournalFilter.ts` exists**; a ref_type view is only a saved filter.
12. **A module header comment can be a settled decision** if it ARGUES a boundary.
13. **A pre-investment calc with no ESI ground truth is a maintenance trap.**
14. **No bulk market-history endpoint**; kills market-wide movers/trending.
15. **Every real route requires a Character** (`FEATURE_ROUTES`, `ScopeGate`);
    a logged-out-only tool dies here, a travel/intel tool behind sign-in is on remit.
16. **`invTypes.volume` is assembled, not packaged**; narrows product volume.
17. **A PI pin's live state is untrustworthy or deliberately unread.**
18. **A badge is noise when most rows pass**; mark exceptions only (#1015).
19. **Shipped copy can promise what doesn't exist**; grep `en.json` (#1020).
20. **A baked SDE field that looks like the answer usually is not** (the claim
    this skill gets wrong most). `stations.json` `typeId` is not capability;
    `staStations.operationID` is, unread by `build-sde.mjs` (#1040).
21. **A shipped premise makes a decision stale**; prove it moved (#942/#1040).
22. **A prohibition's REASON is narrower than its title** (#946, #1043).
23. **Check what the ADJACENT cell is computed from**; unify sources (#1043).
24. **A decision can scope ITSELF** (mirror of 22); read the LAST bullets.
25. **Bound error against the DECISION MARGIN, not the total** (#1048).
26. **A counterfactual must be an action available AT THAT VENUE.**
27. **Fees are a fault line**; check every ISK figure. Right in `buildVsBuy`,
    `ownedStockSale`, `orderExits`; absent in `makeOrBuy`; wrong in #1050/#1051.
28. **A stale code comment can send a run down a dead end**; check the fact.
29. **Before "the SDE has no mapping", search `market/attributes.json`** (#1058).
30. **Character coverage is a fault line**; resolve inputs per ROW (#1062).
31. **Check the ACTION, not just the number, on another's row** (#1061).
32. **"Already fetched" means the FETCH OPTIONS, not the endpoint.**
33. **The ESI-boundary scan is SPENT** (#1065).
34. **The i18n scan works only for keys that RENDER**; match `t('key')` (#1020).
35. **The "read in exactly one place" scan is NOISE**; do not run it.
36. **Industry/market CONSTANTS are verified; stop re-checking.** Structure
    ME/TE/cost 2600/2602/2601 (Tatara 2721), rig ME 2594, TE 2593, security
    2355/2356/2357, reactor rigs 2714/2713. Un-checkable: SCC 4%, NPC facility
    tax 0.25%, 100 ISK broker minimum; the 50% refine base is disclosed.
37. **Advanced Industry does NOT apply to reaction time**, rightly excluded.
38. **Mining forum REPLIES isn't worth its own scan**; fold into bumped threads.
39. **Mining `docs/context/decisions/` broadly is low-yield** (#537, #538).
40. **`.out-of-scope/` reasons are re-checked; both files are done.**
41. **A snapshot's per-row field can mean something other than the row**:
    `price: contract.price` is the CONTRACT's; a min()/max() reduce makes the
    error systematic (#1076).
42. **`functions/` (Firebase) is swept** (#1076/#1080).
43. **Ask any publisher:** what does it DROP? which field is the PARENT's?
44. **Ask for a COLD READ after your own small sweep** (#1080, #1084).
45. **`scripts/` is swept**; `build-sde.mjs` defects (#1084, #1085) share one
    shape: a baked field narrower than consumers assume.
46. **A proxy is not a measurement**; name the property, then test it (#1085).
47. **A rate divided by a guessed duration is a typed-in estimate**; show
    per-day totals (`20261006-085420`).
48. **The public contract snapshot drops asked-for lines** (only PLEX survives
    as `requestedPlex`); value-vs-asking ranking ranks item-swap bait first
    until #3986's `requestsItems` flag lands.

## Filed candidates

`SHIP` is the hostile review's verdict, not the ticket's fate (#858 carried
`SHIP` and was closed). Check `gh api repos/shawndibble/neocom-desk/issues/<n>`.

- #5601 NARROW Assets Items: Category/Group filter + Blueprint copies toggle (RIFT's All/Any builder, saved filters, meta/tech/volume dropped). #5602 NARROW Wallet Journal: counterparty filter from a line (RIFT's top-counterparties rollup left as a human decision; the drill is the interesting part). #5605 NARROW Assets-only place nicknames (app-wide killed: no shared place renderer; resolver injection leaks to Communities' library push).
- #5327 NARROW Build Plan "input costs moved in 7d" line (EveBoosters
  Material Influence Explorer, Build Plan only).
- #5134 NARROW Build Plans "Buy ore instead": compressed ore bought and
  refined vs buying minerals, cheapest/lightest only (Omnitool, MoMa).
- #5128 NARROW Net worth "In contracts" layer (EVE Farm). #5127 NARROW LP Store
  Sells/day column (EVE Farm). #5007 SHIP Sale Profitability on a Sell-now basis.
- #5006 NARROW Skills "Who's closest" (EveLens #137). #5002 NARROW Overview
  Market Trend widget (eve-exchange). #4736 NARROW Transactions missing-margin
  reason + uncosted-revenue total. #4550 NARROW Fitting set, netted shortfall.
- #4530 NARROW Corp Projects tab (EVE Console). #4022 NARROW Appraisal reads
  grouped quantities (Janice).
- MoMa batch, ready-for-agent by owner override: #3991 Open Orders
  work-through, #3985 slot-aware schedule (#3988 splits, ready-for-human),
  #3992 group claims, #3993 order-book walk, #3986 → #3989 below-market
  contracts, #3994 vs 90d, #3995 History totals, #3987 → #3990 invention as a
  Blueprint Acquisition tier.
- Earlier NARROWs: #3791 Market-Wide invention note, #3792 fit-diff on hover,
  #3793 Assets copy with quantities, #3796 Local "new since last paste", #3797
  contract-expiry alerts, #3798 History "By item", #2390 Certificates tab,
  #1091 contract completion/failure notices, #3908 Where the ISK went panel
  (#3914 daily chart, #3915 phone rows), #3910 "Your Characters" fit stats.
  #3909 SHIP wallet archive. #1092 bug: courier countdown shows offer expiry.

**Owner-rejected, do not re-pitch without new evidence:** #643 restock points;
#722 unowned-blueprint coverage; #725 PI Production Run/Log (no PI cost basis);
#822/#827/#925 Skill ROI panels; #858 Quickbar unrealized P&L vs typed cost.

**Open ordering:** #1048 before #1058; #1050 blocks #1068; #1051 blocks #1084.
Other open: #642, #718, #819, #821, #824, #880, #926, #1015, #1017, #1018,
#1026, #1040, #1043, #1061, #1062, #1065, #1074, #1076, #1080, #1085.

## Killed / dropped candidates (never filed)

The reason is what stops a re-pitch. Numbers are kill-tests.

- **By kill-test.** **1**: hub arbitrage/trade finder (`hubHaulGaps`), corp
  buyback/payout split, EQM Corporate Exchange, dd24tool.de, route sequencing
  (also 14), OCR appraisal, structured WTS/WTB board (TradeRelay). **2**: bulk
  relist/buy queue, keybind reprice helper, Gamelog/Abyss timer/cargo watcher.
  **3**: depth chart, Gantt, Working Capital Locked, build-tree viz, Open
  Orders slot ceiling, hull demand board (needs a killmail ingest). **5**:
  cost-index watch, build-cost history series. **6**: multi-hop reaction chains;
  public contract browser/sell-advisor (ADR 0013); corp-placed order split
  (residue: `watchCandidates` books a corp sell as personal; a "Corp" chip).
  **7**: asset staleness. **8**: Appraisal Portfolios chart. **9**: player-
  structure pricing; Order Floor standings in the broker fee (`fees.ts` takes
  standings but `read_standings` is not in the scope set, so the fee always
  shows standing 0; kill is scope + consent UI against a ≤0.5pp swing).
  **10**: station-trading FIFO P&L, Production Run cost from wallet purchases,
  own-loss replacement matching. **11**: LP redemption ledger (no ESI log),
  journal activity groups. **12**: PI Advisor arbitrary-system search. **13**:
  Moon Survey/Metenox estimator in any framing (#859, do not re-file), EQM
  HyperNet, Omega self-funding (price in neither ESI nor SDE). **14**: Market
  Movers. **16**: product volume + haul distance; pricing the haul at the
  courier going rate. **17**: PI haul-out volume, misrouted-factory alert,
  colony staleness, buffer headroom. **24**: `refineUnitsLeftOver`, Compare
  Hubs unpriced disclosure, Production Log double-sale detection (watch: an ESI
  order↔transaction correlation makes it proposable). **32**: Production Run
  using `IndustryJob.cost`. **47**: ratting ISK/h, optimizer score, swing
  scanner.
- **EveBoosters.com** (28-video series, fully watched): 40 tools, every one
  maps to a built module or a closed class. **Market Seeding** (busy systems
  with no market): kill-tests 46, 3, 9, 16; premium unmeasurable, nothing
  per-station in ESI. **Manipulation Detector** (cornered supply): public
  orders carry no issuer, so "one seller holds N%" is a guess; book walk,
  `classifyOrderDepth`, `vs90d`, `sellThrough` already say the honest part.
  **Master List** (drift since ticked): #858 rejection, Market Trend widget.
  **Material Influence Explorer** market-wide: kill-test 14 (one history call
  per type), only #5327 survives. **Plot a Course** (kill-scored route):
  `routeSafety.ts`, decision `20260912-165245`. **PvP set** (Compare Targets,
  Wardec Targets, Hunting Grounds, PvP Overview, Live Killstream, Warzone
  Board, Universe Map): killmail crawl (1) or non-ISK. **Wormhole Finder**:
  the J-space weak gap above. **SP Market**, **PI Planner**, **Planet Finder**,
  **Where to Build**, **Industry**, **Appraisal**, **Station Trader**,
  **Margin Finder**, **Arbitrage**, **Swing**, **Trade/Wealth Planner**,
  **Watchlist**, **Skills order**: built (`20261007-191323`, `pi/`,
  `cheaperNearbySystems.ts`, Build Plan, Appraisal, closed class 3, Quickbar
  alerts, #822/#827/#925).
- **Reach (few players):** Equinox skyhook reagent/theft tracker (needs a corp
  role in a sov corp; `esi-structures` scope group missing, kill-test 9; 13
  does NOT apply, the first candidate to reopen if a sov-nullsec audience
  appears); Asset Consolidator and EVE Console buffer management (second-
  account/null scale); Metenox.
- **On remit:** "can this character fly this fit"; Compass/EVE-NAV capital jump
  planning; Eve Supply Chain; EVE MCP Server; abyssal pricing (`unpricedRows`);
  Skill Extractor ISK/hr; Corp Wallet by division; ship insurance lookup (a
  fixed fraction of hull value; the Production Log takes `insurancePayout`).
- **On merit:** Skill ROI in any framing; starter-plan library (rots on CCP
  reworks); Certificate grades in Skill Compare; lagging-skills audit; cross-
  plan material reservation (`20260909-212724` rejected an allocation solver);
  hand-entered cost basis; per-order undercut timeline (→ #1018); BPC price-
  trend badge; hauler trip-count estimator; price-history %-change; Build Plan
  → PI link; mining-ledger opportunity finder (#819); PI layout template;
  research/copying planning (`.out-of-scope/blueprint-job-planning.md`);
  invention planning (`.out-of-scope/invention-planning.md`, reopened as #3990);
  no-buyout auction exclusion; reprocessing implant (false precision); multi-
  format sale post (Appraisal Copy sell list covers it); "Need Hauling / Need
  BP" status; wallet top/flop and weekday heatmap; hauling top-routes list;
  quiet hours/digest (#2871); "still not fixed" reminders.
- **Assets/Appraisal leftovers:** CSV Value/Location columns (ESI average price
  only, `20260929-085650`); bay in search trails (label fix); "which of ALL my
  ships can pass" (#2906 shipped one); Market-Wide reliability popover (#3071);
  Janice seeds shipped (#33/#24/#48/#26/#25/#43/#44), ISK/m³ column and per-row
  exclude killed, compress-ore action (`20261006-185915`); copy in-game import
  format (shipped, `20260924-131419`).
- **Order-problem alerts** (undercut/below-floor): the Open Orders decision
  defers them and `marketOrderFilled` is feed-only, so an undercut can only be
  a feed row duplicating Open Orders; detection needs competitor prices. Only
  revival: `belowFloor` alone, Production-Run-linked, station scope, feed-only,
  after the cost-basis work.
- **Station-trading margin finder (same-hub Hauling mode)**, re-pitched after
  the R2 hub-books snapshot: still dead. History can't split buy-side from
  sell-side fills, so "units/day" for a two-sided flip is a guess; an hour-old
  book is useless for a 0.01-ISK war; one top-10 per hub for every user is the
  self-defeat `haulingMarket.ts`'s header argues against; spread/after-fees
  already ships (`compareMargin`, Compare drawer). Reopen only with per-minute
  books or a side-split fill series.
- **MoMa leftovers:** station-trading flip finder (no new tabs; Hauling's 3-pass
  scan if revived inline); compressed-ore buying as a facility-rate model
  (structure rates out, `20260906-180034`; #5134 is the narrowed shape); guided
  tutorial; merging the Group Owned Overlay into claims (`20260909-212724`).
- **EVE Market Tool:** "mined vs sold" gathered items (fungible ore), hand-
  entered pending-sale cost, extractor ICS feed (needs a server), HyperNet,
  abyssal roll scanner.
- **eve-exchange leftovers:** PLEX-only chart, ISK traded in PLEX, per-hub
  injector widget (InjectorFacts), free-form picker and indexed-to-100 chart.
- **Issue-tracker leftovers:** busy-blueprint-counts-as-owned (jEveAssets #516;
  we read `/characters/{id}/blueprints`, verify one live Character first);
  per-structure industry tax split, job-done digest, find Characters by
  capability, gas sell-vs-react, strip charges on EFT export (weak or covered);
  hauling cost in a Build Plan (rate cards go stale).
- **EVE Farm leftovers:** LP Purchases lots (journal row has no offer or
  quantity; matching is a guess, decision `20260924-001906`); LP per Day
  calendar (points cache ~1h, spend between reads invisible); In production
  net-worth layer (books profit before the sale); month-end item snapshots,
  Best-item tiles; Gamelog NPC kills, Abyss timer, aggro voice (client reads).
- **Eve-Omnitool leftovers:** Collection gaps (unowned blueprints per group:
  SDE-wide list, no decision value, collector minority); Hubs on route (thin
  filter over Hauling Trip Plan; cheap fix is hubs as optional Trip Plan
  stops); gate-camp check, D-Scan, live map (intel, kill-test 2).
- **IntelParser leftover:** per-pilot cyno/hot-drop/bait/FC chips on Local rows from zKillboard stats (non-ISK, thin; only revive if intel gets asked for).
- **Housekeeping only:** Mining Yield `specialisationLevel: 0`, dead i18n keys.
- **RIFT ratting rollup** (kills by faction/system, ISK per kill): per-line `BountyFactionSummary`/`killsByFaction` exists; a bounty line's ISK is shared across NPC types, so per-class ISK is an estimate. RIFT daily-goals tab: ref-type breakdown + `dailyGoalMessageIdOf` cover it. "Open ship in Fittings" from Assets: shipped (`assetShipLocation.ts`).
- **RIFT What's new leftovers:** freelance jobs (#4609), cost indices (`cheaperNearbySystems`), skyhooks, clones, LP totals = covered; PI time seek = kill-tests 3/17; intel, overlay, chat, combat/log alerts, settings copying, map markers = kill-test 2 (client-reading).
