# MONW

Thread: "MONW - a free industry tool that got out of hand. Everyone welcome, and I'd love your ideas" https://forums.eveonline.com/t/monw-a-free-industry-tool-that-got-out-of-hand-everyone-welcome-and-id-love-your-ideas/519042 (read 2026-10-07; 2 posts, both read; posts are intro + a video link; no replies). monw.dk fetch returned only section headings (Features, Formulas, Data Sources, ESI Scopes, Changelog) without content; formulas not readable. Videos not watched. ~250 pilots, 800+ characters. Server-backed (login via SSO, corp sharing).

| Feature                                                               | Tool does                                                            | Neocom Desk status                                                                                                 | Evidence                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Per-character skills for job time                                     | Uses own skills                                                      | HAVE                                                                                                               | industry-plans.md `time`, skill gate                       |
| ME/TE per blueprint                                                   | Owned blueprints                                                     | HAVE                                                                                                               | industry-records-sourcing.md                               |
| Hangars -> shopping list only for what you lack                       | Owned assets netted                                                  | HAVE (owned pool, Group Owned Overlay)                                                                             | industry-plans.md                                          |
| Structure + rigs, "job cost formula done right"                       | System cost index, rigs, taxes                                       | HAVE (rigMatch/rigFit, jobCost)                                                                                    | industry-plans.md tests list                               |
| Blueprint library across all characters                               | Cross-character                                                      | HAVE (Records, multi-Character)                                                                                    | industry-records-sourcing.md                               |
| Net worth over time, all characters                                   | Wallet + assets history chart                                        | PARTIAL: wallet balance history chart (active Character only); no assets valuation history, no all-character total | wallet.md "Balance history", README.md cross-cutting gap 4 |
| Market order checks                                                   | Order status                                                         | HAVE (Open Orders, undercut alerts)                                                                                | market.md, alerts.md                                       |
| Mining, PI                                                            |                                                                      | HAVE                                                                                                               | mining.md, planetary-industry.md                           |
| "Feed that watches what the game is losing" -> what is worth building | Build ideas from market signals                                      | PARTIAL: Build Opportunities ranks owned BPs by ISK/h; no loss/demand feed (zKill destroyed volume)                | CONTEXT.md Build Opportunities                             |
| IRIS assistant (bring your own API key)                               | LLM answers on own data                                              | OUT OF SCOPE: key handling, not companion core                                                                     | -                                                          |
| Corp: BPOs vs corp hangar plan                                        | Director views                                                       | PARTIAL: corp assets browsable, corp jobs/structures board; no plan-against-corp-hangar                            | corp.md                                                    |
| Free job slots per member; assign job to member with skills           | Corp job routing                                                     | MISSING (and needs members' tokens => server)                                                                      | corp.md                                                    |
| Corp stockpile targets                                                | Shortfall in hangar                                                  | MISSING                                                                                                            | no stockpile in docs                                       |
| Moon drills: next pull                                                |                                                                      | HAVE (moon extraction card)                                                                                        | corp.md Kind Cards                                         |
| Opt-in scopes per feature; small core set                             | Core: assets, skills, blueprints, jobs, wallet, mining; rest toggles | HAVE (15 Permissions, optional per area)                                                                           | app-shell.md, auth-login.md                                |

## Candidate gaps

1. All-Character net worth over time (wallet + asset value snapshots): MONW demo video, jEveAssets also has it (competitors.md). Feasible browser-only, Dexie snapshots; needs scheduled capture while app is open or the push backend. Overlaps README gap 4 (cross-Character reach).
2. Corp stockpile targets (set min qty per type, show hangar shortfall): corp-only, director tooling, scope questionable vs CONTEXT.md corp scope; low confidence.

## Pitfalls

- Dev invites ideas; no complaints in thread. Server holds tokens, unlike ours. Nothing to learn on formulas (unreadable).

## Out of scope

IRIS LLM, member job assignment (other members' tokens).
