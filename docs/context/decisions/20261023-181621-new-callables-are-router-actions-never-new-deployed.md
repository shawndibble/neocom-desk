# Scope decisions — New callables are router actions, never new deployed functions (issue #4608)

_Recorded 2026-10-23 · issue #4608._

- **A new callable is an action of a router, not a new deployed function.** A Cloud Functions deploy has a per-minute mutation quota, and every `export const` in `functions/src/index.ts` is one mutation. `callableRouter.ts` already serves the community, alerts and Corp Tax Book groups from one function each. SRP's 13 per-action functions were redundant copies of router actions and were removed before first use.
- **A source test enforces it.** `functions/src/deployedFunctions.test.ts` lists every deployed export. Adding one needs a reviewed entry, allowed only for a scheduled job, a Firestore or HTTP trigger, or a new router.
- **The older per-name community, Corp Tax Book and alerts exports are deleted too (issue #4673).** The routers have served them since #4668 and #4670, and production's client has called them through `callRouted` since. A tab on a bundle older than that gets `not-found`. This supersedes the "old exports stay until clients switch" note in `group-callables-behind-per-domain-routers`. `index.ts` now exports only the three routers, `mintFirebaseToken`, `mutamarketEstimate` and the scheduled jobs.
