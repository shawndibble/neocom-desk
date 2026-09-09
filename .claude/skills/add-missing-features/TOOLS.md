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

A second, independent run happened the same day, before this section was
written: it filed #671 (personal mining yield/ISK-per-hour, distinct from the
existing moon-tax-only mining ledger use) and #672 (Appraisal reprocess-vs-sell
for ore/ice) around 21:38 UTC, but never got to appending its own TOOLS.md
section — this entry exists so a third run doesn't have to reconstruct that
from `gh issue list` the way this run did. If a fourth run starts soon after
this one, check `gh issue list --state all --search "created:<today>"` before
trusting this file alone; runs on the same day are not guaranteed to see each
other's commits before they file.

### Tools surveyed

No new tools researched this run — the tool table above (from the same-day
first run) was carried forward as still-accurate baseline. New research went
into confirming specific gaps instead: EVE's own client-side Mining Ledger
window (90-day quantity/volume/ISK-value history, i.e. this is a first-party
feature CCP itself ships) and EVE Miner Hub (pulls the same
`/characters/{id}/mining/` ESI endpoint, values live) as prior art for the
mining-yield candidate (independently also filed as #671, see above); Iron
Whales' and eve-tools.cloud's reprocess-vs-sell-raw comparisons as prior art
for the reprocess-in-Appraisal candidate (independently also filed as #672);
Iron Whales' price-alert feature as prior art for a Quickbar alerts candidate
(#680, below).

### Already covered — proposed nothing

Checked and found built, so no candidate was raised beyond the first run's
list: sell-order lifecycle (expiry, staleness, sell-through — already
`orderHealth.ts`/`orderProblems.ts`, thorough), structure fuel expiry (already
a corp deadline/notification, `engine/corp/vitals.ts`/`board.ts`), reactions as
a Build Plan activity (already modeled, not a gap). Confirmed hard-out-of-scope
via `.out-of-scope/`: blueprint research/copying planning
(`blueprint-job-planning.md` — no market price exists for either output) and
invention planning (`invention-planning.md` — same missing-price reason, plus
it reopens the settled one-blueprint-per-plan rejection).

### Candidates this run

| Candidate                                    | Verdict | Outcome                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Personal mining yield / ISK-per-hour tracker | KILL    | Already filed as #671 by the concurrent same-day run before this run checked `gh issue list`. Dropped on discovery, not re-filed.                                                                                                                                                                      |
| Appraisal reprocess-vs-sell for ore/ice      | KILL    | Already filed as #672 by the same concurrent run. Dropped on discovery, not re-filed.                                                                                                                                                                                                                  |
| Build Opportunities: job-slot awareness      | NARROW  | Filed as #679, header-only open-manufacturing-slots count. Hostile review killed the original per-row "queue-ready" badge and "Slot available" filter chip: `OpportunitiesPanel.tsx` is manufacturing-only (#642's own acceptance criteria), so both would be table-wide constants carrying no signal. |
| Quickbar: price alerts on a target price     | SHIP    | Filed as #680, exactly as scoped: optional target price + direction per Quickbar item, new `priceAlert` notification domain mirroring `structureFuelDomain`'s existing threshold pattern, zero new ESI (reuses the same Fuzzwork aggregate path Compare already calls).                                |

**Lesson for the next run.** Same-day reruns of this skill are real — check
`gh issue list --state all --search "created:<today>"` for the exact date
range before drafting, not just `docs/context/decisions/` and
`.out-of-scope/`, since a concurrent run's issues may exist before its own
TOOLS.md append lands (or ever lands at all, if it crashes after step 6).
Two of four candidates converged with an unlogged concurrent run's own
picks — mining-ledger value and reprocess-vs-sell-in-Appraisal both look like
attractor gaps this codebase's shape naturally suggests, worth remembering as
"probably already taken" before spending research time on them again.
