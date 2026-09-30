import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { scrubBreadcrumb, scrubEvent } from './observability/scrub';
import { visitorTags } from './observability/visitor';
import { onCacheMiss } from './esi/cacheMissSignal';

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
    // Must match the shipped build, so an issue points at a release that
    // exists — and at the sourcemaps uploaded for it. Carries the commit, so
    // a report can be placed before or after a given fix.
    release: __APP_RELEASE__,

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

  Sentry.setTags({
    ...visitorTags(
      () => localStorage,
      () => sessionStorage,
      Date.now()
    ),
  });

  /**
   * One span per read-through load that goes to ESI, saying why the cache did
   * not answer (`cacheMissSignal.ts`). Sentry's "N+1 API Call" detector sees
   * only the requests; this is what tells a first visit's cold fan-out from a
   * cache that should have answered.
   *
   * `onlyIfParent`: a miss outside a page transaction (notification polls,
   * background sweeps) would otherwise start its own trace and spend quota.
   * The browser SDK has no async context, so the `http.client` spans sit
   * beside this one in the trace rather than under it.
   */
  onCacheMiss((miss) => {
    const span = Sentry.startInactiveSpan({
      name: `cache miss ${miss.family}`,
      op: 'cache.miss',
      onlyIfParent: true,
      attributes: {
        'cache.key_family': miss.family,
        'cache.reason': miss.reason,
        'cache.global': miss.global,
      },
    });
    return () => span.end();
  });
}
