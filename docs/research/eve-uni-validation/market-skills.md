# EVE Uni validation: market fees and skills

Area: market-skills. Wiki fetched 2026-10-07 via WebFetch (summarising fetcher; quotes are the fetcher's, not byte-verified). Primary cross-checks: CCP patch notes, SDE descriptions in `public/data/skills.json`.

## Verdict counts

| Verdict       | Count                         |
| ------------- | ----------------------------- |
| MATCH         | 24                            |
| MISMATCH      | 1 (wiki side, minor rounding) |
| WIKI SILENT   | 8                             |
| WIKI OUTDATED | 0                             |
| WE LACK       | 5                             |

## Matrix

| #   | Rule                                                                          | Ours                                                                                       | Wiki (URL, section, date)                                                              | Verdict                                                                 |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Sales tax = 7.5% x (1 - 11% x Accounting)                                     | `src/engine/industry/fees.ts:18-38`                                                        | Trading, Sales Tax, 4 Aug 2026; Tax 23 May 2026. CCP 22.02 (2025-03-12) 4% -> 7.5%     | MATCH (wiki prints 3.37%/3.3% for level V; true 3.375%, see wiki-fixes) |
| 2   | NPC broker fee = 3 - 0.3 BR - 0.03 faction - 0.02 corp                        | `fees.ts:41-53` (floor 0)                                                                  | Trading, Broker's Fee                                                                  | MATCH                                                                   |
| 3   | Standings are unmodified, -10..10                                             | `market/standings.ts:44-58`                                                                | Tax: "unmodified standings"                                                            | MATCH                                                                   |
| 4   | 100 ISK minimum broker fee, per order                                         | `fees.ts:24,69`                                                                            | Trading: "Minimum fee is 100 ISK"                                                      | MATCH (no CCP source found)                                             |
| 5   | Player-structure broker fee = 0.5% + owner %                                  | none (NPC rate only; `standings.ts:49` zeroes standings for structures but rate stays NPC) | Trading, Player Structures; CCP Viridian notes: fixed 0.5% SCC                         | WE LACK                                                                 |
| 6   | Relist: ABR discount 50% + 6%/lvl (80% at V)                                  | `fees.ts:77-97`                                                                            | Trading Relist; Skills:Trade                                                           | MATCH                                                                   |
| 7   | Relist = full rate on price increase increment + discounted rate on new total | `fees.ts:106-131` (SDE ABR description 16597)                                              | Trading: "new order value plus any increase"                                           | MATCH (wording; arithmetic from SDE)                                    |
| 8   | Net-of-fees totals (instantNet, listNet)                                      | `market/appraisal.ts:361-397`                                                              | silent (derived)                                                                       | WIKI SILENT                                                             |
| 9   | Price Percent 0..1000, scales buy/sell, net always at 100%                    | `features/market/pricePercent.ts`, `appraisal.ts:213`                                      | silent (app concept)                                                                   | WIKI SILENT                                                             |
| 10  | Price tick: 4 significant figures, 0.01 floor                                 | `market/priceTick.ts:35-76`                                                                | Trading/Market: absent. CCP March 2020 patch notes: "maximum of 4 significant figures" | WIKI SILENT (CCP confirms)                                              |
| 11  | Undercut at power of ten uses smaller tick (1000 -> 999.9)                    | `priceTick.ts:87-96`, test `priceTick.test.ts:108`                                         | silent                                                                                 | WIKI SILENT                                                             |
| 12  | Expected Sell Price = min(undercut, 7d recent median), floor to tick          | `haulingMarket.ts:248-256`                                                                 | silent (app heuristic)                                                                 | WIKI SILENT                                                             |
| 13  | Hauled volume = packaged volume, fallback volume                              | `src/sde/marketTypes.ts:29-31`, `appraisal.ts` rowVolume                                   | Assembling and repackaging (search snippet): ships far smaller packaged, modules same  | MATCH (partial, snippet only)                                           |
| 14  | Order slots: base 5, Trade 4, Retail 8, Wholesale 16, Tycoon 32 per level     | `orderSlots.ts:14-26`                                                                      | Skills:Trade: Trade 4, Tycoon 32; Retail/Wholesale not in extract                      | MATCH (2 of 4); other two WIKI SILENT                                   |
| 15  | LP: ISK/LP = (revenue - tax - broker - ISK - items - build)/LP                | `loyalty/offerProfit.ts:80-129`                                                            | Loyalty points, 20 May 2025: advises ISK/LP, ~1,000 baseline, fees not addressed       | WIKI SILENT on fees                                                     |
| 16  | LP conversion (CONCORD 1:0.8 Empire, 1:0.4 other)                             | none                                                                                       | Loyalty points                                                                         | WE LACK                                                                 |
| 17  | Compare margin: broker both sides + tax on sell                               | `appraisal.ts:415-440`                                                                     | silent                                                                                 | WIKI SILENT                                                             |
| 18  | SP(level) = ceil(250 x rank x sqrt(32)^(L-1))                                 | `sp.ts:24-29`, test `sp.test.ts:14-18`                                                     | Skills and learning, 19 Apr 2026: table L2 "1,414", L3-5 8,000/45,255/256,000          | MISMATCH at L2 (we 1,415); wiki L4 already rounded up                   |
| 19  | Rank multipliers                                                              | SDE ranks: Accounting 3, BR 2, ABR 3, Trade 1                                              | Skills:Trade: Accounting 3x, BR 2x, ABR 3x, Trade 1x, Tycoon 6x                        | MATCH (SDE Tycoon 6)                                                    |
| 20  | Training rate = primary + secondary/2 SP/min                                  | `sp.ts:89-99`                                                                              | Skills and learning; Attributes                                                        | MATCH                                                                   |
| 21  | Alpha = half rate                                                             | `sp.ts:83,98`                                                                              | Skills and learning: (P/2)+(S/4); Alpha clone                                          | MATCH                                                                   |
| 22  | Remap space: 99 pts, 17..27                                                   | `attributeBaseline.ts:245-249`, `bestAttributes.ts:35-37`                                  | Attributes: 99, 14 free, 17/27                                                         | MATCH                                                                   |
| 23  | Remaps = bonus + yearly (ready when cooldown past)                            | `features/skills/planner/remapAvailability.ts:17-31` (reads ESI)                           | Attributes: 365-day yearly, 2 bonus, normal used first                                 | MATCH (we delegate 365d to ESI date)                                    |
| 24  | Default spread 20/20/20/20/19                                                 | `bestAttributes.ts:40`                                                                     | Skills and learning                                                                    | MATCH                                                                   |
| 25  | Implant bonuses +1..+5                                                        | `types.ts:46`, `schedule.ts:113`                                                           | Attributes: +1..+5                                                                     | MATCH                                                                   |
| 26  | Cerebral accelerator: uniform bonus, one at a time                            | `attributeBaseline.ts` doc, `Booster`, UI overlap rejection                                | Cerebral accelerator: uniform, one slot                                                | MATCH                                                                   |
| 27  | Accelerator duration x Biology (+20%/lvl)                                     | none (user enters expiry)                                                                  | Attributes: +20%/level                                                                 | WE LACK                                                                 |
| 28  | Large injector brackets 500k/400k/300k/150k at <5M/<50M/<80M/else             | `skillInjectors.ts:117-128`                                                                | Skill trading, 7 Jul 2025; web search concurs                                          | MATCH (boundary: 5M exactly is 400k, wiki "5-50M")                      |
| 29  | Extraction floor 5,000,000; chunk 500,000                                     | `spExtraction.ts:170-187`                                                                  | Skill trading: min 5.5M to use extractor                                               | MATCH                                                                   |
| 30  | Alpha per-skill level caps                                                    | `alphaCap.ts` (SDE alphaMaxLevel)                                                          | Alpha clone, 15 Feb 2026                                                               | MATCH                                                                   |
| 31  | Alpha 5M free SP cap / 20M with injectors                                     | none                                                                                       | Alpha clone, Clone states                                                              | WE LACK                                                                 |
| 32  | Queue timing: rate piecewise with booster breakpoints; partial level credit   | `schedule.ts:62-174`                                                                       | silent                                                                                 | WIKI SILENT                                                             |
| 33  | Hauling trip sizing (sales/supply/space/budget)                               | `haulingPlan.ts`                                                                           | silent                                                                                 | WIKI SILENT                                                             |
| 34  | Remap optimizer, max 2 remaps                                                 | `optimizer/placeRemaps.ts`                                                                 | silent                                                                                 | WIKI SILENT                                                             |
| 35  | Injector count walk (yield by running total)                                  | `skillInjectors.ts:144-157`                                                                | Skill trading brackets                                                                 | MATCH                                                                   |

(Count rows 1-35 are not 1:1 with the table above; verdict totals count each row once with partial rows by primary verdict. Treat counts as approximate.)

## MISMATCH analysis

Row 18, rank-1 level II. Ours 1,415, wiki 1,414. 250 x 2^2.5 = 250 x 5.6568542 = 1414.2136. Code rounds up (`Math.ceil`), test `sp.test.ts:16` says 1,415; wiki L4 shows 45,255 from 45,254.8 which is also a round-up, so wiki is internally inconsistent. Ours right (inferred; no ESI fixture in repo). Rows 1: wiki prints 3.37%/3.3% for Accounting V; exact 3.375% (confirmed arithmetic). See wiki-fixes file.

## Proof plans

1. Sales tax. Source: CCP 22.02 notes; SDE Accounting description. Example Accounting III: 7.5 x (1 - 0.33) = 5.025%; on 10,000,000 = 502,500. Accounting V: 3.375% -> 337,500. Test: `fees.test.ts:15` exists (checks 7.5 base and V, vector assumed). Missing: Accounting III 10M = 502,500 vector (propose `salesTax III on 10M`).
2. Broker fee with standings. BR5, faction 5, corp 5: 3 - 1.5 - 0.15 - 0.10 = 1.25%; on 8,000,000 = 100,000 (above floor). Max standings 10/10: 3-1.5-0.3-0.2 = 1.0% (wiki "1%"). Test `fees.test.ts:34` exists (standing test). Propose `broker fee 1.0% at BR5 + 10/10`.
3. Broker minimum. Value 5,000 at 1.5% = 75 -> 100 ISK. Test `fees.test.ts:63` exists. Independent source weak (wiki only); needs in-game check. Propose in-game confirmation, no code.
4. Relist. BR5 ABR5, old 100, new 120, qty 1,000, no standings: rate 1.5%; increase 20 x 1000 = 20,000 x 1.5% = 300; discounted rate 1.5 x 0.2 = 0.3% x 120,000 = 360; total 660. Decrease to 90: 0.3% x 90,000 = 270. Source: SDE ABR description. Test `fees.test.ts:115-130` covers both branches (vectors not re-read). Missing: this exact vector; propose `relistFee 660 vector`.
5. Price tick. Source: CCP March 2020 notes. 1,233,456 -> 1,233,000 (`roundPriceDown`); 12.345 -> 12.34; undercut(1000)=999.9, undercut(10000)=9999, outbid(999.9)=1000. All asserted: `priceTick.test.ts:43-45,108-111,140-142`. Missing: sub-1 ISK band (e.g. 0.5 -> tick 0.01; 0.5 is below 4-sig tick 0.0001 but floor 0.01) - propose `priceTick(0.5) = 0.01`; wiki silent, needs CCP/in-game confirmation that floor is 0.01.
6. Expected Sell Price. No external source (app heuristic). Vector: lowest ask 1,000, recent 950 -> undercut 999.9, min = 950, roundPriceDown 950. Test `haulingMarket.test.ts` presumably; propose `estimateSale picks lower of undercut and recent` if absent.
7. Net totals/compareMargin. Example fees Accounting V, BR0, no standing: sell 1,200,000 buy 1,000,000: 200,000 - 40,500 - 36,000 - 30,000 = 93,500. Test `appraisal.test.ts:665-672` matches exactly this shape.
8. LP ISK/LP. Revenue 10,000,000 at Accounting V, BR5 listing: tax 337,500; broker 150,000; net 9,512,500; ISK cost 1,000,000; LP 2,000: profit 8,512,500 -> 4,256.25 ISK/LP. Tests at `loyalty/offerProfit.test.ts:11,75,98` cover shape; propose exact vector `ISK/LP 4256.25`.
9. SP formula. Source: SDE ranks + ESI skill list `level_end_sp` (not in repo). Rank 3 L4: 3 x 45,254.834 = 135,764.5 -> 135,765 (`sp.test.ts:28`). Propose in-game confirmation of 1,415 via ESI `skillpoints_in_skill` after completing a rank-1 level II.
10. Training rate. P=27, S=21: 27 + 10.5 = 37.5 SP/min; Alpha 18.75. 256,000 SP at 37.5 = 6,826.7 min = 4.74 days. Test: `sp.test.ts` trainingRate cases (not re-read); propose vector if missing.
11. Remap rules. Legal sheets sum 99, in 17..27; default 20x4+19 = 99. Tests `attributeBaseline.test.ts:30-56`. Yearly 365d: ours reads ESI `accrued_remap_cooldown_date`; no own arithmetic. Test for remapAvailability should include cooldown in past/future (propose if absent).
12. Injectors. From 4,800,000, gap 1,000,000: 500k (total 4.8M) -> 5.3M; 400k -> 5.7M; 400k -> 6.1M; delivered 1.3M, count 3, surplus 300k. Test `skillInjectors.test.ts:35` crosses the 5M bracket (vector not re-read); propose this vector. Boundary: exactly 5,000,000 -> 400k (test `:9`); CCP wording of the boundary unconfirmed.
13. Extraction. 5,999,999 -> extractable 999,999 -> 1 extractor; 5,499,999 -> 0; 5,500,000 -> 1. Tests `spExtraction.test.ts:44-49` (not re-read). Wiki "5.5M minimum" agrees.
14. Accelerator baseline. 99 + 5 x 12 = 159 accelerator-inflated sheet; (159-99)/5 = 12. Test `attributeBaseline.test.ts:83`.
15. Packaged volume. SDE/ESI `packaged_volume`; example Catalyst assembled 47,000 vs packaged 5,000 m3 (from memory, verify). Propose test `packagedVolumeOf falls back to volume`.
16. Hauling plan, order slots: max slots 5+20+40+80+160 = 305; Trade V 20 + base 5 = 25.

## Rounding and ordering notes

- SP uses ceil after multiplying by rank (`sp.test.ts:26`). Wiki table is rounded inconsistently.
- Broker minimum applied once per order/stack, not per unit (`offerProfit.ts:97-109`, `orderFloor.ts`). Wiki says "per order"; in-game stack-vs-unit behaviour matches order.
- Relist minimum applied after summing both components (`fees.ts:130`).
- Tick rounding in integer cents (`priceTick.ts:11`).

## Candidate gaps (WE LACK)

- Player-structure broker fee 0.5% + owner % (configurable owner rate).
- CONCORD LP conversion 1:0.8 / 1:0.4.
- Alpha 5M free SP / 20M injector cap in plan scheduling.
- Cerebral accelerator duration scaled by Biology (+20% per level).
- Alpha max level for Retail/Wholesale etc. exists in SDE but unvalidated.

## Open questions

- Wiki skill formula literal text (see wiki-fixes unresolved).
- Cerebral accelerator +2/+4 vs +3/+12 wiki disagreement.
- Is the 100 ISK minimum broker fee still in game? Wiki only.
- Retail/Wholesale slot values not verified against wiki.
- Unreadable: https://support.eveonline.com/hc/en-us/articles/203218962 (403); wiki /Skill_points and /Skill_injector 404.
