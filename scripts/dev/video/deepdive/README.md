# Deep-dive world

Shared mock account for the Neocom Desk product videos. Capture specs call `openWorld` instead of the promo's `openSandbox`. Everything is invented and deterministic (dates are relative to "now").

```ts
import { openWorld } from './world';
import { ARDEN, MIRA, TOBIN, STATIONS } from './cast';
await hideSandboxNoise(page);            // from ../recorder, hides the harmless "Sync error" strip
await openWorld(page, './market/orders', { active: 'arden' });
```

Run a spec: `VIDEO_CHROMIUM=/opt/pw-browsers/chromium VITE_EVE_CLIENT_ID=sandbox VIDEO_OUT=<dir> npx playwright test -c scripts/dev/video/video.config.ts <name>`. Smoke spec: `world-smoke.video.ts` (PNGs in `/mnt/project-files/deep-dive-video/captures/world-smoke/`).

## API: `openWorld(page, path, options)`
| option | default | meaning |
|---|---|---|
| `active` | `'arden'` | `'arden' \| 'mira' \| 'tobin'`, a cast member, or an id |
| `systemId` | home system of the active character | current system (ESI `/location`) |
| `stationId` | home station if system is home, else `null` (in space) | docked station |
| `overview` | trader board (training, wallet, orders, net worth, location, industry, calendar, mail) | `SeededWidget[]`, or `false` for the first-run Role chooser |
| `settings` | none | extra Dexie `settings` rows |
| `before` | none | extra route installers; run after the world's, so they win (e.g. `installCourierContracts`, `installDealContract`) |
| `warm` | `true` | opens Characters and clicks Refresh all first (~5 s) so every character's wallet/skills/queue are in the local cache; set `false` for speed when only the active character matters |
| `scopes` | every scope | SSO scopes in all three tokens |

Also exported: `DEFAULT_OVERVIEW`, `warmRoster(page, path)`. `cast.ts` exports `ARDEN/MIRA/TOBIN` (`{id,name,ownerHash}`), `CAST`, `CORPORATION`, `ALLIANCE`, `SYSTEMS`, `STATIONS`, `REGIONS`, `STATION_PLACE`, `NPC`. `catalog.ts` has `T` (type ids) and `BASE_PRICE`. `market.ts` has `OWN_ORDERS`, `bookAt`, `regionBook`.

## Cast
| | id | role | home | ship | wallet | SP |
|---|---|---|---|---|---|---|
| Arden Kessil | 90000001 (the e2e CHARACTER_ID, so sandbox mail/contracts/calendar/corp data land on him) | active main, combat + trader, Corp CEO-adjacent Director role | Nourvukaiken 3 (system 30001376, Lonetrek 0.82) docked | Gila "Quiet Lantern" | 3,862,419,284.56 | ~599M |
| Mira Voskane | 90000011 | industrialist/miner | Tunttaras 10 - Moon 3 (30001379) | Orca "Salt and Iron" | 612,880,131.40 | ~147M |
| Tobin Raske | 90000012 | hauler | Jita 4-4 (30000142) | Occator "Long Lamp" | 287,455,903.88 | ~62M |

Corporation Halcyon Forge Industries [HFIND] id 98000001 (38 members, CEO "Aria Vance" 91000000); alliance Northern Lantern Collective [NLC] id 99000001. All three characters belong to both. Portraits and corp/alliance logos are generated initials badges (cast ids only).

Skills: Arden has everything in the bundled skill list at V except gunnery/drone support at IV and planet/structure at III. Queue: **Rapid Firing V finishing in ~38 min**, then Surgical Strike V, Controlled Bursts V (queue ~24 d). Mira: industry/science/resource skills V; queue Advanced Mass Production V (6h40m), Caldari Cruiser V, Capital Ship Construction III. Tobin: hauler/freighter/jump skills; queue Gallente Freighter V (3h15m), Minmatar Freighter V, Jump Freighters IV, Trade V. Attributes differ per character; implants and a jump clone each (Arden: Ocular Filter + Neural Boost Improved; clone in Jita).

## Stations (real ids/names)
Nourvukaiken 3 - Caldari Navy Assembly Plant 60003832 (Lonetrek); Tunttaras 10 - Moon 3 - Caldari Navy Logistic Support 60003826 (Lonetrek); Sarekuwa 3 - Moon 8 - Caldari Navy Assembly Plant 60003838 (Lonetrek, orders only); Jita 4 - Moon 4 - Caldari Navy Assembly Plant 60003760 (The Forge); Amarr VIII (Oris) - Emperor Family Academy 60008494 (Domain); Dodixie 9 - Moon 20 - Federation Navy Assembly Plant 60011866 (Sinq Laison); Rens 6 - Moon 8 - Brutor Tribe Treasury 60004588 (Heimatar).

## Open orders (25 sells + 2 buys, market.ts `OWN_ORDERS`)
Arden (11 sells, 1 buy): Drake x9/14 @Nourvukaiken **undercut 1.2%** (shown "Undercut to 42,800,000"); Heavy Missile Launcher II @Jita; Scourge Fury Heavy Missile 74k/120k @Tunttaras **undercut 2.1%**; Damage Control II @Jita **expires in ~18 h**; Large Shield Extender II 7/12 @Nourvukaiken **beaten only by Mira's cheaper order** (the "own rival" case); Ballistic Control System II @Jita; Hobgoblin II @Nourvukaiken; Gila 3/4 @Jita **undercut 0.9%**; Medium Shield Extender II @Tunttaras **expires in ~10 h**; Warp Disruptor II @Sarekuwa; Stasis Webifier II @Jita. Buy: Tritanium 5.35M/8M @Nourvukaiken.
Mira (8): Large Shield Extender II 6/10 @Nourvukaiken (lowest price in book); Hurricane; Retriever 4/6 @Tunttaras **undercut 1.6%**; Rifter; Nanite Repair Paste; Inertial Stabilizers II @Jita; Cap Booster 400; Hornet II @Sarekuwa.
Tobin (6 sells, 1 buy): Compressed Veldspar/Pyroxeres @Tunttaras, Compressed Scordite and Mexallon @Nourvukaiken, Tritanium and Pyerite @Jita. Buy: Isogen 412k/600k @Jita.
So four undercuts exist (Drake, Scourge Fury, Gila, Retriever). On the Open Orders page the default scope is the active character, so Arden shows 3 undercut + 2 expiring ("5 orders need you"). Switch the scope to all characters to see Mira's Retriever and the own-rival Large Shield Extender II. Competing orders exist in the region order book (`/markets/{region}/orders?type_id=`, ids 71xxxxxxxx) and in the Fuzzwork aggregates.

## Market model
One model drives everything (`market.ts`, prices from `catalog.ts`): Fuzzwork aggregates (`station=` and `region=`), region order books, region history (90 d), `/markets/prices`, and Open Prices (R2) all derive from `bookAt`. Compressed ore is priced like raw ore (as the sandbox does). Other stations/types get deterministic filler depth.

## Wallet
Per character, 30 days of journal (about 300 rows for Arden) with running balances consistent with the current balance, plus market transactions with real type ids: market sells/buys, transaction tax (3.37%), broker fees, bounty prizes (Arden), agent mission rewards (Arden), insurance payout 62.34M and premium (Arden, Gila), manufacturing job costs (Mira), courier contract rewards (Tobin), and `player_donation` transfers between the three (27d Arden to Mira 120M, 21d Tobin to Arden 40M, 14d Mira to Arden 250M, 8d Arden to Tobin 150M, 3d Mira to Tobin 35M; the app reports "4 entries between your Characters left out" for the active view). Order history: 4 finished/expired orders each.

## Assets (six stations)
- Arden, Nourvukaiken: Gila "Quiet Lantern", Drake x3 ("Halcyon Drake 1-3"), Hurricane "Forge Hurricane"; modules, Scourge Fury/Heavy, Void M, 1.24M Tritanium; **loot pile for Appraisal** (salvage and loot: Melted Capacitor Console 124, Damaged Artificial Neural Network 46, Tripped Power Circuit 212, Burned Logic Circuit 68, Contaminated Nanite Compound 39, Alloyed Tritanium Bar 905, Conductive Polymer 77, Charred Micro Circuit 95, Smashed Trigger Unit 31, Ward Console 18, Lorentz Fluid 12, Fried Interface Circuit 9, Broken Drone Transceiver 54, Armor Plates 140). Jita: stock modules, boosters, drones, Mobile Tractor Units. Tunttaras: ammo, shield extenders, Nanite Repair Paste. Amarr: Hurricane "Amarr Runabout", MWDs, armor repairers.
- Mira: Tunttaras: Orca, 2 Retrievers, 3 Hurricanes, compressed and raw Veldspar/Scordite/Pyroxeres, Plagioclase; Dodixie: bulk minerals (3.2M Tritanium ... Morphite); Nourvukaiken: a Rifter, cap boosters.
- Tobin: Jita: Occator "Long Lamp", Iteron Mark V x2, Badger, compressed ore stacks (Veldspar, Scordite, Pyroxeres, Plagioclase, Kernite); Amarr: Viator "Needle and Thread", Bustard "Lockbox"; Rens: Charon "Long Haul Lantern".
Pasteable loot text for Appraisal: `Melted Capacitor Console<TAB>124` etc., one `Name<TAB>qty` per line.

## Other data
Industry jobs: Mira 10 (5 running, 2 ready, 3 delivered; Hurricane, Rifter, Retriever, LSE II...), Arden 2. Blueprints for Mira and Arden. Mining ledger: Mira only, Lonetrek belts, 26 days. Mail, contracts, calendar, contacts, corporation roster/wallet/structures for the corp: the sandbox's generated data, keyed to Arden only.

## ESI mocked by the world (all three characters unless noted)
`/characters/{id}` (public info), `skills`, `skillqueue`, `attributes`, `implants`, `clones`, `wallet`, `wallet/journal`, `wallet/transactions`, `orders`, `orders/history`, `assets`, `assets/names`, `location`, `ship`, `online`, `industry/jobs`, `blueprints`, `mining/`, `corporationhistory`; `/universe/names`, `/characters/affiliation`, `/corporations/{id}`, `/alliances/{id}`, `/universe/systems|stations|types|regions/{id}` (from public/data), `/markets/prices`, `/markets/{region}/orders|history`; Fuzzwork aggregates; Open Prices. Arden's mail/contracts/calendar/contacts/roles/labels fall through to the sandbox. Alts' unhandled `/characters/{altId}/...` paths answer empty (`[]` or the right empty object). Anything else falls through to the e2e mock and the sandbox, then the network.

## Limitations
- The Characters roster and other cache-read widgets only show the alts after `warm` (default on).
- Net Worth widget says "No net worth recorded yet" (needs history the app writes itself); skip it or let a spec build history.
- Arden's mail comes from the sandbox: some are "from" Arden himself; corp structure names are the sandbox's "Dev Athanor ..." etc. (not "Test").
- Arden's SP (~599M) is higher than the game cap because every skill in the bundled list is trained.
- Standings, loyalty points, fittings, planets, notifications are empty for every character; contracts exist for Arden only (use `installCourierContracts` / `installDealContract` from `../` via `before`).
- Ship asset rows in the Ships list show "Group 26"-style labels because the world answers ESI group lookups from the bundled type table only.
- `images.evetech.net` ship renders and icons are real network calls (they need the proxy); character/corp/alliance images are generated.
