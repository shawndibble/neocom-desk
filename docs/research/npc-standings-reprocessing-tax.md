# NPC station reprocessing tax vs. standing

Researched 2026-10-28. Read-only. No CCP page states the standing curve; CCP only fixes the endpoints indirectly.

## Summary table

| Fact                                 | Value                                                                                                                                         | Source                                                                                                                                                                                                                                                                                                              | Confidence                                                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base take at 0 standing              | 5% of the ISK value of the refined output at 99.9% of NPC stations (5,091 of 5,210 in the SDE)                                                | Fuzzwork dump of the SDE `staStations.csv` (last modified 2026-10-27); live ESI `GET /universe/stations/{id}` field `reprocessing_stations_take` (CCP)                                                                                                                                                              | HIGH (CCP data)                                                                                                                                                    |
| Exceptions to the 5% base            | 2.5% at 119 stations (`reprocessingStationsTake` = 0.025)                                                                                     | Same SDE CSV; ESI confirmed for 3 of them (60001945, 60014842, 60014935)                                                                                                                                                                                                                                            | HIGH                                                                                                                                                               |
| Curve between 0 and 6.67             | Linear: `tax = 5% - 0.75% x standing`, floored at 0. Equivalent: `base x (1 - 0.15 x standing)`                                               | EVE Uni "Tax"/"Reprocessing" give only the endpoints (5% at 0, 0% at 6.67, "falls"). Adam4EVE "Formulas for EVE Industry" v2.2 by Qoi (2016-03-11): `StationTax = 5.0% - (0.75% * YourCorporationStanding)`. Forum post by player Zifrian, 2021-12-25: `TaxRate = StationBaseTaxRate * (1 - (0.75 * Standing) / 5)` | MEDIUM. Three independent community sources agree and the arithmetic is consistent, but CCP has never published it. The poster himself called it "in the ballpark" |
| Zero-tax standing                    | 6.67 (modified), i.e. 5 / 0.75                                                                                                                | EVE Uni NPC_standings ("6.67 modified: Tax-free refining"), EVE Uni Tax, forum posts 2019                                                                                                                                                                                                                           | MEDIUM-HIGH (many sources agree; none is CCP)                                                                                                                      |
| Which standing                       | Standing toward the NPC corporation that owns the station. The faction's standing is not used                                                 | CCP Ytterbium's 2016 Citadels post: "reduced by your standings [toward] the NPC corporation owning the station". EVE Uni NPC_standings: "Corporation standing ... is used ... to lower broker and reprocessing fees". Forum DragoFire 2022: faction standing "seem[s] to have no direct affect"                     | MEDIUM-HIGH (corp, not faction). CCP statement was a 2016 proposal, not a shipped spec                                                                             |
| Personal vs. player-corp standing    | "Whichever is higher" of your personal standing and your player corporation's standing toward the owner                                       | EVE Uni Reprocessing and Tax pages only                                                                                                                                                                                                                                                                             | LOW-MEDIUM (wiki only; no second source)                                                                                                                           |
| Base or effective                    | Effective (modified): skills count. Effective = base + (10 - base) x 0.04 x Connections level                                                 | EVE Uni Reprocessing ("Connections ... increase your effective standing"), Zifrian formula, EVE Uni Connections page (4%/level)                                                                                                                                                                                     | MEDIUM                                                                                                                                                             |
| In-game / data term                  | "Reprocessing tax" (wallet journal `ref_type` = `reprocessing_tax`). ESI/SDE field is `reprocessing_stations_take`. Wiki says "Equipment tax" | ESI OpenAPI `https://esi.evetech.net/meta/openapi.json` (enum list); ESI station schema; CCP forum post                                                                                                                                                                                                             | HIGH for the journal term, MEDIUM that the client's reprocessing window uses the same label (UNVERIFIED, see below)                                                |
| Tax base                             | A percentage of the ISK value of the refined minerals (CCP adjusted price), charged in ISK, and logged in the journal. Not a loss of yield    | CCP Ytterbium 2016 post (proposal: "payable in ISK only", "logged into the transactions part of the journal"); ISD Sakimura 2020: "percentage, set by the station owner, of the isk value of the minerals outcome"; Zifrian: `ADJUSTED_ITEM_PRICE * RefinedMaterialQuantity * TaxRate`                              | MEDIUM-HIGH                                                                                                                                                        |
| Upwell structures                    | The owner sets any rate, including 0%. NPC standings do not apply (owner may set standing-based rates)                                        | CCP Ytterbium 2016: "Reprocessing taxes inside a Citadel will be left entirely to the owner, no NPC tax will be enforced"; EVE Uni Reprocessing                                                                                                                                                                     | HIGH                                                                                                                                                               |
| Other things that change the NPC tax | None found. Skills and implants change yield, not the tax                                                                                     | see below                                                                                                                                                                                                                                                                                                           | MEDIUM                                                                                                                                                             |

## Details

### 1. Formula

- CCP has not published the curve. Every source that gives the shape is a community source.
- Adam4EVE "Formulas for EVE Industry" v2.2 by Qoi (2016-03-11), https://static.adam4eve.eu/Guides/Formulas/IndustryFormulas.pdf (I decompressed the PDF text myself). It gives `StationTax = 5.0% - (0.75% * YourCorporationStanding)` and "You need 5%/0.75% = 6.67 Standing to pay no Station Tax".
  - It is old. It models the tax as a yield cut (`rate = ... * (1 - StationTax)`), which was how the tax worked before the Citadel ISK change.
  - It only fixes the shape of the curve.
- Forum post by Zifrian, 2021-12-25, https://forums.eveonline.com/t/reprocessing-tax-at-structures/343134 . Not CCP.
  - `Standing = UnadjustedCorpStanding + (10 - UnadjustedCorpStanding) * (0.04 * Connections)`
  - `TaxRate = StationBaseTaxRate * (1 - (.75 * Standing) / 5)`
  - He says the base is usually 5% "with a few stations at 2.5%", which matches the SDE counts.
  - `1 - 0.75 x s / 5` simplifies to `1 - 0.15 s`, so the curve is the same as Qoi's for a 5% station.
- EVE University Tax and Reprocessing pages, raw wikitext (`index.php?title=Tax&action=raw`, `...Reprocessing&action=raw`): "The tax starts at 5% with 0 standings and falls to 0% at 6.67 standings with the station owner". Endpoints only. The wiki never states linearity.
- Sanity check: 5% x (1 - 0.15 x 6.67) = 5% x (1 - 1.0005), which is just below 0, so the floor at 0 matters. The curve has to be clamped.
- Plain statement the app can use, at MEDIUM confidence: "The base 5% falls by 0.75 percentage points for every point of standing, reaching 0% at 6.67."
- The wiki's claim that "Connections V will cut your corporation tax by 25%" does not match the 4%/level formula. At 0 standing, Connections V gives effective 2.0, so tax = 3.5%, a 30% cut. Treat the wiki's 25% as stale.

### 2. Which standing

- CCP Ytterbium, the "[Citadels] Changing NPC taxes" feedback thread, 2016, https://forums-archive.eveonline.com/message/6374361/ (the live archive returned 503 for me; I read the Wayback copy, http://web.archive.org/web/20251116042249/https://forums-archive.eveonline.com/message/6374361/). The text says the ISK tax "would apply to NPC stations as well and still be reduced by your standings [toward] the NPC corporation owning the station". It was a "we are thinking of" proposal. The ISK change did ship (a 2016 player post says "used to be taken in kind but is now charged in ISK"; the wallet `reprocessing_tax` type exists).
- Faction standing:
  - No source says the faction counts. A 2022 player (DragoFire) says faction standing has no direct effect and corp standing does.
  - EVE Uni NPC_standings lists the 6.67 modified tax-free refining threshold in the Corporation standings table, not the faction table.
  - I would say "corporation standing".
- "Higher of personal and player-corp standing":
  - Appears only in the EVE Uni Tax and Reprocessing pages.
  - Qoi's PDF and Zifrian say "corp standing", which most likely means standing toward the NPC corp.
  - UNVERIFIED beyond the wiki.
- Base vs. effective:
  - NPC_standings labels the 6.67 threshold "modified".
  - Reprocessing wiki says Connections counts, with a caveat that it is ignored until you complete a mission for that corp. That caveat is LOW confidence and unverified.
  - This differs from the broker fee, which uses unmodified standings (from the CCP broker fee article, per the previous research).

### 3. SDE / ESI data

Source: Fuzzwork `https://www.fuzzwork.co.uk/dump/latest/csv/staStations.csv` (a mirror of the SDE; dump folder dated 2026-10-27), read from `scratchpad/fz/staStations.csv`. Live ESI `GET /latest/universe/stations/{id}/` returns the same values (CCP-served): Jita IV Moon 4 Caldari Navy Assembly Plant = take 0.05, efficiency 0.5.

- 5,210 NPC stations. `reprocessingStationsTake`:
  - 0.05: 5,091 stations.
  - 0.025: 119 stations.
  - No other values.
- Stations at 0.025:
  - Mostly navy, militia and pirate corps: 24th Imperial Crusade, State Protectorate, Federal Defense Union, Tribal Liberation Force (the four militia corps), Caldari Navy, Blood Raiders, Home Guard.
  - Also some ordinary corps, such as Kaalakiota, Polaris and Nugoeihuvi.
  - Station types vary.
  - So 2.5% is a per-station data value. The app should read the per-station field rather than hardcode 5%.
- `reprocessingEfficiency` (the yield, a separate thing): 0.5 (4,649), 0.3 (262), 0.32 (161), 0.4 (65), 0.35 (55), 0.25 (18).
- All stations with take 0.025 combine with efficiency 0.5 (118) or 0.4 (1). The 5% stations carry all the efficiency values.
- The official SDE zip (developers.eveonline.com static-data) did not download here (returned a 111-byte error), so Fuzzwork and ESI are the evidence.

### 4. Other things that change what a player pays at an NPC station

- Skills (Reprocessing, Reprocessing Efficiency, ore skills, Scrapmetal Processing) and the Beancounter RX implants change yield only. Qoi's PDF writes the yield rate as a separate multiplication from the tax. I found no source in which they change the tax.
- Scrapmetal Processing applies to non-ore items and affects yield, not the tax. The tax percent is the same.
- The tax applies to every NPC refining job at that station. I did not find a minimum fee or an exemption.
- An NPC station's tax is a percentage of the value of the output (CCP adjusted price), not of the input. Market price is not used.
- Upwell structures: the owner's rate, with no NPC standing curve. The rate is visible in the Structure Browser (ISD Sakimura said hovering the reprocessing icon shows it; this is also in the EVE Uni Reprocessing page).
- Not found: any faction-standing term, system-security modifier, or implant modifier on the tax.

### 5. Wording

- CCP's own data uses "reprocessing": the wallet journal entry type is `reprocessing_tax` (ESI OpenAPI enum), and the station field is `reprocessing_stations_take`.
- CCP Ytterbium: "reprocessing taxes". The EVE Uni wiki uses "Equipment tax", a name not found in CCP data. The EVE Uni Refining page now redirects to "Reprocessing".
- The repo already uses "Reprocessing tax" (`src/i18n/locales/en.json`, `refiningTaxLabel`), which matches CCP's journal wording.
- I could not confirm the exact label the client shows in the reprocessing window or the Structure Browser tooltip.
- Do not use "refining tax" (the wiki's mixed usage) or "station take" (the field name).

## UNVERIFIED (do not state without a caveat, or verify in game)

1. That the curve is exactly linear. Verify in game: reprocess a fixed batch at a 5% station at two known standings and compare the journal `reprocessing_tax` amounts.
2. Whether a 2.5% station follows `2.5% x (1 - 0.15 s)` (Zifrian, multiplicative) or `2.5% - 0.75% x s` (Qoi, subtractive, zero at 3.33). They conflict; I would trust the multiplicative form as the newer source.
3. Whether the wiki's "higher of personal and corporation standing" is true.
4. Whether the Connections skill counts (effective standing) and the wiki's "no effect until one mission completed" claim.
5. The client's own label for the tax in the reprocessing window and the Structure Browser.
6. The exact rounding point where the tax reaches 0 (6.67 vs. 6.6667). 5 / 0.75 = 6.6667.
7. Whether CCP's `reprocessing_stations_take` is the base before the standing reduction. This is probable (all values are 0.05 or 0.025 and none are standing-dependent), but CCP does not document it.

## Suggested UI wording (if no caveat is wanted, use only the HIGH/MEDIUM-HIGH parts)

- "NPC stations charge a reprocessing tax of up to 5% of the refined output's value (2.5% at some stations), falling to 0% at 6.67 standing with the station's owner corporation."
- Leave out the exact slope, or add "about", until item 1 is verified in game.
