# Survey ledger

What `/add-missing-features` has already looked at, and what it decided. Append
one section per run. The point of this file is that run N+1 does not re-propose
what run N killed.

## 2026-09-09

Source: the third-party developer forum category JSON, plus follow-up research
on each tool touching industry or marketing.

### Tools surveyed

| Tool                           | What it does                                                                     | Live |
| ------------------------------ | -------------------------------------------------------------------------------- | ---- |
| Adam4EVE                       | Market stats and graphs over time, PI profitability and chains, industry indices | yes  |
| Ravworks                       | Multi-item production planning, full material tree, ME/TE and facility bonuses   | yes  |
| EVE Tycoon                     | Profit tracking, order management, market browser, per-item stock                | yes  |
| Slipway                        | Industry planner framed as "what to build, where to build it, where to sell it"  | yes  |
| Janice / Iron Whales Appraiser | Bulk appraisal, ore reprocessing, live BPO/BPC contract pricing                  | yes  |
| EVE Blue Desk / EvE Blueprint  | Blueprint market and production platform                                         | yes  |
| EVE Courier                    | Route planning, gatecamp check, arbitrage finder, contracts manager              | yes  |
| Fuzzwork                       | Blueprint calculator, reprocessing, static data dumps                            | yes  |
| EVE Ref                        | Reference data and market browsing                                               | yes  |

### Already covered — proposed nothing

Checked and found built, so no candidate was raised: undercut detection
(`src/engine/market/undercut.ts`), order competition and health
(`orderCompetition.ts`, `orderHealth.ts`, `orderProblems.ts`), realized profit
(`src/engine/industry/realizedProfit.ts`), build-vs-buy and make-or-buy,
appraisal, price history, reprocessing, PI chains and advisor, sourcing.

### Candidates this run

| Candidate                          | Verdict | Outcome                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build Opportunity Finder           | NARROW  | Filed as #642, as a seeding-and-sorting tab over the existing Build Plan Compare. BPOs only, manufacturing only, sales velocity cut.                                                                                                                                                                                                |
| Restock / reorder points           | NARROW  | Filed as #643, pull-only, par suggested from sell-through, records sharded per item per station.                                                                                                                                                                                                                                    |
| Hub arbitrage / trade route finder | KILL    | Already ships as `hubHaulGaps` in `orderExits.ts`, and the costed-net shape is rejected by `20260906-215500-hauling-is-a-hub-price-gap-and-a.md` — a courier charge varies by route, volume and collateral and no ESI endpoint carries it. Region order books are also ~909 pages across five hub regions.                          |
| System cost index watch            | KILL    | ESI exposes no historical cost index anywhere (182 paths, 4 mention industry, none historical). The distribution kills it regardless: 63.2% of 5,485 systems sit at the identical floor and Jita is the game-wide maximum, so the advice is a constant. The current index is already shown in the Build Plan calculation breakdown. |

**Lesson for the next run.** The arbitrage candidate was drafted on the
strength of `grep arbitrage` returning nothing. It ships under a different
name. Grep the domain concept in `CONTEXT.md` vocabulary, not your own word
for it, and read the module list before believing an absence.

## 2026-09-09 (second run)

Two independent runs happened the same day, both starting from the same
first-run baseline before either had appended a section here — so both called
themselves "second run," and both discovered #671/#672 already filed by the
time they checked `gh issue list`. Combined into one section rather than kept
as two: the actual research differs (one re-fetched the tool source and found
four new tools; the other confirmed prior art and filed two more candidates),
and neither supersedes the other.

Source: same forum category JSON, re-fetched — turned up several threads the
first run's list didn't include (EVE Retroindustry, ISK.GG, EVE Miner Hub,
EQM), plus follow-up research on each. A second pass re-surveyed the first
run's own tool list as still-accurate baseline and researched two further
prior-art points: EVE's own client-side Mining Ledger window (90-day
quantity/volume/ISK-value history — a first-party feature CCP itself ships)
and Iron Whales' price-alert feature.

### Tools surveyed

| Tool              | What it does                                                                                            | Live |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ---- |
| EVE Retroindustry | Locally-run BOM/make-vs-buy planner, asset/blueprint/order/job/wallet/PI tracking, contract search      | yes  |
| ISK.GG            | Market browser: multi-region price-history compare, market-depth charts, saved views, CSV export        | yes  |
| EVE Miner Hub     | Cross-character mining ledger aggregator: ISK/hr, per-ore stats, historical-date valuation, OBS widget  | yes  |
| EQM               | All-in-one dashboard: logistics/hauling, industry, corp tools, HyperNet calculator, fittings sim (beta) | yes  |

### Already covered — proposed nothing

EVE Retroindustry's whole feature set (BOM/make-vs-buy, multi-account assets,
contract search, blueprint/order/job/wallet/PI tracking) maps one-to-one onto
existing Neocom Desk modules — no gap found. EQM's overlap is almost total
(assets, blueprints, wallet, PI, contracts, calendar, mail, skills); the pieces
that aren't already covered were each independently killed or deferred below
(mining ledger → filed; JF route/fuel planning → player-reach; HyperNet
calculator → not core to the build→sell pipeline; fittings sim → a new domain
outside this app's glossary entirely, not attempted). Also confirmed built:
sell-order lifecycle (expiry, staleness, sell-through — already
`orderHealth.ts`/`orderProblems.ts`, thorough), structure fuel expiry (already
a corp deadline/notification, `engine/corp/vitals.ts`/`board.ts`), reactions as
a Build Plan activity (already modeled, not a gap). Confirmed hard-out-of-scope
via `.out-of-scope/`: blueprint research/copying planning
(`blueprint-job-planning.md` — no market price exists for either output) and
invention planning (`invention-planning.md` — same missing-price reason, plus
it reopens the settled one-blueprint-per-plan rejection).

### Candidates this run

| Candidate                                     | Verdict                  | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mining Yield Tracker (ordinary ore/ice)       | NARROW                   | Filed as #671. `groupMiningLedger` (miningTax) discards every non-moon-ore row by design — ordinary mining is tracked nowhere. Hostile review flagged a vocabulary collision risk ("Mining Ledger Entry" is already glossary-bound to rent/tax semantics) and required a distinct name/module for the new record type. Independently rediscovered by the other same-day run, which found it already filed and did not re-file.                                                                                                   |
| Appraisal refine-then-sell comparison         | NARROW                   | Filed as #672. Reprocessing engine exists and is wired into exactly one caller (an open-sell-order exit); Appraisal itself has zero reprocessing awareness. Hostile review corrected an overstated "reuse" claim — Appraisal is character-agnostic today, so wiring in an active Character's skills is new plumbing, not free reuse; ticket scoped accordingly (feature only appears with an active Character selected). Independently rediscovered by the other same-day run, which found it already filed and did not re-file. |
| Build Opportunities: job-slot awareness       | NARROW                   | Filed as #679, header-only open-manufacturing-slots count. Hostile review killed the original per-row "queue-ready" badge and "Slot available" filter chip: `OpportunitiesPanel.tsx` is manufacturing-only (#642's own acceptance criteria), so both would be table-wide constants carrying no signal.                                                                                                                                                                                                                           |
| Quickbar: price alerts on a target price      | SHIP                     | Filed as #680, exactly as scoped: optional target price + direction per Quickbar item, new `priceAlert` notification domain mirroring `structureFuelDomain`'s existing threshold pattern, zero new ESI (reuses the same Fuzzwork aggregate path Compare already calls).                                                                                                                                                                                                                                                          |
| Market depth chart (Order Book visualization) | KILL                     | No new information over the existing Order Book rows already on screen — CONTEXT.md's own Order Book definition is "rows, not a summary," and a cumulative-volume curve is a re-rendering of data already shown, not a new capability. Also would have collided with the existing glossary term **Order Depth** (`classifyOrderDepth`, Build Opportunities), which the app is already carefully distinguishing from **Auto Build Depth** — a third unrelated "depth" would make that worse.                                      |
| Corp ore buyback / mining-fleet payout split  | KILL (dropped pre-draft) | Considered and dropped before drafting: a true fleet-payout splitter needs every participant's own mining ledger, which this app can only ever read for Characters signed into this one device — the same cross-player aggregation problem that killed hub arbitrage in the first run. The corp-buyback-pricing half of the idea (paste ore, price at a percentage) is already exactly what Appraisal's Price Percent does today, so it would have shipped as a duplicate.                                                       |
| Skill Extractor ISK/hr comparison             | KILL (dropped pre-draft) | `engine/spExtraction.ts` already models extraction readiness; adding an ISK/hr-vs-training comparison is real but serves a narrow slice of players (multi-account SP arbitrage), well below the player-reach bar next to the other candidates this run.                                                                                                                                                                                                                                                                          |

**Lessons for the next run.** (1) Same-day reruns of this skill are real —
check `gh issue list --state all --search "created:<today>"` for the exact
date range before drafting, not just `docs/context/decisions/` and
`.out-of-scope/`, since a concurrent run's issues may exist before its own
TOOLS.md append lands (or ever lands at all, if it crashes after step 6).
Mining-ledger value and reprocess-vs-sell-in-Appraisal both look like
attractor gaps this codebase's shape naturally suggests, worth remembering as
"probably already taken" before spending research time on them again. (2) A
depth-chart candidate looked new because no chart existed, but the _data_ was
already fully on screen as rows — check whether a candidate adds information
or just a picture of information already shown. (3) An engine can exist and
still have a real gap if it's wired into only one narrow caller — reprocessing
math existed for a stuck sell order but never for a freshly-pasted appraisal;
grep the engine's _callers_, not just its existence, before assuming full
coverage.

## 2026-09-09 (third run)

<!-- Housekeeping (fifth run, 2026-09-10): a prior merge on origin/main had
duplicated this entire section — the same "third run" content appeared twice
back to back, with lesson items (2) and (3) orphaned onto the tail of the
second run's closing paragraph above instead of staying attached to their own
run. Fixed here by removing the corrupted duplicate and restoring items (2)/
(3) to the second run's lesson, where the original (pre-corruption) copy of
this file had them. No content lost, only de-duplicated. -->

A third same-day run. Checked `gh issue list --state all --search
"created:2026-09-09"` up front per the second run's lesson — found ~20 issues
filed today across `/next-ticket`, `/improve-ui` and the two prior
`/add-missing-features` runs, none overlapping what this run went on to
propose.

### Tools surveyed

Re-fetched the third-party developer forum category JSON; it has grown since
the first run's list (30 threads now vs. fewer before). New threads checked
this run, beyond the first run's already-logged table: **EVE Retroindustry**
(free, runs-on-your-own-machine industry tool — production planner with
Jita pricing, make-vs-buy optimizer, multi-character/corp asset tracking,
personal/corp/alliance contract browser with per-line pricing, blueprint/PI/
job tracking; notable for being local-first like Neocom Desk itself, just not
a PWA); **ISK.GG** (account-free market browser — live regional order books
down to station level, multi-region price-history comparison, item pages
with 365-day history and "market-depth charts", saved items/folders with
Quickbar-style import, CSV export); **EVE Quartermaster / EQM** (the most
industry-adjacent of the new finds — production economics from inputs to
disposition, a Market Appraisal module doing "Janice-style pasted item lists"
with "multi-hub buy/sell price comparisons" and "best split estimate
highlighting", a Corporate Exchange for member-to-member listings, wallet
balance-trend analytics, jump freighter fuel planning). Also glanced at EVE
Empire, Capsuleers.app and EVE Nexus (general companion apps / fitting sim —
nothing industry/market-specific beyond what's already covered) without deep
research, since nothing in their thread titles suggested a pipeline gap.

### Already covered — proposed nothing beyond prior runs

Confirmed still built and not re-proposed: undercut detection, order
competition/health, realized profit, build-vs-buy/make-or-buy, single-hub
appraisal, PI chains, price history (already charted with Recharts, see
`PriceHistoryChart.tsx`), reprocessing, sourcing, hub-to-hub price gap for an
owned sell order (`hubHaulGaps`), Build Groups/Build Opportunities (several
same-day tickets, #626–632, cover most of Ravworks'/Slipway's "multi-item
planning" pitch already), mining ledger tax tracking, Quickbar price alerts
(#680, shipped same day). The Market Browser already renders the full raw
order book as a sortable table with a context menu per row — not just a
best-price summary — so "can a player see individual orders, not just a
number" is already yes.

### Candidates this run

| Candidate                                  | Verdict | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public item-exchange contract deal browser | KILL    | Dropped in framing, before hostile review. EQM's/EVE Courier's "contracts manager" and EVE Retroindustry's public contract browser are real prior art, but ADR 0013 already deliberately narrowed the same EVE Ref public-contracts crawl to blueprint-copy-for-sale rows only (~122,717 of ~353,059 item rows) specifically to stay inside Firestore's free-tier write budget (~3,000/day vs. ~1.1M/day naive). A general item-exchange deal browser would re-open that exact cost problem at full scale, with no clear "good deal" heuristic besides (arbitrary compound contract packages, no per-item reference price guarantee). |
| Appraisal: multi-hub price comparison      | SHIP    | Filed as #689. Shows a pasted pile's sell/buy totals at all 5 Trade Hubs side by side (EQM's "multi-hub buy/sell price comparisons" on a Janice-style paste is the direct prior art). Reuses the same batched-per-hub `getHubPrices` call `hubHaulGaps` already proves is cheap; the cited Region-mode rejection (`20260908-164742`) is about per-type paginated fetches, not a fixed 5-hub comparison, so it doesn't block this.                                                                                                                                                                                                     |
| Market Browser: order-book depth chart     | KILL    | Hostile review's forced cut among three SHIP-leaning candidates. Narrowest reach of the three (only fires for a player who opened Market Browser _and_ selected a specific item to eyeball book shape), and duplicates data the app already renders twice over — the raw sortable order table, and `undercut.ts`/`orderCompetition.ts`'s numeric answer to the same question. Also understates real tuning burden: asymmetric books, extreme price outliers, and thin books all make a naive depth chart read as noise rather than signal.                                                                                            |
| Wallet: balance-over-time chart            | SHIP    | Filed as #690. EQM's "wallet balance trends and net change" is the direct prior art; Neocom's own Wallet page shows only the instantaneous balance today despite the journal already carrying a `balance` field per entry. Widest reach of the three reviewed (every character has a wallet, no industry activity required) and the only one answering a question genuinely harder to read from the existing table than from a chart.                                                                                                                                                                                                 |

**Lesson for the next run.** The forum category listing keeps growing
(30 threads now) — worth a fresh fetch each run rather than trusting a prior
run's cached table indefinitely, since new tools (EVE Retroindustry, ISK.GG,
EQM this run) do appear between runs. EQM in particular is worth remembering
by name: it's the single most industry/market-dense tool found across all
three runs so far, and both of this run's survivors came directly from
features it names explicitly ("multi-hub buy/sell price comparisons",
"wallet balance trends"). If a future run runs dry on fresh candidates,
re-reading EQM's full feature list against the current app state first is
likely higher-yield than another cold forum sweep.

## 2026-09-10 (fifth run, concurrent with a fourth)

Started from a **local checkout 36 commits behind `origin/main`** — caught via
`git status -sb`'s `[behind N]` marker before trusting any local `grep`/`ls`
result, per the third run's own lesson. All inventory and prior-art checks
below were re-verified against `origin/main` (`git show origin/main:<path>`,
or a worktree branched straight off `origin/main`), not the stale local tree.

Found **three other same-day runs already at the TOOLS.md-append stage** when
this run went to open its own PR: #714, #719 and #723, all titled "Record the
fourth /add-missing-features survey run in TOOLS.md", none merged yet. Read
all three (via `git show origin/<branch>:.claude/skills/add-missing-features/TOOLS.md`)
before drafting, to avoid re-proposing anything they'd already filed or
killed. Their combined candidates and outcomes: #711 (Production Log realized-
profit chart, SHIP), #712 (Assets total portfolio value, SHIP), #713 (Open
Orders sell-through column, NARROW), a killed corp-wallet-chart extension,
#722 (unowned blueprints ranked by owned-material coverage, NARROW), and a
killed public item-exchange deal browser (re-confirming the first run's own
kill). None overlap with this run's candidates below.

**Also found and fixed, while already in this file: a real duplication bug on
`origin/main` itself**, introduced by a merge commit (`8f01c3b`) unrelated to
any of the pending same-day PRs — the third run's entire section had been
pasted in twice back to back, with the second run's own lesson items (2) and
(3) orphaned onto the wrong paragraph. Fixed in this run's own edit (see the
housekeeping comment left in place above the third run's heading) since
touching this file was already unavoidable. A single append-only ledger file
being it own merge hazard, for a skill multiple concurrent runs invoke the
same day, is now a repeated finding (this is the second such bug caught, after
the fourth run's own account of catching one) — worth flagging to a human
whether this file should move to one-file-per-run the way
`docs/context/decisions/` already solved the identical problem, rather than
waiting for a worse merge to force the question.

### Tools surveyed

The forum category JSON has **a second page** (`more_topics_url`), which none
of the five prior runs (this run included, until this point) had ever
fetched — every previous survey covered only the ~30 threads on page 0.
Fetching `?page=1` turned up ~30 more threads, several genuinely
industry/PI-relevant and previously unseen: **EVE Horizon** (manufacturing +
PI planning — blueprint tracking, a "Sweep Hangar" remaining-materials
calculator, a colony planner with plan-vs-actual performance scorecards, and
a market-restock tool converting hub shortages into build plans), **EVE
Forge** (all-in-one industry planner — manufacturing/reaction chains,
invention probability, PI production chain calculators, an ISK/hr dashboard,
an LP calculator, Gantt scheduling), **EVE-Industry-Scanner-Tool**
(manufacturing/reaction/PI profitability scoring across five hubs, hub-to-hub
arbitrage, a 0–100 opportunity score, wormhole import mode), **EVE-HUB** (a
PI planner plus an "arbitrage scanner" that finds price gaps between hubs,
route/threat tools), **Dd24tool.de** (a paid highsec item buyback service —
not a feature gap, a business), **EVE TradeLooper** (cargo valuation, mining/
industry planning, LP store analysis, an OmniScanner for pasted
cargo/ore/dscan/local), **EVE Night Trade Tools** (FIFO P&L dashboard with
top-winners/losers, undercut desktop alerts, station-trading and inter-region
opportunity scanners, a peer-to-peer market over Nostr), **IndustrialEVE**
(PI notifications), **jEveAssets** (established multi-account asset
manager). Also present but not researched (mapping/intel/fitting-sim/crew-sim
territory by thread title, no industry/market surface): EVE Crews, Nexum,
EveWebMail, EveLens, EVE-NAV, Capsuleers.app, Wayfinder, Atlas, MISMAPS/
MISKILLZ, NPC Sites Help, Fly Safe, WHMapper, EVE Nexus, Socketkill, PEARL,
EVE Hacking Simulator, EVEAIO (bug-bounty preview, no feature list disclosed
in its own forum thread), Eve PvP Radar, Assets within structures, EVE-O
Preview, PI Tools website (old, general), EVE MCP Server, EVE Threat Checker,
EVE Fit Assistant, SLH Local Scanner, The Ministry of Pantoscopic Observance,
EveBoosters.com, EVE NewBro, EVE Link, ECT EVE Assets, PATT, W-Space Atlas,
Open Source Modular Desktop Tool, free corp/alliance forum, Pod, EveHunter.

### Already covered — proposed nothing beyond prior runs

Hub-to-hub arbitrage (EVE-Industry-Scanner-Tool, EVE-HUB's "arbitrage
scanner") re-confirms the first run's own kill (`hubHaulGaps` already ships
it; a costed-net shape is rejected by
`20260906-215500-hauling-is-a-hub-price-gap-and-a.md`). EVE Horizon's/EVE
Forge's/EVE-Industry-Scanner-Tool's PI profitability pitches (which tier to
build, ISK/hr, colony planning) turned out to already be Neocom Desk's own
strongest suit, not a gap — `src/engine/pi/stopTier.ts` (which tier to stop
at, issue #426, closed), `factoryBalance.ts` (fed vs. starved pins),
`colonyBatches.ts` (reset-run grouping), `extraction.ts` (CCP's decay curve),
`network.ts`, `richnessEstimate.ts` and a full closed-issue Advisor
collectively out-depth every one of the newly-found tools' PI pitches. EVE
TradeLooper's "LP store analysis" is already exceeded by the Loyalty Store's
existing ISK/LP ranking (`offerRows.ts`) confirmed live on `origin/main`. EVE
Night Trade Tools' "top winners and losers" is already available by sorting
the Production Log's existing per-item rollup table on its `realizedProfit`
column (`ProductionLogPanel.tsx`, confirmed sortable on `origin/main`) — no
new feature needed. EVE Horizon's "market shortage → build plan" pitch,
narrowed to items the player already owns blueprints for (the only bounded,
feasible shape — an unbounded market-wide shortage scan hits the same
full-market-crawl cost problem that kills hub arbitrage), turns out to
already be exactly what **Order Depth** (`classifyOrderDepth`,
`src/engine/industry/opportunities.ts`) shows as a column on every Build
Opportunities row already. A bulk "relist my stale orders" action (EVE Night
Trade Tools' hotkey-driven buy queues, EVE-Industry-Scanner-Tool's watchlists)
was dropped before drafting: `src/esi/registry.ts` on `origin/main` has zero
write-scoped endpoints anywhere — the app never places, cancels or modifies
an in-game order on the pilot's behalf, and
`docs/context/decisions/20260906-155913-open-orders-reads-as-a-worklist.md`
confirms Open Orders is deliberately read-only. Turning the app into an
order-placing tool is a different product, not a feature gap, and was not
brought to hostile review.

### Candidates this run

| Candidate                                                              | Verdict | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planetary Industry: log an actual batch, track realized profit         | SHIP    | Filed as #725. PI has a deep forecasting engine (Advisor, stop-tier, factory balance) but, confirmed by grepping `src/features/pi/` and `src/routes/PlanetaryIndustry.tsx` on `origin/main`, zero references to `ProductionRun`/`realizedProfit`/`logged` — nothing lets a pilot record what a colony actually delivered, the way Industry's own Production Run/Log (#525) already does for manufacturing. Direct internal precedent, not third-party: #525's sale-link tables were built as source-agnostic `CollectionSpec` collections keyed off ESI's own IDs (`docs/context/decisions/20260905-181537-production-log-row-per-allocation-sync-accept-wallet.md`), so reusing them for a PI batch is exactly what that decision anticipated. Zero new ESI — pure local Dexie state, pilot-logged, same as Production Run.                                                                                         |
| Build Plan material row: link to the player's own PI colony production | KILL    | Hostile review killed the framing, not just narrowed it. The proposed "cheap discoverability hint" (mirroring `OwnedStockHint`/`GroupTargetLink`) doesn't actually work at the shape proposed: `src/features/pi/data.ts`'s colony cache (`readCachedColonyDetails`) is explicitly Dexie-only, never a fetch, and is only populated by visiting the Planetary Industry route — so on a Build Plan Detail page the hint would either read a cache that's cold for most colony-running players most of the time (defeating the "cheap and reliably visible" premise), or add a fresh `esi-planets` fetch to a page whose whole job is materials costing. Combined with the narrow build-planner-∩-PI-runner audience the candidate itself already conceded, this doesn't clear the bar even at its cheapest imaginable shape.                                                                                           |
| Compare: multi-hub price view for the Quickbar                         | NARROW  | Filed as #726, reshaped from a literal multi-hub mode inside Compare to a "View in Appraisal" handoff action instead. The original framing didn't survive verification: `useCompareRows.ts` runs on real per-type paginated ESI region order books (`getOrderBook`), not the cheap batched Fuzzwork path #689 uses, so a 5-hub Compare mode would reintroduce exactly the per-type pagination cost `20260908-164742` already rejected for Region-mode Appraisal — and the **Compare** glossary entry's own "same Location Mode as the order book beside it" definition can't be satisfied by a view spanning 5 regions at once without contradicting itself. The narrower shape ships the same player value (which hub is cheapest for these tracked items) by sending the Quickbar's contents into Appraisal's already-shipped, already-cheap multi-hub view (#689) instead of building a second, incompatible one. |

**Lesson for the next run.** (1) **Fetch page 2 of the forum listing.**
`more_topics_url` exists and none of the first four runs today ever followed
it — every one of them re-surveyed the same ~30 threads on page 0. Page 2 is
where this run's only two surviving candidates' prior art lived. Check for
further pagination beyond page 1 next time, too — this run did not confirm
page 1 was the last page. (2) **PI is not an unexplored quadrant because it's
under-built — it's the opposite.** Across six survey runs total (this one and
five before it), zero PI candidates had ever been drafted, and the reason
turned out to be that Neocom Desk's own PI engine already out-depths every
third-party PI tool found so far (stop-tier recommendation, fed/starved pin
detection, reset-run batching, a measured — not guessed — extraction rate).
The one real PI gap was the same shape as Industry's own solved problem
(forecast without a realized-profit ledger behind it), findable only by
checking "does this engine's _output_ get logged anywhere," not by comparing
feature lists. (3) A same-day append collision at N=4 concurrent runs is no
longer a one-off (the second run's own same-day duplicate collision has now
recurred at a larger scale, and this run independently found a _second_,
unrelated corruption already merged into `origin/main`) — worth escalating to
a human whether this file should move to one-file-per-run the way
`docs/context/decisions/` already solved the identical problem, rather than
waiting for a worse merge to force the question.
