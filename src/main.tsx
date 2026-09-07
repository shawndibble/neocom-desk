// Must stay the first import: Sentry has to initialise before any other
// module gets a chance to throw. See src/instrument.ts.
import './instrument';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { reactErrorHandler } from '@sentry/react';
import { App } from './app/App';
import './i18n';
import './styles/index.css';

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
