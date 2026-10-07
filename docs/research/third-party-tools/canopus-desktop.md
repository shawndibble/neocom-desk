# Canopus 0.8 desktop companion

Thread: https://forums.eveonline.com/t/release-canopus-0-8-free-desktop-companion-for-windows-macos-fitting-with-dogma-engine-automatic-local-intel-overlay-market-industry/519237 | read 2026-10-07 (.json summary + github.com/GERCOG1390/canopus-desktop readme)

## What

Free MIT Electron app (Win/macOS). Fitting, combat sim, local/dscan intel overlay, travel, market, industry, character mgmt. Data: ESI, SDE, client chat/game logs, clipboard. SSO PKCE, tokens encrypted locally. Replies not itemised in summary.

## Features

| Feature                                                             | Tool does           | Neocom Desk           | Evidence                                                                                   |
| ------------------------------------------------------------------- | ------------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| Fitting w/ dogma engine, EHP, cap stability, skills, damage profile | yes                 | HAVE                  | features/fittings.md (`@eveshipfit/dogma-engine`)                                          |
| Hover module -> stat diff preview                                   | yes                 | not verified          | fittings.md summary has Compare (3 fits) only; check                                       |
| EFT import/export, in-game fit save                                 | yes                 | HAVE                  | fittings.md (Import, Save to EVE)                                                          |
| Popular fits from zKillboard                                        | yes                 | PARTIAL               | fittings.md imports killmail; no "popular fits for hull" browse                            |
| Combat simulator (map, positioning, ammo)                           | yes                 | MISSING               | not in docs; heavy, vanity-ish                                                             |
| Local scan analysis w/ reputation/threat                            | yes (clipboard/log) | PARTIAL               | pilot-lookup.md = single pilot; no paste-a-Local-list bulk mode found                      |
| Intel-channel parse, d-scan, fleet window                           | yes (game logs)     | OUT OF SCOPE          | needs client log files/overlay                                                             |
| Always-on-top overlay, Discord webhooks                             | yes                 | OUT OF SCOPE          | overlay/desktop; webhooks need server                                                      |
| Route safety (kills/pods/camps)                                     | yes                 | HAVE                  | features/travel.md                                                                         |
| Capital jump planner w/ fuel + fatigue                              | yes                 | MISSING               | grep fatigue: nothing in docs/features; Jump Basis in travel.md is something else (verify) |
| Wormhole analyzer (class, mass, lifetime), EVE-Scout Thera/Turnur   | yes                 | PARTIAL               | travel.md has EVE-Scout Thera/Turnur + hole rows; no mass/class lookup                     |
| 3D galaxy map                                                       | yes                 | OUT OF SCOPE (vanity) | we have Route strip                                                                        |
| 5-hub price compare + arbitrage w/ margins                          | yes                 | HAVE                  | market.md Hauling "hub price-gap scan", Appraisal Compare Hubs                             |
| Manufacturing/reaction calculators, job tracking                    | yes                 | HAVE                  | industry-records-sourcing.md (jobs panel, plans)                                           |
| Blueprint library across chars                                      | yes                 | HAVE                  | industry-records-sourcing.md All owned                                                     |
| Corp structure fuel alerts, moon extraction timers                  | yes                 | HAVE                  | alerts.md/corp.md (fuel), calendar.md (moon chunks)                                        |
| Skill queue/planner, optimal remap                                  | yes                 | HAVE                  | skills.md (competitors.md covers)                                                          |
| Asset valuation at Jita                                             | yes                 | HAVE                  | assets.md                                                                                  |
| Signature tracking across systems                                   | yes                 | MISSING               | not in docs; unclear value                                                                 |
| zKill stats per pilot                                               | yes                 | HAVE                  | pilot-lookup.md                                                                            |

## Calculations worth borrowing

- Jump fatigue/cooldown + fuel (isotopes) per jump from SDE (jump drive range, fuel per LY via hull attrs, JDC/JFC skills). Pure SDE math, browser-feasible.
- Dogma live-diff on hover (UX only; engine already ours).

## Candidate gaps

1. Capital jump planner (range, fuel, fatigue timeline) - fits Ships/Travel; needs SDE + character skills. Inferred (not confirmed in docs/features).
2. Paste Local list -> bulk Pilot Lookup (names -> ESI /universe/ids -> zkill stats). Feasible browser-only; Canopus does it via logs/clipboard.
3. Wormhole type reference (mass/lifetime/size) - SDE; partial in travel hole rows.

## Out of scope

Overlay, chat-log intel, d-scan parsing from logs, combat sim, Discord webhooks, 3D map.
