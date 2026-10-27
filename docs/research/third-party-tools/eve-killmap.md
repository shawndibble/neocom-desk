# EVE Killmap — 3D killmail visualization

Thread: "Introducing EVE Killmap, a 3D spatial killmail visualization tool" https://forums.eveonline.com/t/introducing-eve-killmap-a-3d-spatial-killmail-visualization-tool/519675 (read 2026-10-07; 1 post, no replies). https://eve-killmap.com/about fetched, returned only data-source names (zKill, ESI, SDE).

## What it is

Hosted site (React + three.js, FastAPI, Postgres, Redis, daemonized zKill ingest). No login. Renders each killmail (x,y,z, positional since 2015) in a true-scale 3D system. Open source.

## Features

| Feature                                                                           | Tool does | Neocom Desk status                                          | Evidence |
| --------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------- | -------- |
| 3D system scene at true scale w/ every positioned kill since 2015, clustering     | yes       | OUT OF SCOPE: server-side kill DB, WebGL; vanity vs mission | post 1   |
| Time slider, playback                                                             | yes       | OUT OF SCOPE                                                | post 1   |
| Universe map colored by kill count/metrics, sov overlay (from verite.space)       | yes       | MISSING; no map in app                                      | post 1   |
| Live kill feed from zKill, filters (ship, weapon, character, corp, alliance, war) | yes       | PARTIAL: Pilot killmails (pilot-lookup.md); no live feed    | post 1   |
| Per-system stats from zKill, top systems/leaderboards                             | yes       | PARTIAL: Route Safety per-system counts (travel.md)         | post 1   |
| Share links, PNG, CSV export                                                      | yes       | HAVE share links + CSV exports across tables                | post 1   |

## Calculations / data

- Killmail position -> nearest celestial (zKill does this; Killmap renders the raw coordinates). Gate-camp geometry from positions (kills near gate vs station) could sharpen Gank Chokepoints, but needs ESI killmail positions; our list is hand-maintained, 7 systems (travel.md L485). Idea only, inferred.

## Candidate gaps

None worth ticketing. Possible tiny derivative: kill-position clustering to flag a gate camp. Confidence: inferred; low.

## Out of scope

3D rendering, playback, historical kill DB (needs server), leaderboards.

## Pitfalls

Author warns WebGL performance is poor on Firefox; PWA users on mobile would be worse. Avoid heavy WebGL for non-core features.
