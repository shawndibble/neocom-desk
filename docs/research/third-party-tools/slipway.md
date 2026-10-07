# Slipway industry planner

Thread: https://forums.eveonline.com/t/slipway-a-free-industry-planner-what-to-build-where-to-build-it-where-to-sell-it/516921 | read 2026-10-07 (.json summary + slipway.karmikl.space/how-it-works)

## What

Free web planner, no login needed; SSO optional (blueprint ME/TE, skills, hangars, jobs, structure books). Ranks manufacturing/invention/reaction lines; buy hub, build system, sell region chosen independently.

## Features

| Feature                                                        | Tool does | Neocom Desk  | Evidence                                                                                                                            |
| -------------------------------------------------------------- | --------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Rank build lines by profit (mfg, invention, reactions)         | yes       | PARTIAL      | industry-records-sourcing.md: Ranked (owned BPs, ISK/h) + Market-Wide; ranked excludes reactions; invention not ranked (unverified) |
| Buy hub / build system / sell region independent               | yes       | PARTIAL      | our "remembered build system" + hub; sell region choice unverified                                                                  |
| Cap earnings by real daily traded volume x market share        | yes       | PARTIAL      | we have depth (price x listed volume) and "rarely sold <5/day"; no ISK/day cap by traded volume                                     |
| Engineering complex rig bonuses scaled by sec (1.0/1.9/2.1)    | yes       | PARTIAL      | jobCost.ts has structureBonus%; rig-by-security modelling unverified                                                                |
| Plan: capital+slots+horizon -> build queue + shopping list     | yes       | PARTIAL      | industry-plans.md (plans, shopping) but no capital/horizon optimiser                                                                |
| Stock: what completes from hangar without purchases            | yes       | HAVE         | opportunities claim owned stock free (industry-records-sourcing.md:303)                                                             |
| Jobs across all chars + corp, local tz, free slots             | yes       | HAVE         | industry-records-sourcing.md Active jobs, jobSlots.ts                                                                               |
| Trade routes ranked profit per m3                              | yes       | HAVE/PARTIAL | market.md Hauling; rank metric: memory says ISK/jump not m3                                                                         |
| Player-structure order books                                   | yes (SSO) | HAVE         | market.md ESI order book, structures                                                                                                |
| Market browser tracked regions                                 | yes       | HAVE         | market.md Browser                                                                                                                   |
| Outlier filter: refuse prices >10x traded high                 | yes       | MISSING      | not in docs; cheap guard                                                                                                            |
| Formulas published + regression tests pinned to in-game quotes | yes       | n/a          | process idea                                                                                                                        |

## Calculations worth borrowing

- Job fee = EIV x (system cost index x structure cost bonus + structure tax + 4% SCC). Ours (jobCost.ts:32-45): EIV x idx x (1-bonus) + EIV x 4% + EIV x facility tax. Equivalent; SCC applies to EIV not SCI-adjusted value (Namdor bug in thread: ~20% error, 5x quiet systems, 30x invention). Audit ours for invention EIV basis, reaction fee, copy material scaling.
- Material qty = ceil(base x runs x (1-ME/100) x facility mult), per job.
- Invention chance = base x (1 + (dc1+dc2)/30 + encryption/40).
- Realistic ISK/day = profit/unit x min(build capacity/day, daily traded volume x share%).
- Traded volume from ESI history averaged over calendar days, omitting zero-trade days (their note: else 15.5x overstate - NB ours counts zero days as 0 over 30d, conservative; keep).
- Rig security mult 1.0 / 1.9 / 2.1.
- Source: ESI industry/systems hourly, market history, region sweeps.

## Candidate gaps

1. Industry ranking: cap profit by traded volume x market share (ISK/day realism) - confirmed in thread/site; shared idea with our depth metric.
2. Rank invention (T2) lines, and reactions, in Ranked - confirmed in site; check our T2 coverage.
3. Price outlier guard (ignore sell orders >10x traded high) in Market-Wide/Opportunities - confirmed in site.
4. Audit jobCost against the thread's correction (invention EIV basis, reaction fee) - inferred; add regression tests from in-game quotes.

## Pitfall

Fee formula applied to wrong base gave 20-30x errors; pin tests to real in-game quotes. Structure tax/rigs are user-declared there (not detectable) - same for us.

## Out of scope

Hourly region sweeps server-side (we are browser-only; use ESI per-request).
