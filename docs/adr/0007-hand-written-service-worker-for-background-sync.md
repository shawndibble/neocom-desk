# 0007 — Hand-written service worker (`injectManifest`) for notification background sync

## Status

Accepted (2026-09-01). Superseded by ADR 0009 (2026-09-03): Periodic Background
Sync never delivered — Chrome floors `periodicsync` at 12 hours and gates it on
Site Engagement. The hand-written service worker this ADR introduced is kept,
for Web Push instead.

## Context

The PWA setup (`vite-plugin-pwa`) uses `generateSW`: a fully auto-generated
service worker with no room for custom code. Delivering notifications while
the app isn't open needs a `periodicsync` event handler, which only the
`injectManifest` strategy supports — a hand-written `src/sw.ts` that Workbox
injects its precache manifest into.

## Decision

Switch from `generateSW` to `injectManifest`. The service worker becomes
hand-maintained code the team owns instead of a black box the plugin fully
generates.

## Consequences

- Precaching, the update-prompt flow (`ReloadPrompt.tsx`), and offline
  routing must be re-declared explicitly in `src/sw.ts` instead of coming for
  free from `generateSW`'s defaults.
- The SW's own scheduling/orchestration code isn't unit-testable the way
  `src/engine` is — it needs live-browser/E2E-style verification. The actual
  per-Notification-Event diff logic stays in `src/engine`, pure and TDD'd;
  only the periodic-sync shell that calls it lives in the SW.
- Periodic Background Sync itself is Chrome/Edge desktop+Android only (no
  Safari/Firefox) and runs on a browser-decided schedule — this SW investment
  buys background notification delivery only on that subset of installs, as
  a best-effort supplement to the Foreground Poller, never a replacement.
