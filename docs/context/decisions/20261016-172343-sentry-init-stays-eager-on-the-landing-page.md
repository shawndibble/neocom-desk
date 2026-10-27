# Scope decisions — Sentry init stays eager on the landing page (issue #3967)

_Recorded 2026-10-16 · issue #3967._

- **`Sentry.init` stays first and eager** (`src/instrument.ts`). A CPU-profiled
  Lighthouse 13.5 trace (CPU ×12) shows Sentry's own frames block ~1–2 ms; init
  is ~4 ms of the entry task. The ~300 ms "vendor-sentry" long task Lighthouse
  reports is gtag's timer callback running inside Sentry's `setTimeout`
  wrapper, which Lighthouse blames on the outermost frame.
- **Deferring init would lose route-named transactions silently**:
  `withSentryReactRouterV7Routing(Routes)` (`App.tsx`) wraps at module load and
  returns the bare `Routes` when init has not run yet.
- **Not disabling the timer wrapping either**: it only renames the task in
  Lighthouse, blocks no less, and weakens error capture in timer callbacks.
  The real cost is gtag's, which stays untouched unless a cost case appears.
