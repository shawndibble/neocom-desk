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

## 2026-09-10 (fourth run)

A new calendar day, but the well from the three 2026-09-09 runs was still
warm: `gh issue list --state all --search "created:2026-09-09..2026-09-10"`
turned up 39 issues already filed since the last TOOLS.md append, across
`/next-ticket`, `/improve-ui` and the three prior `/add-missing-features`
runs — including two of the third run's own survivors (#689 multi-hub
Appraisal, #690 Wallet balance chart) already merged, plus #711 (Industry:
chart realized profit over time) and #712 (Assets: total portfolio value)
filed by other tooling the same window, both of which this run would
otherwise have proposed independently.

Housekeeping: while editing this file, found that the copy of it on
`origin/main` (34 commits ahead of the local checkout this run started from)
had accidentally duplicated the entire "third run" section — the whole block
appeared twice back to back, with the second run's own lesson items (2) and
(3) orphaned onto the tail of the first copy's closing paragraph instead of
their own. Looks like a merge that kept both sides of an append conflict
instead of one. Fixed as part of this run's own edit rather than filed
separately, since touching this exact file was already unavoidable; no
content was lost, just de-duplicated and reattached to the right paragraph.

### Tools surveyed

Re-fetched the forum category JSON: still exactly the same 30 threads the
third run logged, zero new industry/market-relevant tools since. Re-fetched
full feature lists for the two tools with the most remaining unchecked
surface, per the third run's own lesson:

- **EQM** — read in full this time (not just the third run's summary). Most
  lines map onto existing Neocom Desk modules once checked against actual
  code (asset ledger, wallet division sync → `engine/corp/assetDivisions.ts`,
  contract management, clone/implant sync, skill tracking). One line had no
  equivalent anywhere in the app: "Missing BPOs Catalog... cross-linking with
  owned materials to show coverage percentages" — see Candidates below.
- **Adam4EVE** — read in full. "Material influence analysis" (which
  component's price moves the final product cost most) and "Industry cost
  index history" both looked plausible on first read but did not survive
  five minutes of arithmetic and this run's own first-run lesson,
  respectively — see Already covered / dropped below.

### Already covered — proposed nothing beyond prior runs

Confirmed still built: corp wallet division sync
(`engine/corp/assetDivisions.ts`, `features/corp/divisions.ts`,
`features/corp/wallet.ts`), contract management and now a neutral
market-value figure on contract lines (#717, filed same window by other
tooling), clone/implant sync, skill queue and training visibility, realized
profit (`realizedProfit.ts` — confirmed only vs. confirmed sales, never a
current-market comparison, but a Production Run's stored cost sitting next
to a fresh live Build Plan recompute already lets a pilot eyeball the same
delta without a dedicated feature, so this stays uncovered-but-not-worth-
building rather than a gap). Adam4EVE's "material influence analysis"
dropped in framing before drafting: cost is linear in each material's price
(`dCost/dPrice_i = quantity_i`), so ranking materials by price-sensitivity is
arithmetically identical to sorting the existing materials table by line
cost — a re-presentation of data already on screen, the exact pattern the
second run's lesson #2 already named. Adam4EVE's "industry cost index
history" re-treads the first run's own kill (`System cost index watch`): ESI
exposes no historical cost index at all, and building one would mean this
local-first PWA crawling and storing a server-side time series across every
system — the same cross-device aggregation problem every hub-arbitrage-
shaped candidate keeps failing on.

### Candidates this run

| Candidate                                                                 | Verdict | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build Opportunities: unowned blueprints ranked by owned-material coverage | NARROW  | Filed as #722. EQM's "Missing BPOs Catalog" is the direct prior art; `blueprintCatalog.ts` already indexes every SDE blueprint (confirmed by reading the file, not by recall) and `ownedStock.ts`'s owned-quantity primitive is already reusable, so the data-availability half was real. Hostile review rejected two things in the original framing: building it as a mode on the existing `OpportunitiesPanel`/`useOpportunities` (that machinery is built around a small, already-priced, owned candidate set with chunked market fetches — an unpriced, thousands-row, unowned sweep needs its own component/hook), and leaving "coverage by value or by line-count" undecided (a line-count ranking would surface high-coverage junk, like a common T1 ammo BPO, ahead of anything actually worth buying). Ticket ships value-weighted coverage, the blueprint's own price shown inline, a capped result set, and its own data seam, per the review. |

No mockup could be published this run — design/artifact tooling was
unavailable in this session's toolset. The ticket carries a full word
description of the layout instead (two-panel stack on the existing
Opportunities tab, per DESIGN.md's component vocabulary), per the skill's own
fallback for exactly this case.

**Lesson for the next run.** Three same-day runs the day before this one
means the standard "check `gh issue list --search created:<today>`" needs to
span the date range back to the last TOOLS.md append, not just today's UTC
date — this run's search used `created:2026-09-09..2026-09-10` for that
reason and it caught two candidates (#711, #712) other tooling had already
filed in the interim, which a same-day-only search would have missed. Also:
when a candidate looks promising on a first read of a competitor's feature
summary, the advisor step's push to re-verify from the actual source file
before drafting (not from a paraphrase or from memory of what "should" be
built) caught something this run's own first pass had wrongly waved through
on recall — read the file, every time, even under token pressure. Finally: a
single append-only ledger file is itself a merge hazard for a skill that
multiple concurrent runs can invoke the same day (this run found and fixed
one such duplication) — worth remembering as the same class of problem
`docs/context/decisions/` was split into one-file-per-decision to avoid,
should this file's conflict rate ever get bad enough to justify the same
move.
