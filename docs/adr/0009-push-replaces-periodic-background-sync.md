# 0009 — Web Push replaces Periodic Background Sync; the hand-written service worker stays

## Status

Accepted (2026-09-03). Supersedes ADR 0007.

## Context

ADR 0007 switched `vite-plugin-pwa` from `generateSW` to `injectManifest` — a
hand-written `src/sw.ts` the team maintains — for one reason: `generateSW` has
no room for a `periodicsync` handler, and Periodic Background Sync was how
notifications were to fire while the app was closed.

That mechanism does not work. `registerPeriodicSync` asks for a 5-minute
`minInterval`, but Chrome enforces a floor of **12 hours** between
`periodicsync` events and gates them on the origin's Site Engagement score: a
score of zero suppresses them entirely, and the practical cadence for most
origins is 24-36 hours. The registration succeeds and the browser simply never
calls back. Verified against an installed PWA on Android, where every
precondition ADR 0007 named (installed, permission auto-granted, handler
registered) was satisfied and delivery still did not happen at any useful
cadence. A notification whose value is measured in minutes — a skill finishing,
a structure entering reinforcement — cannot be delivered by an API whose floor
is half a day.

## Decision

Retire Periodic Background Sync. Remove the `periodicsync` registration
(`src/app/backgroundSync.ts`) and its handler, and deliver background
notifications by Web Push instead (FCM, fired from a scheduled Cloud Function —
see ADR 0010 for what the backend does and does not know).

**Keep the hand-written service worker.** The `injectManifest` decision survives
its own justification: a `push` handler needs custom service-worker code for
exactly the reason a `periodicsync` handler did, and `sw.ts` also now owns the
`notificationclick` handler and the Notification Feed write on push receipt.
The consequences ADR 0007 accepted — precaching, the update-prompt flow and
offline routing re-declared by hand; orchestration code that is verified in a
real browser rather than unit-tested — are unchanged and still paid.

## Consequences

- Background delivery stops being Chrome/Edge-only. Web Push reaches Safari and
  Firefox, and iOS 16.4+ delivers to an installed home-screen PWA — a platform
  ADR 0007 explicitly could not serve.
- Delivery now depends on a backend being reachable, where Periodic Background
  Sync depended only on the browser. The foreground poller remains the
  fallback, as it was under ADR 0007.
- ADR 0007's warning that the service-worker investment "buys background
  notification delivery only on that subset of installs" is withdrawn: it
  bought none. The investment is retained because Web Push needs the same
  hand-written worker, not because the original bet paid off.
