# Wayfinder (EveApps) — wormhole mapper

Thread: "Wayfinder - an EveApps mapping tool" https://forums.eveonline.com/t/wayfinder-an-eveapps-mapping-tool/517623 (read 2026-10-07 via .json, 21 posts). Site https://evewayfinder.app is a JS shell; WebFetch returned only the tagline, so features below come from the thread only.

## What it is

Hosted (5-server) multi-user wormhole mapper, successor to a public Pathfinder. Free: 1 map, 50 systems, share with corp + 5 characters; paid (ISK) for 300 systems, alt tracking, alliance sharing. Needs a server holding tokens (location worker polls ESI for every tracked character).

## Features

| Feature                                                                                     | Tool does                         | Neocom Desk status                                                                                                                                                     | Evidence              |
| ------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Shared WH chain map, auto-add systems on jump                                               | location worker tracks characters | OUT OF SCOPE: shared state + server-held tokens (CLAUDE.md: no server holds tokens)                                                                                    | posts 1, 5, 11-15     |
| Signature paste from probe scanner                                                          | paste -> sigs                     | OUT OF SCOPE (needs map)                                                                                                                                               | post 3                |
| Route Shortest/Safest/Less Secure, avoid system, set destination, multi-character "Set All" | yes                               | HAVE route prefs + Avoided Systems (docs/features/travel.md "Route rules panel"); set-destination: no evidence in travel.md                                            | post 2                |
| Per-system kills 24h from zKill, kill feed w/ flags, consolidated kill report               | yes                               | PARTIAL: last-hour ESI + zKill counts per route system, interdictor/smartbomb tags (travel.md "zKillboard (recentKills)"); no per-system feed                          | post 2                |
| PvP activity by day-of-week: kills/hour from up to 90 days zKill                            | yes                               | MISSING                                                                                                                                                                | post 2                |
| D-Scan paste -> 15-min ship list chip; structures list from d-scan                          | yes                               | MISSING (grep docs/features: no d-scan)                                                                                                                                | posts 4, 10           |
| FC panel: where everyone is + ship                                                          | yes                               | OUT OF SCOPE (shared)                                                                                                                                                  | post 4                |
| Discord webhooks + browser notifications w/ tab closed (kills, sov timers, EOL, structures) | server-side                       | OUT OF SCOPE for Discord (notifications.md Q1: CCP has no webhooks, backend can't hold refresh tokens, ADR 0001). Browser push: HAVE scheduled push (notifications.md) | post 18               |
| Watchlist by hole type/effect/destination/site                                              | yes                               | OUT OF SCOPE (mapper)                                                                                                                                                  | post 18               |
| Import/export Pathfinder/Wanderer/Nexum formats                                             | yes                               | OUT OF SCOPE                                                                                                                                                           | post 1                |
| System notes, multi-delete, in-map support tickets                                          | yes                               | n/a                                                                                                                                                                    | posts 6-8, 16, 19, 20 |

## Calculations / data

- zKill: kills-by-hour-of-week histogram over 90 days per system (post 2). We use zk only for last-hour regional kills (travel.md data table).
- Sov timers, EOL (wormhole life) as alert types.

## Pitfalls from replies

- Tracking scope "Wormholes" silently skipped auto-adding systems (post 11-15, fixed same day).
- Users wanted per-system notes; dev dropped the notes field in a UI rewrite then restored (post 6-16). Lesson: free-text note per system is a table-stakes ask in mappers.
- Prior Pathfinder used data that "didn't line up with game data" and broke on SDE import of new gates (post 1). Pitfall: SDE refresh must not break on new systems/gates.

## Candidate gaps

- Activity heat by hour/day for a system on Route Safety (low; zKill 90-day pull is heavy for browser-only). Confidence: confirmed in thread; value inferred.
- D-Scan paste summary: see eve-omni.md / eve-omnitool.md (shared, 3 tools).

## Out of scope

Shared mapper, server-side Discord, FC panel, sig database: need server, shared state, or long-lived tokens.
