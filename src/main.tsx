// Must stay the first import: Sentry has to initialise before any other
// module gets a chance to throw. See src/instrument.ts.
import './instrument';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { reactErrorHandler } from '@sentry/react';
import { App } from './app/App';
import './i18n';
import './styles/index.css';

// Routes load as separate chunks (`app/routeChunks.ts`), and a chunk can fail
// to fetch — typically a deploy replaced its hashed file while this tab still
// ran the old entry and the service worker's precache missed it. Vite
// announces that as `vite:preloadError`; reloading picks up the current build.
// Once per minute at most, so a chunk that is genuinely unreachable (offline,
// a broken deploy) falls through to the route's error boundary instead of
// looping.
const PRELOAD_RELOAD_KEY = 'neocom:preload-reload-at';
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

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
