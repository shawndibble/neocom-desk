# EVE Console 0.9.16 (Kerno) — open-source desktop industry/everything tool

Thread: "EVE Console 0.9.16 open source industry tool for Windows and Linux" https://forums.eveonline.com/t/eve-console-0-9-16-open-source-industry-tool-for-windows-and-linux/519624 (read 2026-10-07; 1 post, no replies). Also read https://github.com/kernoeve/EveConsole readme (feature list). Docs site not fetched.

## What it is

Local desktop app (SQLite or shared Postgres), built by a null-sec capital builder to run dozens of indy alts. Industry-first, plus map, intel, fitting, mail, AI agent. Reads game logs and client files (desktop only).

## Features

| Feature                                                                                                                               | Tool does                                             | Neocom Desk status                                                                                                                      | Evidence       |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Item valuation: market + public-contract history (for faction BPCs) + stored build cost history                                       | per-item market/build/reprocessed value; pasted lists | PARTIAL: Appraisal (hub price, refine, LP) market.md §4; BPC value from contract snapshot assets.md "BPC values"; no build-cost history | readme, post 1 |
| Production calc w/ named "indy parks", structure per item category                                                                    | yes                                                   | HAVE Facility Preset / Build Location (industry-plans.md)                                                                               | readme         |
| Build vs buy per component, low/high-ball price filtering, price overrides                                                            | yes                                                   | HAVE buildVsBuy + price override (industry-plans.md); outlier filtering not checked                                                     | readme         |
| Worklist from 11 sources (jobs, hauling, invention, refining, buy orders, inventory targets, corp projects, skills, asset safety, PI) | single task list                                      | PARTIAL: Overview board + Alerts feed (overview.md, alerts.md); no cross-domain todo                                                    | readme         |
| Inventory/market levels vs target                                                                                                     | stock targets per item list                           | MISSING (no reorder-point/stock-target feature found)                                                                                   | readme         |
| Standing buy-order check (active, underbid, expiring)                                                                                 | yes                                                   | HAVE Open orders worklist (undercut) market.md §3                                                                                       | readme         |
| Net worth chart over time                                                                                                             | yes                                                   | PARTIAL: wallet balance history only (wallet.md "Balance-history chart"); no asset-value history                                        | readme         |
| Income/expense categories                                                                                                             | yes                                                   | HAVE wallet journal (wallet.md)                                                                                                         | readme         |
| PI: extractor timers, storage, profit/day per colony                                                                                  | yes                                                   | HAVE (planetary-industry.md; also quick wins, whole-account plan)                                                                       | readme         |
| Fitting from SDE dogma: DPS, cap, tank, boosts, mining yield, EW, lock time; EFT paste                                                | yes                                                   | HAVE (fittings.md, dogma engine)                                                                                                        | readme         |
| Capital jump planner: LY, fuel per leg, waypoints                                                                                     | yes                                                   | MISSING (travel.md has no jump-drive routing)                                                                                           | readme         |
| Route planner w/ Ansiblex + Thera, sets in-game dest                                                                                  | yes                                                   | HAVE (travel.md)                                                                                                                        | readme         |
| Universe map overlays: sov, FW, incursions, industry indices, kills, jumps                                                            | yes                                                   | PARTIAL: route-centric only; no map. Overlays low value for our mission                                                                 | readme         |
| Intel channel log parsing, game log viewer                                                                                            | local files                                           | OUT OF SCOPE (reads client log files; browser can't watch dir w/o File System Access, desktop-only)                                     | readme         |
| Discord/Slack webhooks, scheduler                                                                                                     | yes                                                   | OUT OF SCOPE (no server; notifications.md Q1)                                                                                           | readme         |
| Store front (EVE mail / web) w/ build-to-order                                                                                        | yes                                                   | OUT OF SCOPE (server/shop)                                                                                                              | readme         |
| LP market values per offer                                                                                                            | yes                                                   | HAVE LP Store ISK/LP (market.md §5)                                                                                                     | readme         |
| Sale posting formats (Slack/Discord/BBCode/MD)                                                                                        | yes                                                   | PARTIAL: Appraisal "Copy sell list" (market.md §4); no multi-format post                                                                | readme         |
| Corp projects, activity monitor, asset safety                                                                                         | yes                                                   | PARTIAL: corp.md covers asset safety only; corp projects not found                                                                      | readme         |
| AI agent "Eden", TTS/STT, 8 languages                                                                                                 | yes                                                   | OUT OF SCOPE (desktop+LLM keys); English only per CLAUDE.md                                                                             | readme         |
| Alarms: user-defined conditions (price, contract, order, PI, timers)                                                                  | yes                                                   | PARTIAL: priceAlertTriggered, marketOrderUndercut etc. (alerts.md severity list); no free-form condition builder                        | readme         |

## Calculations worth borrowing

- Build-cost history stored per item (build cost over time from market+contract inputs): lets a player see if building got cheaper/dearer. We compute live only.
- Contract-history valuation for non-market items (faction BPCs): we already have snapshot.
- Reprocessed valuation beside market/build in one table (we have refine in Appraisal).

## Candidate gaps

- Stock targets ("keep >= N of X across my characters") with shortfall alert: shared idea with Deep Industry stock deduction. Confidence: inferred (single tool; ours has owned-stock for build plans only).
- Capital jump planner: also Omni. Confidence: confirmed in readme (Console) + thread (Omni).
- Net worth history: also jEveAssets (docs/research/competitors.md §2.5). Confidence: confirmed in readme.

## Out of scope

Intel/game log parsing, webhooks, storefront, AI agent, shared Postgres multi-client mode, in-game fitting write-back.

## Pitfalls

- Dev flags translations as agent-made and rough; keep English-only until reviewed.
- ESI polling suspended during Tranquility downtime (readme): our pollers should too (not verified here).
