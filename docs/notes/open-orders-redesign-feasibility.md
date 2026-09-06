# Open Orders redesign — feasibility notes

Scratch findings from reading the code before the mockups. Nothing decided
here; a scope decision (`scripts/new-decision.mjs`) comes after Shawn picks a
mockup.

## What the tab shows today

`src/features/market/OpenOrdersPanel.tsx`: one flat `DataTable` — Item, Side,
Price, Remaining, Issued. Filters: text search + buy/sell chips. No expiry, no
competition, no cost basis. Sorted newest-issued first.

## Undercut tiers are nested, not three independent flags

A cheaper competing sell order at my station is also in my system and in my
region. So `station ⟹ system ⟹ region`, and "which one is it, by importance"
is a single ordinal severity: **the tightest scope that contains a cheaper
order**. One badge + one delta on the row; all three deltas side by side in
the modal.

## Data cost per tier — decides row vs. modal

| Tier              | Source                                                                                        | Cost                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Station           | `market/fuzzwork.ts` aggregates, `?station={id}&types={csv}`, 200 types/request               | Cheap — a few calls cover 100+ orders. **Verify** fuzzwork accepts arbitrary (non-hub) station ids. |
| System + Region   | `features/market/orderBook.ts` `getOrderBook(regionId, typeId)`                               | One paginated ESI call **per type**, 300 s TTL. 80 distinct types = 80 fan-outs. Not eager.         |
| Nearest-hub gap   | fuzzwork station aggregate for the hub + `/route/` for jumps                                  | Cheap per order, batched by hub.                                                                    |
| Region jumps-away | ESI `/route/` origin=my order's system, dest=undercutter's system, then `engine/jumpsAway.ts` | One call per distinct system pair; cache hard.                                                      |

One `getOrderBook` call yields station, system and region tiers at once
(`RegionOrder` carries `location_id` **and** `system_id`), so the split above is
purely about eagerness, not about three different fetches.

Design consequence: **station severity eager on every row; system/region
resolved on demand** (opening the item modal, or an explicit per-row / batch
"check deeper"). All three mockups must show that asymmetry honestly.

## Floor price ("absolute minimum I can sell at")

Chain already exists end to end:

`productionOrderWatches.orderId → runId → ProductionRunRecord.totalCost /
quantity → engine/industry/fees.ts breakEvenPrice(totalCost, qty,
accountingLevel, brokerRelationsLevel)`.

Skill levels come from the corrected trained-skill map
(`SKILL_IDS.accounting`, `SKILL_IDS.brokerRelations`), same as
`productionRunSummary.ts:63`. No settings duplication needed.

**Unsettled:** nothing in the repo models a **relist / modify-order** broker
fee (grep for `relist` → no hits). Broker fee on an order already listed is
sunk, so there are two different floors:

1. floor if it sells as listed (sunk broker fee, sales tax only);
2. floor if I drop the price to react (broker fee charged again on the
   modify).

(2) is the number that matters when reacting to an undercut. Mockups label
which one they show.

## Gaps to design around, not solve now

- **Refine-then-sell**: reprocessing yields (`typeMaterials`) are **not** in
  `scripts/build-sde.mjs` (only blueprint materials are). Needs new SDE data —
  show as a designed-but-blocked state.
- **Player structures**: a character order in a structure has `location_id` +
  `region_id` but no resolvable station or system name (ADR 0003 scope). Station
  and system tiers plus nearest-hub degrade there; region tier still works. Needs
  a graceful unknown state.
- **Buy orders** are _outbid_, not undercut — the buy/sell filter already
  exists, so every mockup must say something sane for a buy row.

## "How long will they be there"

- Literal, free today: `issued + duration` days → expiry countdown. Not shown
  at all right now.
- Useful read: sell-through velocity from `features/market/priceHistory.ts`
  volume — "at this volume it clears in ~40 days". Modal / quick-answer line.

## Sales-problem vocabulary (= the filter set, and the "needs addressing" list)

1. Undercut — station (worst) / system / region, with ISK + % delta, and jumps
   away for the region tier.
2. Priced below floor — fills at a loss.
3. Expiring soon with volume left.
4. Stale — no fills since listing (watched-order `volume_remain` never moved).
5. Off-hub listing where the nearest hub is materially higher.
6. No cost basis linked — cannot be judged at all.
7. Order slots / capital tied up (`engine/market/orderSlots.ts`
   `maxMarketOrders`).

## Round 2 — characters, phone, alerts

### Every selling character at once

`GET /characters/{id}/orders` is **one call per character** and is not
paginated, so a live fan-out across every authenticated Character is cheap —
unlike the PI roster, which is cache-only because it costs one call per
colony. The precedent to copy is `features/character/assets.ts`
`loadAllCharactersAssets`: check `esi-markets.read_character_orders.v1` per
Character **up front**, before any fetch, so a Character without the scope goes
in `skipped` instead of throwing a 403 that raises the app-wide re-auth banner
naming an alt the player never asked about.

Station undercut prices batch by station across every Character at once
(fuzzwork takes 200 type ids per request), so a second Character usually adds
no price lookup at all. System/region stay per item, so character count does
not change their cost.

UI rule: the character row, the row pills and the character filter appear
**only** when more than one Character has open orders.

### The phone reads, the desktop acts

Orders can only be changed in the game client, and the game does not run on a
phone. So the mobile view carries no copy/edit affordances — it answers "what
needs me when I get back". The likely desktop setup is a second monitor beside
the client, which argues for a layout that survives a half-width window and for
copy-to-clipboard prices on desktop only.

### Alerts

Slots straight into the existing notification machinery: adding a polled
domain is one entry in `features/notifications/pollDomains.ts`, `loadOrders` is
already one of them (`marketOrderFilled`), and per-Character inline thresholds
already exist (`CharacterEventThresholds`, issue #299 / #363 — synced).

Proposed events: `orderUndercut`, `orderUnderFloor`, `orderExpiring`,
`orderStale`. Undercut thresholds, each answering a way it gets noisy:

| Setting                | Default               | Kills                           |
| ---------------------- | --------------------- | ------------------------------- |
| Scope                  | station only          | region churn 7 jumps away       |
| Minimum gap            | 1% **and** 50,000 ISK | a rival a few ISK under         |
| Minimum rival stock    | 10 units              | "1 or 2 items that sell anyway" |
| Minimum own order left | 50 units or 10m ISK   | the tail of a nearly-sold order |
| Repeat suppression     | 1 per item per 6h     | a price war pinging all evening |

`orderUnderFloor` deliberately ignores the scope setting: that is the point
where following the price loses ISK.

**Delivery limit, stated on the mockup:** Web Push here is projection-based
(`projectionUpload.ts` uploads _scheduled_ future events). An undercut cannot
be projected, so it is found by the Foreground Poller — while the app is open.

A "try it on today's orders" replay is in the design so the thresholds can be
tuned in a minute instead of over a week.
