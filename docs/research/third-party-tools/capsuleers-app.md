# Capsuleers.app EHUB

Thread: https://forums.eveonline.com/t/capsuleers-app-all-you-need-in-one-website-the-eve-online-ehub/517303 | read 2026-10-07 (.json summary only; site not fetched)

## What

Server-backed hub, 30+ tools: fleet/battle reports, pilot intel, sov map, killboard with own 90-day killmail archive, camp radar, Thera/Turnur finder, push alerts, AI assistant. Mostly corp/alliance and combat intel, not own-character.

## Features

| Feature                                                                                                         | Tool does   | Neocom Desk  | Evidence                                                                          |
| --------------------------------------------------------------------------------------------------------------- | ----------- | ------------ | --------------------------------------------------------------------------------- |
| Pilot intel                                                                                                     | yes         | HAVE         | pilot-lookup.md                                                                   |
| Thera/Turnur/Drifter finder                                                                                     | yes         | PARTIAL      | travel.md Thera/Turnur tab; no Drifter wormholes                                  |
| Camp radar (gate camps on map, which side)                                                                      | yes         | PARTIAL      | travel.md Gank Chokepoint + last-hour kills per system; no camp detection overlay |
| Asset Consolidator: multi-char, cargo hold fit, hauler assignment, repackaging, Safe/Short route avoiding camps | yes         | MISSING      | assets.md cross-char only in search; no consolidation plan                        |
| Browser push for sov timers, gate camps, hunts                                                                  | yes         | PARTIAL      | notifications.md push for 11 events; no camp/sov                                  |
| Tactical killboard, hunting grounds, Copy EFT                                                                   | yes         | OUT OF SCOPE | needs 90-day server killmail archive; zkill link exists                           |
| Fight On: large-fight detect (100+ pilots)                                                                      | yes         | OUT OF SCOPE | server stream                                                                     |
| Sov map, jump-range calculator                                                                                  | yes         | PARTIAL      | jump range = capital jump planner gap (see canopus-desktop.md); sov: corp scope   |
| Live map + killfeed, ccpwgl ship 3D, content creator pings/overlays, games, AI assistant                        | yes         | OUT OF SCOPE | vanity/server                                                                     |
| Industry tools                                                                                                  | listed only | unknown      | no detail in thread                                                               |

## Calculations worth borrowing

- Asset consolidation: sum item volumes (SDE packaged volume, repackaged where assembled) per source location, pick ship by cargo/ship-maintenance-bay, route via safe/short with camp avoidance. Data: ESI assets + SDE volumes + existing Route Safety. Browser-feasible.
- Solo/large-fight thresholds not useful.

## Candidate gaps

1. Asset consolidation / move planner across alts (volume, hauler fit, route safety) - confirmed in thread; our Hauling/Courier planners and Route Safety already supply parts.
2. Jump range calculator (shared with Canopus) - see canopus-desktop.md.

## Out of scope

Anything needing a server-side killmail archive or live streams; fleet/battle reports; AI assistant; 3D.
