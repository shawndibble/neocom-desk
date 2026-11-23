# Campaign turn-ins

Source: `src/mockups/CampaignTurnIns{Detail,Appraisal,MarketItem,OpenOrders,Assets,Hauling,Widget}.stories.tsx` (Storybook `mockups/CampaignTurnIns/*`). Shared pieces are in `src/mockups/campaignTurnInsParts.tsx` and `campaignTurnInsFixtures.ts`. Grilling session (no issue yet). Sample data; the ticket text wins over the picture.

Seed: Fractured Skies "item traded" Campaign Objectives.

- Shield Failover Report and Federation Strategic Intel: Secure Strength Trader, Onnamon.
- Stereo-Collapse Signal: Trail of Silence Trader, Amo.
- Thermoelectric Flux Log: Into the Light Trader, Mehatoor.

Turn-in Reward = ISK each + LP per full 100 items × LP Value (800 ISK/LP assumed). Shield Failover Report pays 28,000 ISK + 40 LP (~32k) = ~60k. Faction tokens are never counted, only shown as "+ faction tokens".

## TurnInDetail: one popover everywhere

Every surface opens the same single-item popover, `TurnInDetail`, from its own trigger. It shows:

- the item;
- the reward each and its ISK + LP split;
- the Item Trader and system;
- how full the objective is, as a bar and "% filled";
- the Character's Participate state;
- "LP paid per full 100 items · + faction tokens";
- **Set destination**.

The amber `PermissionCellMark` (a new reusable primitive) appears inside the popover in two places:

- **Military Campaigns missing:** the mark sits by "Pays only if you've pressed Participate". When the Permission is dismissed, the line shows with no mark.
- **Autopilot waypoints missing:** Set destination stays visible but aria-disabled, with the mark after it and no reason text. When the Permission is dismissed, there is no mark and the disabled button's tooltip names the Permission.

| | 1440 | 390 |
|---|---|---|
| Every variant | ![](detail-all-variants-1440.png) | ![](detail-all-variants-390.png) |
| Military Campaigns mark pressed | ![](detail-military-campaigns-mark-open-1440.png) | |
| Autopilot waypoints mark pressed | ![](detail-waypoints-mark-open-1440.png) | |

## Appraisal (Market › Appraisal)

The Turn in pieces sit where Refine's do:

- A **Turn in** total in the facts row, which opens the `TurnInBreakdown` modal: items grouped by War HQ, a subtotal for each, and Set destination and Copy list for each War HQ.
- A **Turn in** column. Each row's figure opens TurnInDetail.
- In the actions menu, **Turn in** splits per Item Trader.

The earlier group block above the table is gone.

| | 1440 | 390 |
|---|---|---|
| Today | ![](appraisal-today-1440.png) | ![](appraisal-today-390.png) |
| Proposed | ![](appraisal-proposed-1440.png) | ![](appraisal-proposed-390.png) |
| Row detail, signed up | ![](appraisal-row-detail-1440.png) | |
| Row detail, not signed up | ![](appraisal-row-detail-not-signed-up-1440.png) | |
| Row detail, Military Campaigns missing | ![](appraisal-row-detail-permission-missing-1440.png) | ![](appraisal-row-detail-390.png) |
| Row detail, dismissed | ![](appraisal-row-detail-dismissed-1440.png) | |
| Row detail, no Character | ![](appraisal-row-detail-no-character-1440.png) | |
| Breakdown | ![](appraisal-breakdown-1440.png) | ![](appraisal-breakdown-390.png) |
| Breakdown, not signed up | ![](appraisal-breakdown-not-signed-up-1440.png) | |
| Breakdown, Military Campaigns missing | ![](appraisal-breakdown-permission-missing-1440.png) | |
| Breakdown, Autopilot waypoints missing | ![](appraisal-breakdown-waypoints-missing-1440.png) | |
| Copy menu | ![](appraisal-copy-menu-1440.png) | |

## Market item view (Market Browser)

"Turn in ~60k" sits after the spread and opens TurnInDetail. There is no note line.

| | 1440 | 390 |
|---|---|---|
| Today | ![](marketitem-today-1440.png) | |
| Proposed | ![](marketitem-proposed-1440.png) | |
| Open, signed up | ![](marketitem-detail-open-1440.png) | ![](marketitem-detail-open-390.png) |
| Not signed up | ![](marketitem-not-signed-up-1440.png) | |
| Military Campaigns missing | ![](marketitem-permission-missing-1440.png) | |

## Open Orders (Market › Open)

There is no extra line under any order.

- **SELL order whose turn-in beats its price:** What's wrong shows a new, lowest-precedence state, **TURN IN +2k each**. It counts as Watch and never toward "N orders need you". Do this reads **Turn in instead** and opens TurnInDetail.
- **A real problem still wins:** Stereo-Collapse Signal's undercut keeps the column.
- **BUY order:** its badge is unchanged. A dim glyph after the price opens TurnInDetail, which says "Pays you ~950k per 100 over this bid".

Rows belong to Kestrel Vane (signed up), Orsa Tellemar (not signed up) and Mira Solenne (no Military Campaigns).

| | 1440 | 390 |
|---|---|---|
| Today | ![](openorders-today-1440.png) | ![](openorders-today-390.png) |
| Mixed (Kestrel's Turn in instead open) | ![](openorders-mixed-1440.png) | ![](openorders-mixed-390.png) |
| Military Campaigns missing (Mira's buy glyph) | ![](openorders-permission-missing-1440.png) | ![](openorders-permission-missing-390.png) |
| Dismissed | ![](openorders-dismissed-1440.png) | |

## Assets

A dim glyph after a turn-in stack's value opens TurnInDetail ("You hold 340 · ~19.1M turned in"). ~~Haul to War HQ lines~~ — **dropped in review**: they looked out of place. Assets gets only the Hauling-style mark after the value; the popover's Set destination covers the trip.

| | 1440 | 390 |
|---|---|---|
| Today | ![](assets-today-1440.png) | |
| Mixed (Kestrel's detail open) | ![](assets-mixed-1440.png) | ![](assets-mixed-390.png) |
| Mira's detail (both Permissions missing) | ![](assets-permission-missing-1440.png) | |

## Hauling Opportunities (Market › Hauling)

A dim glyph after Sell at Jita opens TurnInDetail. The row is unchanged otherwise.

| | 1440 | 390 |
|---|---|---|
| Today | ![](hauling-today-1440.png) | |
| Detail open | ![](hauling-detail-open-1440.png) | ![](hauling-detail-open-390.png) |

## Overview widget: Military Campaigns

A new kind, added from the Gallery and not on the default board.

- **List** (default): objectives the Characters Participate in, of any type, with each Character's contribution and earnings, plus turn-ins for items they hold. Each row shows % filled. A turn-in row opens TurnInDetail.
- **Number** (Small): "~73.1M waiting to turn in".
- **Faction** setting: All / Amarr / Caldari / Gallente / Minmatar, in the ⋮ menu.
- **Some Characters lacking Military Campaigns:** the granted Characters' rows, plus one amber mark in the header naming the rest.
- **All lacking:** the board's needs-permission state.

| | 1440 | 390 |
|---|---|---|
| List | ![](widget-list-1440.png) | ![](widget-list-390.png) |
| Turn-in row open | ![](widget-list-turn-in-open-1440.png) | ![](widget-list-turn-in-open-390.png) |
| Number | ![](widget-number-view-1440.png) | |
| Faction = Caldari | ![](widget-caldari-only-1440.png) | |
| ⋮ menu (Faction setting) | ![](widget-settings-menu-open-1440.png) | |
| Some Characters missing | ![](widget-some-characters-missing-1440.png) | |
| Needs permission | ![](widget-needs-permission-1440.png) | |
| Empty | ![](widget-empty-1440.png) | |
| Gallery card | ![](widget-gallery-item-1440.png) | |
