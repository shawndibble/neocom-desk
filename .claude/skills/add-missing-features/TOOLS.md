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

## 2026-09-10

An earlier same-day run filed eight issues (#711, #712, #713, #717, #718,
#722, #725, #726) but crashed before reaching step 7, leaving this file
without a section for them — the exact "crashed after step 6" failure mode
the second 2026-09-09 run's lesson warned about. Recorded here so a future
run's `gh issue list --search "created:2026-09-10"` check finds them
accounted for rather than orphaned. This run also filed one more (#730). All
nine carry the `> _This was generated by AI during /add-missing-features._`
provenance line, confirmed by reading each body before treating it as
prior art rather than trusting titles alone — a title like "Employment
History: corporation rows have no context menu" (#729) turned out to be
`/improve-ui`'s, not this skill's, and the provenance line is the only
reliable way to tell the two apart in a mixed same-day batch.

### Tools surveyed

Source: a fresh fetch of both the default (latest-activity) page and
`?page=1` of the forum category JSON, which between them surfaced three
tools not in any prior run's table — the earlier same-day run had already
found and used two of them (citing them in #722's and #725's bodies) without
logging them here, which is the same crash-before-step-7 gap as the issues
above.

| Tool         | What it does                                                                                                              | Live |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | ---- |
| EVE Horizon  | Manufacturing + PI planning: hangar-sweep BOM netting, plan-vs-actual PI scorecards, cross-colony PI coordination, market restock-away-from-Jita, job-slot staleness | yes  |
| EVE-HUB      | Free PI planner (P0-P4 profit calc), hub-to-hub arbitrage scanner, route/threat intel, multi-hub price watchlist          | yes  |
| EVE Forge    | All-in-one industry planner: nested BOM/capital parts, reactions, invention calc, PI calc, "professional" trading-chart indicators, Gantt production scheduling | yes  |

### Already covered — proposed nothing

All of EVE Horizon's feature list maps onto shipped code, checked module by
module rather than assumed from the pitch: hangar-sweep BOM netting is
**Craft Sweep** / owned-stock detection; plan-vs-actual PI scorecards is
exactly #725 (filed by the earlier same-day run); cross-colony PI
coordination is `engine/pi/network.ts` + `NetworkPanel.tsx` (ADR 0012,
"what colonies could make together") — a close pitch-level match worth
naming so the next run doesn't re-propose it from EVE Horizon's wording;
market-restock-away-from-Jita is #643 (per-station, not Jita-only, from the
first run); job-slot staleness is #679 (merged). EVE-HUB's PI planner and
arbitrage scanner are prior-killed ground (`stopTier.ts`/`chain.ts`; the
hub-arbitrage KILL from the first run); its route/threat-intel tools are
out of domain (not industry/market); its multi-hub watchlist overlaps #689
and #726. EVE Forge's nested BOM/capital parts is `materialResolution.ts`/
`subBuild.ts`; reactions are an existing Build Plan **Industry Activity**;
invention is `.out-of-scope/invention-planning.md`; PI calc is the same PI
engine; LP and reprocessing calculators already exist (`LoyaltyStore`,
`reprocessing.ts`); shopping-list multibuy export is `shoppingList.ts`.
Also considered and dropped in framing, before hostile review: EQM's
"Corporate Exchange" (member-to-member listings) — this would need
listings visible across *different players'* devices, which is the same
cross-player-aggregation wall that killed hub arbitrage and the corp
ore-buyback splitter in earlier runs; nothing in this app's sync model
shares Editable Data across two different people's accounts, only across
one person's own devices.

### Candidates this run

| Candidate                                          | Verdict | Outcome                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price History: moving-average trend line            | NARROW  | Filed as #730. EVE Forge's "professional financial indicators" narrowed to a single 7-day SMA — a bank of stock-market indicators (RSI, Bollinger) was rejected in framing as over-fitting a liquid-market metaphor onto an illiquid regional item market. Hostile review confirmed this differs in kind, not degree, from the twice-KILLed order-book depth chart (a genuinely new derived statistic vs. a re-drawing of numbers already on screen), then caught two real correctness traps unprompted: a naive post-range-filter computation would understate the window at the start of any range, and an un-excluded 7d range would collapse the line to a single point — restating the existing hi/lo/median summary, which is the depth-chart defect in miniature. Both are now explicit acceptance criteria. |
| EVE Forge: Gantt production-job scheduling timeline | KILL    | Dropped in framing, before hostile review. `ActiveJobsPanel.tsx` already renders every running job sorted by soonest-first with per-job progress bars, completion flags and a per-category job-slot usage summary (`jobSlots.ts`) — the same "when do my jobs finish, and how many slots am I using" question a Gantt view would answer, already answered as rows rather than bars. Same defect class as the twice-KILLed order-book depth chart: a different picture of data already fully on screen, not new information. |

**Lesson for the next run.** (1) A run that files issues and then crashes
before step 7 is now a confirmed recurring failure mode, not a one-off — the
second 2026-09-09 run warned about it, and it happened again the very next
day. Always run the `created:<today>` search *and* open each hit's body to
check the provenance line before drafting, since titles alone don't
distinguish this skill's output from `/improve-ui`'s in a mixed batch, and a
same-day run's own candidates may be sitting in GitHub with no TOOLS.md
trace at all. (2) EVE Horizon's and EVE-HUB's pitches read as fresh
capability gaps until checked module-by-module against the engine layer —
"cross-colony PI coordination" sounds new but is ADR 0012's `network.ts`
almost verbatim, and "plan-vs-actual scorecards" is a rediscovery of
Production Run's own shape one domain over. Matching a competitor's own
words to a `docs/context/decisions/` or ADR title, not just to a route, is
what catches these. (3) The order-book depth chart's "picture of data
already shown" defect is a reusable test, not a one-time verdict — it
correctly killed a second, unrelated candidate this run (the Gantt
timeline) once the same question was asked of it.
