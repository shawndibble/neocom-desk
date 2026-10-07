# EVE Omni 4.0.67 beta — Windows desktop companion

Thread: "RELEASE: EVE Omni 4.0.67 Beta - free all-in-one desktop companion (multi-client preview, in-game overlay, trading, mining, PvP intel & more)" https://forums.eveonline.com/t/release-eve-omni-4-0-67-beta-free-all-in-one-desktop-companion-multi-client-preview-in-game-overlay-trading-mining-pvp-intel-more/519642 (read 2026-10-07; 1 post, no replies). GitHub readme https://github.com/Nareya79/eve-omni read for scopes/data sources. No formulas published (only claims).

## What it is

Open-source (MIT) Windows desktop app, ESI + zKill + DOTLAN + EVE-Scout. Local-only data. Scopes listed include wallet, assets, structures, orders, contracts, jobs, blueprints, mining, planets, location, clones/implants, contacts, standings, ui.write_waypoint, ui.open_window.

## Features

| Feature                                                                                        | Tool does       | Neocom Desk status                                                                                                                     | Evidence |
| ---------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Multi-client window preview, Tab switching                                                     | window capture  | OUT OF SCOPE (OS windows)                                                                                                              | post 1   |
| In-game overlay, Stream Deck plugin                                                            | overlay windows | OUT OF SCOPE (desktop overlay)                                                                                                         | post 1   |
| Market scanner hub to hub                                                                      | yes             | HAVE Hauling tab (market.md "Hauling")                                                                                                 | post 1   |
| My trades: real net profit per unit and total                                                  | after tax/fees  | HAVE realized margin FIFO (market.md "Realized margin")                                                                                | post 1   |
| Orders, contracts, sell check                                                                  | yes             | HAVE                                                                                                                                   | post 1   |
| Watchlist: bought / in transit / selling                                                       | tracker         | PARTIAL: Hauling Trip Plan + open orders; no bought-in-transit pipeline                                                                | readme   |
| Mining ledger all chars, ore/ice/gas/moon value per m3 with real refining yield                | yes             | HAVE ledger, refine floor math (mining.md); per-m3 ranking not found                                                                   | post 1   |
| "Which ore is best for the minerals I need"                                                    | ore chooser     | PARTIAL: CONTEXT.md mentions; per-mineral target not in mining.md                                                                      | post 1   |
| Paste local -> instant threat check via zKill                                                  | yes             | MISSING (Pilot Lookup is single-pilot; no paste list)                                                                                  | post 1   |
| Live gang alarm: kills near my characters                                                      | yes             | MISSING: Alerts has structure/wallet/order events, no nearby-kill alert (needs polling zKill/ESI); partly OUT OF SCOPE when app closed | post 1   |
| Kills/jumps per system, dangerous systems on route                                             | yes             | HAVE Route Safety (travel.md)                                                                                                          | post 1   |
| Copy any ship fitting to EVE                                                                   | yes             | HAVE fittings export (fittings.md)                                                                                                     | post 1   |
| Route + jump planner, region map, jump bridges, Thera/Turnur                                   | yes             | PARTIAL: route, Ansiblex, Thera HAVE; jump (capital) planner and region map MISSING                                                    | post 1   |
| Hauling, industry & blueprints, PI w/ extractor alarms, skills, clones/implants, wallet/assets | yes             | HAVE (alerts.md planetaryExtractorExpiring; skills, clones docs)                                                                       | post 1   |
| Settings sync, demo mode                                                                       | yes             | HAVE sync-backup.md; demo mode not checked                                                                                             | post 1   |
| Set waypoint / open market window in game                                                      | ESI UI scopes   | PARTIAL: check travel.md for waypoint; not found in docs                                                                               | readme   |

## Calculations worth borrowing

None specified beyond claims. Refining yield from real skills (we do), net profit after fees (we do).

## Candidate gaps

- Local-paste threat check (also Omnitool D-Scan, Wayfinder D-Scan). Confidence: confirmed in thread; feasibility inferred (names -> ESI /universe/ids -> zKill stats; zk calls browser-side have CORS/rate caveats, we already use zk in Route Safety).
- Capital jump planner (also Console). Confidence: confirmed (thread + Console readme).
- "Kills near me" alert. Confidence: inferred.

## Out of scope

Overlay, window preview, Stream Deck, global hotkeys, anything needing game client focus.

## Pitfalls

Unsigned Windows build (SmartScreen warning) — irrelevant to a PWA, an advantage to note.
