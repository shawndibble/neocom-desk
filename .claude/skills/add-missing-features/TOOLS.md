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
