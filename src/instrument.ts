import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { scrubBreadcrumb, scrubEvent } from './observability/scrub';

/**
 * Sentry's `init`, in a sidecar imported first by `main.tsx` — it has to run
 * before any other module so the SDK's global handlers are installed before
 * something can throw past them.
 *
 * No DSN means no Sentry: `init` is skipped entirely rather than called with
 * an empty string. `dev`, the unit suite and the Playwright build all run
 * without `VITE_SENTRY_DSN` (CI sets it on the deploy job only), and skipping
 * keeps the SDK from patching `fetch` under a suite whose whole point is that
 * nothing reaches the network.
 */
const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Same version string the "what's new" panel reads (vite.config.ts's
    // `define`), so an issue points at a release that exists.
    release: `neocom-desk@${__APP_VERSION__}`,

    /**
     * ADR 0001 is a browser-only app with no backend, and CLAUDE.md keeps
     * refresh tokens in Dexie and out of logs. Sentry is a log sink, so the
     * two collectors that would undo that are off: `httpBodies` would capture
     * the SSO token exchange's request and response bodies (refresh token in
     * both directions), and `userInfo` attaches the reporter's IP, which this
     * app has never collected and has no use for.
     */
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },

    integrations: [
      // Replaces browserTracingIntegration (the two are mutually exclusive):
      // this one names transactions after the route pattern, so every
      // character or plan id collapses into `/skills/plans/:planId` instead of
      // one transaction per id. React Router 7 in library mode — `App.tsx`
      // pairs it with `withSentryReactRouterV7Routing(Routes)`.
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],

    // Full rate while developing; sampled in production, where the traffic is
    // real and the quota is finite.
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,

    // Deliberately empty. Distributed tracing only pays off when the other end
    // is instrumented too, and nothing this app talks to is: ESI, the EVE SSO
    // and Firebase are all third-party origins, where an unexpected
    // `sentry-trace`/`baggage` header buys nothing and risks a CORS preflight
    // rejection on requests the app depends on.
    tracePropagationTargets: [],

    // Last line of defence for the SSO handshake — see observability/scrub.ts.
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}
