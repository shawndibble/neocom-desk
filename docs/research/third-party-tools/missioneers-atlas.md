# Missioneers' Atlas

Thread: "Missioneers' Atlas - Agent finder, mission guide lookup, system intel, mission planning, LP store, routing" https://forums.eveonline.com/t/missioneers-atlas-agent-finder-mission-guide-lookup-system-intel-mission-planning-lp-store-routing/518578 (read 2026-10-07, via .json; 5 posts, all read). Site missionatlas.site: SPA, fetch returned only UI shell text, no changelog. Feature list below is from the opening post + 3 update posts.

What it is: single static HTML page (13 MB initial, lazy 9.7 MB mission data + 7 MB LP offers), no backend/login. Data: SDE + ESI + zKillboard. Mission-runner planning.

| Feature                             | Tool does                                                                                                                                                   | Neocom Desk status                                                                                                   | Evidence                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| LP Store Finder                     | Search item name across ALL NPC LP offers; shows corps selling, LP cost, ISK cost, required items; faction -> corp filter                                   | PARTIAL: per-corp store browse, ISK/LP ranking, filters, search inside one store. No cross-corp "who sells X" search | docs/features/market.md section 5 (store picker, offers list, search) |
| Nearest LP Store                    | Origin system + faction/corp -> stations ranked by jumps                                                                                                    | MISSING                                                                                                              | grep: no LP-by-distance in market.md                                  |
| Agent Finder                        | Filter by origin, max jumps, sec range, level 1-5, type (Basic/Event/Locator), region, constellation, division, faction, corp; shows station                | MISSING                                                                                                              | no agent data in any docs/features file                               |
| Mission Hub Discovery               | Systems ranked by L3/L4/L5 agent counts, divisions, corps                                                                                                   | MISSING                                                                                                              | same                                                                  |
| Mission Browser/Query               | 2,892 SDE missions: dialogue text, rewards, enemy faction, kill/courier; EVE Uni wiki link (880 of 1,702 missions have a direct page; rest search/disambig) | MISSING                                                                                                              | no mission content in docs                                            |
| System Intel: zKill 48h             | Ship/NPC/total kills, ISK destroyed, top 5 corps per system                                                                                                 | PARTIAL: last-hour ESI ship/pod/NPC kills + jumps + zKill count per route system                                     | docs/features/travel.md (Route Safety table)                          |
| 7-day / monthly activity heatmap    | Timezone heatmap of active corps per system                                                                                                                 | MISSING (needs zKill history per system; heavy)                                                                      | travel.md has no heatmap                                              |
| ESI query panel                     | Raw endpoint console                                                                                                                                        | OUT OF SCOPE: dev toy                                                                                                | -                                                                     |
| Star map + route planner            | Click system for sec/region/stations/agents                                                                                                                 | HAVE (route planner), no star map                                                                                    | travel.md                                                             |
| Modals minimize, popup item details | UX                                                                                                                                                          | n/a                                                                                                                  | posts 3-4                                                             |

## Calculations / data worth borrowing

- SDE agent tables (agents, divisions, levels, locator flag) joined to station -> system -> our stargate graph gives jump distance. Static, browser-only feasible. We already ship an SDE snapshot + local stargate graph (travel.md "Local stargate graph").
- EVE Uni wiki deep-link per mission name (880/1,702 direct) as a cheap link-out.

## Candidate gaps

1. LP Store: "Where can I buy X with LP" cross-corp search + "nearest store selling it" by jumps from home system. Overlap: our LP Store is single-corp. Feasible: offers public ESI `/loyalty/stores/{corp}/offers/` per corp (many corps = many calls; or prebuilt snapshot like our other SDE-derived Firestore snapshots).
2. Agent finder (L4 security missions near home, by corp for LP). Only thread with it; mission runners are a real audience but not core to our listed areas. Confidence moderate-low.

## Pitfalls

- 13 MB first load, single file. Avoid shipping big datasets eagerly; lazy-load (we already chunk routes).
- Replies: one fan reply only; no bug reports. Little validation of demand beyond the author.

## Out of scope

ESI console; Chinese/English global search (we are English only per CLAUDE.md).
