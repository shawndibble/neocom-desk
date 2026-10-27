# Scope decisions — Sentry is the crash sink, and the SSO handshake never reaches it

_Recorded 2026-09-07._

- **Errors and traces go to Sentry, which narrows ADR 0001's "no backend" to
  "no backend the app depends on".** Until now a render throw hit
  `ErrorBoundary`, showed a reload screen and vanished — nobody could see that
  it had happened, let alone how often, because there was nowhere to send it.
  Sentry is a sink for that one signal. It does not become a dependency: no DSN
  means `instrument.ts` skips `init` altogether, which is how dev, the unit
  suite and the Playwright build all run, so every feature still works with
  Sentry entirely absent. What this rules out is treating Sentry as somewhere
  application data may live — it receives crashes and performance spans, never
  Skill Plans, Build Plans, tokens or cached ESI payloads.

- **The SSO handshake is scrubbed on the way out, in a tested pure module.**
  `/callback?code=…&state=…` is a live authorization code sitting in the
  address bar, and Sentry stamps the current URL onto every event and
  transaction it sends. `src/observability/scrub.ts` redacts that and the
  `*_token` family from URLs, breadcrumbs and error text, wired to `beforeSend`,
  `beforeSendTransaction` and `beforeBreadcrumb`. `dataCollection` then turns
  off the two collectors that would route around it: `httpBodies` (the token
  exchange's request and response bodies both carry the refresh token) and
  `userInfo` (the reporter's IP, which this app has never collected). The rule
  from CLAUDE.md is unchanged — refresh tokens live in Dexie only — and this is
  what keeps it true once a log sink exists.

- **Distributed tracing propagates to nothing.** `tracePropagationTargets` is
  deliberately empty rather than listing ESI, the EVE SSO or Firebase. Trace
  headers only pay off when the far end is instrumented too, and none of those
  are ours; sending `sentry-trace`/`baggage` to a third-party origin buys no
  trace and risks a CORS preflight rejection on requests the app needs.

- **Production traces are readable only when the deploy job holds a token.**
  Source-map upload is gated on `SENTRY_AUTH_TOKEN`, so a PR build, an agent
  worktree and a local `npm run build` all behave exactly as before. When the
  token is present the maps are built `hidden` and deleted after upload — `dist/`
  is published to GitHub Pages, so a `.map` left behind would be a public one.
