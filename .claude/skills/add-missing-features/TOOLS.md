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
