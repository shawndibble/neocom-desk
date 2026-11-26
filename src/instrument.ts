import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import * as Sentry from '@sentry/react';
import {
  isClosedDatabaseEvent,
  isStrayAbortEvent,
  markChunkLoadFailure,
  tagAnnotatedEvent,
} from './observability/reportFailure';
import { scrubBreadcrumb, scrubEvent } from './observability/scrub';
import { visitorTags } from './observability/visitor';
import { onCacheMiss } from './esi/cacheMissSignal';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: __APP_RELEASE__,

    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },

    integrations: [
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],

    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,

    tracePropagationTargets: [],

    beforeSend: (event, hint) =>
      isClosedDatabaseEvent(event) || isStrayAbortEvent(event)
        ? null
        : scrubEvent(markChunkLoadFailure(tagAnnotatedEvent(event, hint.originalException))),
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
