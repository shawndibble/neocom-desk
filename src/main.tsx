// Must stay the first import: Sentry has to initialise before any other
// module gets a chance to throw. See src/instrument.ts.
import './instrument';
// Second, so a returning user's signed-in shell chunks start fetching before
// the rest of the entry evaluates. See src/app/bootShellPreload.ts.
import './app/bootShellPreload';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { reactErrorHandler, withScope } from '@sentry/react';
import { App } from './app/App';
import { BootCoverHost } from './app/BootCoverHost';
import { BootUpdateGate } from './app/BootUpdateGate';
import { hideBootCover, showBootCover } from './app/bootCover';
import { installInputModality } from './app/inputModality';
import { isRouteChunkFailure } from './app/routeChunks';
import { LANDING_SHELL_BACKSTOP_MS, releaseLandingShell } from './app/landingShell';
import { installTranslateGuard } from './app/translateGuard';
import {
  canRecoverFromStaleBuild,
  defaultStaleBuildEnv,
  isRecoveringFromStaleBuild,
  recoverFromStaleBuild,
} from './app/staleBuildRecovery';
import './i18n';
import './styles/index.css';

// Routes load as separate chunks (`app/routeChunks.ts`), and a chunk can fail
// to fetch — typically a deploy replaced its hashed file while this tab still
// ran the old entry, or the service worker's precache still serves the old
// `index.html`. Vite announces that as `vite:preloadError`. A plain reload
// cannot cure the second case, so drop the worker and its precache first
// (`app/staleBuildRecovery.ts`). Whether to cancel the failure
// (`preventDefault`) is decided here, synchronously, and only when a recovery
// will follow: offline, or once per minute (a genuinely unreachable chunk, a
// broken deploy), the failure is left alone, the import rejects, and the
// route's error boundary renders. A recovery whose network probe then fails
// (online, but no route to the host) purges nothing, and `guarded` rejects the
// cancelled import into the same boundary.
window.addEventListener('vite:preloadError', (event) => {
  // Vite fires this once per failed dependency; follow-ups to a recovery
  // already running are cancelled too, not rejected into the error boundary.
  if (isRecoveringFromStaleBuild()) {
    event.preventDefault();
    return;
  }
  const env = defaultStaleBuildEnv();
  if (!canRecoverFromStaleBuild(env)) return;
  event.preventDefault();
  // Cover the page so the purge-and-reload reads as a boot; uncover if it declined.
  showBootCover();
  void recoverFromStaleBuild(env).then((reloading) => {
    if (!reloading) hideBootCover();
  });
});

installTranslateGuard();
installInputModality();

// React 19 reports render errors through these three root hooks rather than
// through `window.onerror`: `onCaughtError` fires for anything `ErrorBoundary`
// catches, `onUncaughtError` for a throw that escapes every boundary, and
// `onRecoverableError` when React retries and survives. This is the only
// reporting hookup — `ErrorBoundary` itself deliberately does not also
// capture, which would file every boundary-caught error twice.
// The prerendered landing hero (`app/landingShell.ts`) hides `#root` until
// the first real screen lets it go. A render error shows `#root` at once, so
// the error screen is never stuck behind it, and the timer is the backstop for
// anything else that keeps that screen from arriving.
const reportError = reactErrorHandler();
function releaseAndReport(...args: Parameters<typeof reportError>) {
  releaseLandingShell();
  if (!isRouteChunkFailure(args[0])) return reportError(...args);
  // A lone failed chunk is usually the visitor's network or a blocker; a burst
  // after a deploy is a broken release, which a Sentry alert on this tag counts.
  withScope((scope) => {
    scope.setLevel('warning');
    scope.setTag('chunk_load', 'failed');
    reportError(...args);
  });
}
setTimeout(releaseLandingShell, LANDING_SHELL_BACKSTOP_MS);

createRoot(document.getElementById('root')!, {
  onCaughtError: releaseAndReport,
  onUncaughtError: releaseAndReport,
  onRecoverableError: reactErrorHandler(),
}).render(
  <StrictMode>
    <BootUpdateGate>
      <App />
    </BootUpdateGate>
    <BootCoverHost />
  </StrictMode>
);
