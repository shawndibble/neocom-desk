# Survey ledger

What `/add-missing-features` knows about the third-party EVE tool ecosystem and
Neocom Desk's own coverage. A **reference for the next run**, not a run log:
updated in place, never appended to. Read it in step 1, curate it in step 7,
keep it near ~150 lines. Delete run metadata on sight.

## Tools surveyed

Gap-analysed at least once; dedup before spending a slot.

Adam4EVE, Ravworks/Slipway, EVE Tycoon, Janice, EVE Appraisal, Iron Whales
Appraiser (every piece gated — see Killed), EVE Blue Desk, SolCore Dynamics, EvE
Blueprint, EVE Courier, Fuzzwork, EVE Ref, EVE Retroindustry, ISK.GG, EVE Miner
Hub, EQM, EveLens, EVE Horizon, EVE Forge, EVE-Industry-Scanner-Tool, EVE-HUB,
EVE TradeLooper, EVE Night Trade Tools, IndustrialEVE (PI alerts fully covered —
kill-tests 12 and 17, #956), jEveAssets, EVEAIO, MONW, Mudoteve, Solo Industry
App, ArmedATLAS V2, PlanetFlow.APP, Cradle of War, EVE Balance, EVE Data Site,
PIM, EVE PI Manager, Web-based PI Tracker, JitaStocks, Indeve, EVE Fleet Mining
& Ratting Tool, FW LP Store cart tool, EWT PI Tools ("User Planets" is the
Advisor worklist), EVE ONE, EVE Buddy, Dr.MoonGoo, CLI Metenox Calculator, Eden
Buyback, Evernus, GESI, Lazy Blacksmith, EVE Orchestra, Alysii's PI Scheme, EVE
Planetary Planner, Upwell Fuel Monitor, Quantum Anomaly (surfaced #1040), ETM
v2, AllianceAuth Market Manager, EVE Tycoon MCP server, Uedama Scout (#1043),
EVE Metro, EVE Crews (cleared: a lore roleplay crew layer, no
industry/manufacturing/market/wallet endpoint — out of remit despite the
category's top post count, 185), EVE-NAV (nav.ceve.cc, live: a 3D capital/JF
jump planner; DOTLAN and Compass already cover this, so incremental).

**Three classes are closed, and with them the ecosystem has no untested class
left**; a sweep's job is to notice a tool fitting none of them. (1) _Web
industry planners_ (kill-test 6): eveindustry.app, EVE Cookbook, EveIndy,
eveindustryplanner.com, eve-industry.org, eveonline-industry.com, EVE OS
Industry, calculator.city, Eve Nexus, dev-eve.lothriell.com,
angrytiki/eve-industry-tracker. (2) _Bulk appraisal_ (Appraisal does this and
more): Goonpraisal, Fuzzwork's Evaluator, EVE Workbench, dd24tool.de. (3)
_Market/trading discovery_ (kill-tests 10, 1 and 3): theoz.space, Adam4EVE's
margin finder, evetools.dev, evetrade.space, EVE Workbench's Trade Tool, EVE
OS's Screener, Oracle Market Genius, Trading Matrix, EveBoosters.com, ETT.
All-in-one companion apps are the same closed set, their non-pipeline extras
dropping on **remit**: EVE Online Tooling, EVE Tools Suite, EVE Console, Koru
Desktop, EveTogether, ECT EVE Assets, Pod, EVE Empire, Esparto Industries, EVE
Motor Market, Capsuleers.app/eHub, ISKONOMY, Vigilant, EVE Flipper.

**The only open axis found is eventing/actuation, not calculation** — the three
closed classes are all calculators. EVE Market Order Assistant (forum 505014,
mega.nz, 300M ISK/char/mo) hotkeys the market window open on the next order
needing a reprice and clipboards a price: liveness unverifiable, in-client
actuation is kill-test 2, and the forum's "Grey Zone Automation" thread makes it
contested TOS ground. EVE Contract Bot (evecontractbot.space, forum 510398, 25M
ISK/char/mo) pushes contract accept/complete/fail to Discord — dead, TLS cert
expired; prior art behind #1091.

**CapsuleerKit (capsuleerkit.com) is a tool DIRECTORY, not a tool** — the
cheapest non-forum discovery source, and **spent**: everything on it is above.

Survey method, all still current:

- The forum category JSON paginates (`more_topics_url`) — fetch pages 0 **and**
  1 minimum; 0-15 are surveyed, 16+ is older Q&A. **A bumped thread can carry a
  new feature**, so sort by `last_posted_at`. Last pass: Nexum shipped a
  capital Jump Planner (new for it, out of domain), EQM shipped a PI Production
  Calculator (covered — `pi/chain.ts` expands a target through the recipe graph
  and `pi/factoryBalance.ts` is the what-runs-out-first read), Iron Whales split
  Reprocessing out of Bulk Appraisal (class 2). Nothing else new.
- **The web-search leg is worthless — spend the budget on forum pages.** A
  targeted sweep returned zero beyond the forum.
- **The Services category (id 61, under Marketplace) is SWEPT and spent** —
  120 topics over 4 pages yielded one flag, and that one was already killed.
  It is structurally hostile: buyback programs, freight, wormhole real estate,
  corp admin and escrow are cross-player commerce, dead on kill-test 1, and the
  ~15 tool ads cross-posted there all land in closed classes 1-3. If it is ever
  re-read, sort by **pin/age, not recency** (the one payload was the oldest
  pinned thread) and read only two shapes: a service ad that publishes a
  multiplier or formula, and a WTB-a-tool post. Two WTB posts there asked for
  undercut alerts and a contract-accepted ping — both already shipped, which is
  useful confirmation rather than a lead.
- **Service pricing rules, checked and closed.** Buyback: Horizon Logistics is
  the only ad publishing its rule, "90% of Jita IV-4 highest buy" — that is
  Appraisal x 0.9, covered; every other program hides it behind a proprietary
  appraiser. Freight: only two published numbers across 120 topics, and every
  hauler either points at an off-site calculator or quotes on contact. Two
  shared conventions worth knowing: collateral is the Jita **sell** value of
  the cargo, and rate tiers gate on volume + collateral rather than route.
  **Do not build a directory of third-party rate cards** — they go stale the
  day a service reprices and the app then lies to the player.
- **A title is a weak classifier** — EVE Empire, Pod and ECT EVE Assets sat in
  the skim list and all carried a full industry surface. Treat these as
  unexamined, not cleared, and check any touching the ISK pipeline: EveWebMail,
  Wayfinder, Atlas, MISMAPS/MISKILLZ, Fly Safe, WHMapper, Socketkill, PEARL,
  EVE Hacking Simulator, Eve PvP Radar, EVE-O Preview, EVE Threat Checker, EVE
  Fit Assistant, SLH Local Scanner, EVE NewBro, EVE Link, EveHunter, Nicotine,
  HARUSPEX, icon server, Ascension Labs Libs, Z-S Overview Customiser, SMT Eve
  Map Tool, Eve-mentor-mcp, WarBeacon, Project Eden, EVE 3D MAP,
  @strata-eve/esi SDK, Eve Missile Analyst, Eve Ship Stats, Grey Zone
  Automation, EVE Intelligence Nexus, Eveswitcher, Insurgency Tools,
  Battlefield.Space. Cleared, non-ISK: Ministry of Pantoscopic Observance
  (intel desk calculator), Rangefinder (cyno routing), EVE OQM integration
  (dev-recruitment thread, nothing shipped), Nexum (wormhole chain mapper),
  Helm (plugin-first corp platform, no industry plugin exists), fleet-manager
  (in-fleet MOTD), EVE411 (intel + Local scan), Eve Skillsboard (skill browser
  for character sales), EVEMon Lives (EVEMon fork), W-Space Atlas (wormhole
  database), PATT (chat-log translator).
- **Cleared on kill-test 1, not on domain** — each DOES carry an economic
  surface, so the name alone will not re-clear it: ADAPT (its Internal Contract
  Market is a member exchange, the EQM Corporate Exchange shape), OpsCore v2
  (ore/loot buyback plus a payout ledger; assets/market/wallet are
  roadmap-only), EasyEve (loot split; its ISK/hr is ISKONOMY's remit exclusion,
  its trade routes are class 3).
- **Two roster names were phantoms.** "contract-monitoring Discord bot" IS the
  already-surveyed EVE Contract Bot. "EVE Nexus" is the _mobile app_ (dev
  Kuastro), not `eve-nexus.app` — now examined, and an EVE Empire/Pod-shaped
  broad ISK surface cleared item by item: watchlist price alerts are the
  Quickbar (#680), mining ledger is EVE Miner Hub, PI and job pushes are the
  IndustrialEVE entry, reprocessing is #672, LP is #718/#1050/#1068, injector
  value is EveLens. Its one differentiator is a native mobile fitting sim, out
  of domain.
- **Dead/unreachable, not gap-analysed:** EVE Panel, EVE GURU / Production
  Ledger, EveTerminal.io, Mining Timer Tool, EVE Hauling Advisor, EVE Market Pro
  (evemarketpro.org returns HTTP 530 — unclassifiable).

## Already covered — don't re-propose

**A closed issue is not proof** — a number alone can be an owner rejection. Grep
for the module or route.

- **Market**: undercut detection, order competition/health, full order book,
  owned-order hub gap (`hubHaulGaps`), variation/meta compare.
- **Appraisal**: single/multi-hub, refine-then-sell, contract-line value,
  reprocessing off the character's REAL skills (only the facility rate is
  assumed), shareable re-priced pile.
- **Industry**: realized profit, build-vs-buy, Build Groups/Opportunities
  (owned-blueprint ranking — covers Ravworks), Order Depth, job-slot count,
  owned-stock/Craft Sweep, Active Jobs by soonest, Production Log profit chart,
  price history + 7-day SMA, reactions as an `activity`, blueprint material
  calc.
- **PI**: stop-tier recommendation, fed/starved pins, reset-run batching,
  measured extraction rate, cross-colony coordination (ADR 0012), richness
  estimate + fitted plan for unbuilt planets; Advisor is a ranked worklist
  (#954/#960) with per-colony ISK/hr (#956), restart cadence (#959), pilot prefs
  (#955), time-to-full (#958), chain revenue.
- **Wallet/LP**: balance chart, corp division sync, ISK/LP ranking nets ISK
  cost, the `required_items` turn-in _and_ a build cost. **Assets**: portfolio
  value.
- **Open Orders**: sell-through, multi-char aggregation. **Quickbar**: price
  alerts, multi-hub handoff. **Mining**: moon-ore ledger tax tracking
  (renter-side only), ore/ice yield. **Corp Ops Board**: structure fuel clock.
- **Contracts**: item-exchange/auction value; Courier mode ships ISK/jump,
  ISK/m³, Reverse Lane, Endpoint Space, "From my region", Completion Risk, Going
  Rate bait detection.

**The "engine computes it, the UI never shows it" scan is SPENT** — every
exported `src/engine` field was checked against the whole app and accounted for.
The productive inverse is a surface drawing a conclusion the engine could
sharpen.

## Standing kill-tests

Numbering is stable — later runs cite these by number. Append, never renumber.

1. **Cross-player wall.** No cross-player ESI — kills arbitrage, buybacks.
2. **No write-scoped ESI** (`esi/registry.ts`) — kills relist, automation.
3. **Picture of data already on screen.** Killed: depth chart x2, Gantt.
4. **One caller ≠ covered** — the finding is a surface acting WRONG (#824).
5. **No historical ESI series** — kills cost-index-over-time.
6. **Settled scope wins** — check `docs/context/decisions/`, `.out-of-scope/`.
7. **Assets endpoint has no timestamp** — kills staleness/idle-inventory.
8. **Not in `pollDomains.ts` ≠ sampled.** Assets is page-visit-only.
9. **A scope wired for one feature isn't free for another**
   (`structureMarkets`).
10. **Materials are fungible** — kills FIFO cost reconstruction either side.
11. **`walletJournalFilter.ts` exists** — a ref_type view is only a saved
    filter.
12. **A module header comment can be a settled decision** if it ARGUES a
    boundary.
13. **A pre-investment calc with no ESI ground truth is a maintenance trap.**
14. **No bulk market-history endpoint** — kills market-wide movers/trending.
15. **Every real route requires a Character** (`FEATURE_ROUTES`, `ScopeGate`).
16. **`invTypes.volume` is assembled, not packaged** — narrows product volume.
17. **A PI pin's live state is untrustworthy or deliberately unread.**
18. **A badge is noise when most rows pass** — mark exceptions only (#1015).
19. **Shipped copy can promise what doesn't exist** — grep `en.json` (#1020).
20. **A baked SDE field that looks like the answer usually is not** — the claim
    this skill gets wrong most often. `stations.json`'s `typeId` is not station
    capability; `staStations.operationID` is, unread by `build-sde.mjs` (#1040).
21. **A shipped premise makes a decision stale — prove it moved** (#942/#1040).
22. **A prohibition's REASON is narrower than its title** (#946, #1043).
23. **Check what the ADJACENT cell is computed from** — unify sources (#1043).
24. **A decision can scope ITSELF** (mirror of 22) — read the LAST bullets.
25. **Bound error against the DECISION MARGIN, not the total** (#1048).
26. **A counterfactual must be an action available AT THAT VENUE.**
27. **Fees are a fault line — check every ISK figure.** Right in `buildVsBuy`,
    `ownedStockSale`, `orderExits`; absent in `makeOrBuy`; wrong in #1050/#1051.
28. **A stale code comment can send a run down a dead end** — check the fact.
29. **Before "the SDE has no mapping", search `market/attributes.json`**
    (#1058).
30. **Character coverage is a fault line** — resolve inputs per ROW (#1062).
31. **Check the ACTION, not just the number, on another's row** (#1061).
32. **"Already fetched" means the FETCH OPTIONS, not the endpoint.**
33. **The ESI-boundary scan is SPENT** — unread fields accounted for (#1065).
34. **The i18n scan works only for keys that RENDER** — match `t('key')`
    (#1020).
35. **The "read in exactly one place" scan is NOISE — do not run it.**
36. **Industry/market CONSTANTS are verified — stop re-checking.** Structure
    ME/TE/cost 2600/2602/2601 (Tatara 2721), rig ME 2594, TE 2593, security
    2355/2356/2357, reactor rigs 2714/2713. Un-checkable: SCC 4%, NPC facility
    tax 0.25%, 100 ISK broker minimum; the 50% refine base is disclosed.
37. **Advanced Industry does NOT apply to reaction time, rightly excluded.**
38. **Mining forum REPLIES isn't worth its own scan** — fold into bumped
    threads.
39. **Mining `docs/context/decisions/` broadly is low-yield** (#537, #538).
40. **`.out-of-scope/`'s reasons are re-checked; both files are done.**
41. **A snapshot's per-row field can mean something other than the row** —
    `price: contract.price` is the CONTRACT's, read as the BLUEPRINT's; a
    symmetric error turns systematic under a min()/max() reduce (#1076).
42. **`functions/` (Firebase) is swept** — #1076/#1080 came from it.
43. **Ask any publisher:** what does it DROP? which field is the PARENT's?
44. **Ask for a COLD READ after your own small sweep** (#1080, #1084).
45. **`scripts/` is swept; `build-sde.mjs` is exemplary** — its defects
    (#1084, #1085) share one shape: a baked field narrower than consumers
    assume.
46. **A proxy is not a measurement — name the property, then test it** (#1085).

## Filed candidates

**Verdict is the hostile review's, not the ticket's fate.** `SHIP` means the
reviewer cleared it, never that Shawn accepted it — #858 carries `SHIP` and was
closed "the quickbar already has enough". Check `gh issue view <n> --comments`.

**Owner-rejected — do not re-pitch without new evidence:** #643 restock/reorder
points ("no current users are asking"); #722 unowned-blueprint coverage (build
cost); #725 PI Production Run/Log (no PI cost basis — kills PI realized-profit
tracking generally); #822/#827/#925 Skill ROI panels; #858 Quickbar unrealized
P&L vs. a typed cost basis.

**Shipped or closed clean:** #671, #672, #679, #680, #689, #690, #711, #712,
#713, #717, #726, #730, #831, #874 — all in "Already covered" above.

**Open, unsequenced** — read each with `gh issue view`: #642, #718, #819, #821,
#824, #826 (superseded by Courier mode), #880 (needs a human ESI check), #926,
#1015, #1017, #1018, #1026, #1040, #1043, #1061, #1062, #1065, #1074, #1076,
#1080.

**Open, ordered.** #1048 (refine-vs-sell compares whole-batch refine against
full-quantity sell) **before** #1058 (reprocessing specialisation modelled three
ways; attribute 790 names the right one). #1050 (LP net profit / ISK per LP are
GROSS; 61 offers shown profitable are losses) **blocks** #1068 (30.3% of offers
demand a turn-in `offerProfit` subtracts and the `<dl>` never shows). #1051
(market-wide `iskPerHour` nets no tax, broker or job fee) **blocks** #1084
(`marketWideTrees.json` bakes the TOP blueprint's `time`). Unblocked: #1085
(assembled volume on hull material lines).

**New.** #1091 NARROW — contract notifications announce completion and failure,
not just acceptance; every status is stored but only the edge into `in_progress`
is diffed. Two events, silent on rejected/cancelled/deleted/reversed, gated on a
known-live prior status and on the character being issuer or acceptor (the
endpoint also returns contracts merely offered TO them),
feed-on/browser-off. #1092 bug — an accepted courier's Character Board countdown
shows the offer expiry, not `date_accepted + days_to_complete`; symptom is
UNDER-warning.

## Killed / dropped candidates (never filed)

Grouped by the test that killed them; the reason is what stops a re-pitch.

- **1**: hub arbitrage/trade finder (ships as `hubHaulGaps`), corp
  buyback/payout split, EQM Corporate Exchange, dd24tool.de, Element43 and
  EveMarketProphet (dead), Space Trucker / EVE Flipper route sequencing (also
  14), Vigilant, OCR appraisal (the client already copies exact text). **2**:
  bulk relist / buy queue; the keybind-and-clipboard reprice helper
  (`orderFloor.ts` already shows the relist price). **3**: depth chart, EVE
  Forge Gantt, Working Capital Locked, EVE Motor Market build-tree viz, Open
  Orders slot ceiling. **5**: cost-index watch. **6**: multi-hop reaction
  chains; public contract browser and sell-advisor (ADR 0013, twice);
  corp-placed order split (+24 — **residue:** `watchCandidates` books a corp
  sell as personal profit; a "Corp" chip, not exclusion). **7**: asset
  staleness. **8**: Appraisal Portfolios' chart half. **9**: player-structure
  pricing incl. Iron Whales' nullsec markets; Order Floor standings in the
  broker fee (re-confirmed: `fees.ts` implements the standing terms and
  `orderFloor.ts` accepts them, but nothing populates either and
  `read_standings` is not in the scope set, so the app always shows the
  standing-0 fee. USIA has sold standings-raising for 17 years off exactly this
  formula, so demand is real — the kill is the scope plus unbuilt consent UI
  against a <=0.5pp swing, and that has not changed. Do not re-pitch it as new). **10**: station-trading FIFO P&L, Production Run cost from wallet
  purchases, EVE Motor Market's trade journal. **11**: LP redemption ledger (ESI
  has no LP transaction log). **12**: PI Advisor arbitrary-system search;
  Records tab unlink/unwatch. **13**: Moon Survey / Metenox estimator and ledger
  in any framing (filed as #859, closed on rediscovering this — do not re-file);
  EQM HyperNet. **14**: Market Movers. **16**: Build Plan product volume + haul
  distance (+3); pricing that haul at the courier corpus' going rate (a median
  is scale-dependent — an outlier detector, not a quote). **17**: PI haul-out
  volume, misrouted-factory alert, colony staleness (+4), Advisor buffer
  headroom, `ColonyFit.limitedBy`. **24**: `refineUnitsLeftOver` (#1048 is the
  real defect beside it), Compare Hubs unpriced disclosure (+26; each hub's
  total is correct), skill-reduced job time as denominator (+12; folded
  into #1051), Production Log double-sale detection (no join key — **watch:** an
  ESI order↔transaction correlation makes the FIX proposable). **32**:
  Production Run using `IndustryJob.cost` (no job id).
- **On remit, not a kill-test:** "can this character fly this fit" (EVE Empire —
  PvP/PvE; distinct from #1015); Compass and EVE-NAV capital jump planning (a
  second account plus a multi-billion hull, no ISK-pipeline leg); Eve Supply
  Chain (closed planner class); EVE MCP Server (developer infrastructure);
  Abyssal pricing (`unpricedRows` flags them); Skill Extractor ISK/hr; Corp
  Wallet chart by division (Accountant-only).
- **On merit:** Skill ROI in any framing incl. the owner's invited re-frame — no
  realized ISK/hr per job exists. Cross-plan material reservation and LP
  required-item re-pricing — `20260909-212724-group-ownership-overlay` rejected
  an allocation solver outright. Hand-entered cost basis with no linked run — a
  per-unit average over fungible lots. Per-order undercut timeline — narrowed
  to #1018. BPC price-trend badge and contract-derived pricing — need
  server-side retention for a gameable payoff overlapping #926. Hauler
  trip-count estimator — an unverifiable typed number relabeled. Price-history
  %-change stat — thin-volume days. Build Plan → PI colony link — Dexie-only
  cache. Mining-ledger opportunity finder — the shape of #819. PI Colony Layout
  Template — superseded by the Advisor's fitted plan. Reopening research/copying
  (~10 researched BPOs region-wide) and invention (gated on reversing
  BOM-rollup). No-buyout auction exclusion — 0 of 8,000 live Forge contracts.
  Reprocessing implant — false precision against a labelled 50% assumption.
  Housekeeping only: Mining Yield's `specialisationLevel: 0`, dead i18n keys.
- **Order-problem alerts** (undercut / below-floor; prior art Iron Whales'
  undercut watcher, EVE Night Trade Tools) — two decisions stack: the Open
  Orders worklist decision defers order-problem alerts to a later PR, and the
  notification-catalog decision made `marketOrderFilled` feed-only, so an
  undercut can only ever be a feed row duplicating the Open Orders page.
  Detection also needs competitor prices, which the page's eager/on-demand split
  exists to avoid. Only revival shape: `belowFloor` alone,
  Production-Run-linked, station scope, feed-only — after the cost-basis work.
