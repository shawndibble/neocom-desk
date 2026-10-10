// Must stay the first import: Sentry has to initialise before any other
// module gets a chance to throw. See src/instrument.ts.
import './instrument';
// Second, so a returning user's signed-in shell chunks start fetching before
// the rest of the entry evaluates. See src/app/bootShellPreload.ts.
import './app/bootShellPreload';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { reactErrorHandler } from '@sentry/react';
import { App } from './app/App';
import { installInputModality } from './app/inputModality';
import { installTranslateGuard } from './app/translateGuard';
import { recoverFromStaleBuild } from './app/staleBuildRecovery';
import './i18n';
import './styles/index.css';

// Routes load as separate chunks (`app/routeChunks.ts`), and a chunk can fail
// to fetch — typically a deploy replaced its hashed file while this tab still
// ran the old entry, or the service worker's precache still serves the old
// `index.html`. Vite announces that as `vite:preloadError`. A plain reload
// cannot cure the second case, so drop the worker and its caches first
// (`app/staleBuildRecovery.ts`). Once per minute at most, so a chunk that is
// genuinely unreachable (offline, a broken deploy) falls through to the
// route's error boundary instead of looping.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  void recoverFromStaleBuild();
});

installTranslateGuard();
installInputModality();

// React 19 reports render errors through these three root hooks rather than
// through `window.onerror`: `onCaughtError` fires for anything `ErrorBoundary`
// catches, `onUncaughtError` for a throw that escapes every boundary, and
// `onRecoverableError` when React retries and survives. This is the only
// reporting hookup — `ErrorBoundary` itself deliberately does not also
// capture, which would file every boundary-caught error twice.
createRoot(document.getElementById('root')!, {
  onCaughtError: reactErrorHandler(),
  onUncaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <StrictMode>
    <App />
  </StrictMode>
);
