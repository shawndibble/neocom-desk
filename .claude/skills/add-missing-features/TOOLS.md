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
