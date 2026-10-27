# Atlas (lgi.tools)

Thread: "Atlas - lgi.tools mapper looking for feedback and testers" https://forums.eveonline.com/t/atlas-lgi-tools-mapper-looking-for-feedback-and-testers/517740 (read 2026-10-07; 4 posts, all read; opening post read in full; update of 2026-09-28 has only a screenshot). lgi.tools fetch hit HTTP 429, not read. Hosted on convex.dev (real-time shared DB). Multi-tool: wormhole mapper + industry planner + skill queue pages.

| Feature                           | Tool does                                                                                                                                                                                                                                                | Neocom Desk status                                                                                        | Evidence                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Collaborative real-time WH mapper | Paste scan signatures; auto-ID by elimination vs statics; jump-detect which hole; shared live map                                                                                                                                                        | OUT OF SCOPE: shared real-time server state, no tokens/servers rule; Tripwire/Pathfinder own it           | -                                      |
| Site values                       | Gas/ore sites priced at Jita 4-4 sell (junk orders filtered); combat site sleeper breakdown (waves, DPS, volumes)                                                                                                                                        | MISSING; WH-specific, OUT OF SCOPE unless we do exploration                                               | -                                      |
| Shared price cache                | Fetch on view, store in DB, refresh if stale                                                                                                                                                                                                             | n/a: we use Fuzzwork + ESI with Dexie cache                                                               | industry-plans.md                      |
| Industry planner (T3)             | Blueprint + character + structure -> margins; nested tree grouped by tier (Tier 1 closest to final assembly); acquisition progress ring per quantity; click ring for have/need/where located; owned BPs and reaction formulas pulled into math, override | PARTIAL: tree + owned pool exist; per-tier grouped view and per-line "where it is" breakdown not verified | industry-plans.md; assets.md locations |
| Skill-queue pages                 | Unfinished                                                                                                                                                                                                                                               | HAVE (skills)                                                                                             | skills.md                              |
| Distances to hubs from K-space    | Planned                                                                                                                                                                                                                                                  | HAVE-ish (jumps in travel)                                                                                | travel.md                              |

## Candidate gaps

1. Industry materials list grouped by build tier with per-material "have X, at <location>" drill (ring). Single tool, author's own words "nested trees are hard to read". Overlaps Group Rollup. Low-medium; inferred. Verify what our tree shows before filing.

## Pitfalls

- Author asks broad scopes "because the whole multi-tool shares one login"; our per-area opt-in model is the better answer.
- Hosting cost for real-time features; community scepticism about tools disappearing (post 2). Our no-server design avoids both.
- Map layout reshuffles when nodes change: avoid non-stable layouts in any graph view.

## Out of scope

Wormhole mapping, sleeper site data.
